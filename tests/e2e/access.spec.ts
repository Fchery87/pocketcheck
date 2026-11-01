import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { expect, test } from "./fixture.ts";
import { browserFixture } from "../../src/lib/server/verification.ts";
import { verificationEnv } from "../../scripts/verification-env.ts";
import { browserPorts } from "../../scripts/browser-port.ts";

test("production launcher protects pages, data, mutations and exports until login and after logout", async ({
  browser,
  playwright,
}) => {
  test.setTimeout(60_000);
  const port = browserPorts(process.env).launcher;
  const origin = `http://127.0.0.1:${port}`;
  const secret = randomUUID().replaceAll("-", "") + randomUUID().replaceAll("-", "");
  const identity = `browser-${randomUUID()}`;
  let child: ChildProcess | undefined;
  const context = await browser.newContext({ baseURL: origin });
  const anonymous = await playwright.request.newContext({ baseURL: origin });
  try {
    child = spawn(
      process.execPath,
      [
        "--import",
        "./scripts/reject-outbound.mjs",
        "--experimental-strip-types",
        "scripts/start.ts",
      ],
      {
        env: {
          ...verificationEnv(),
          ...browserFixture,
          POCKETCHECK_TEST_JOURNAL_ID: identity,
          HOST: "127.0.0.1",
          PORT: String(port),
          POCKETCHECK_ACCESS_SECRET: secret,
        },
      },
    );
    const processHandle = child;
    await new Promise<void>((resolve, reject) => {
      let logs = "";
      let errors = "";
      const timeout = setTimeout(
        () => reject(new Error(`Protected launcher timeout. ${errors}`)),
        30_000,
      );
      processHandle.stderr!.on("data", (chunk) => {
        errors += chunk;
      });
      processHandle.stdout!.on("data", (chunk) => {
        logs += chunk;
        if (logs.includes("Listening on")) {
          clearTimeout(timeout);
          resolve();
        }
      });
      processHandle.once("exit", (code) => {
        clearTimeout(timeout);
        reject(new Error(`Protected launcher exited ${code}. ${errors}`));
      });
    });
    for (const path of ["/", "/journal/export", "/__verification"]) {
      const response = await anonymous.get(path, { maxRedirects: 0 });
      expect(response.status()).toBe(303);
      expect(response.headers().location).toBe("/login");
    }
    expect((await anonymous.get("/journal/__data.json", { maxRedirects: 0 })).status()).toBe(401);
    expect(
      (
        await anonymous.post("/settings?/choose", {
          headers: { origin },
          form: { drafter: "fixture" },
        })
      ).status(),
    ).toBe(401);
    const page = await context.newPage();
    await page.goto("/journal");
    await expect(page.getByRole("heading", { name: "Sign in to your journal" })).toBeVisible();
    await page.getByLabel("Access secret").fill(secret);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(`${origin}/`);
    const cookies = await context.cookies();
    const session = cookies.find((cookie) => cookie.name === "pocketcheck_session");
    expect(session).toMatchObject({ httpOnly: true, sameSite: "Strict", secure: false });
    expect(session!.value).not.toContain(secret);
    const verified = await context.request.get("/__verification");
    expect(await verified.json()).toMatchObject({
      mode: "fixture-browser",
      journal: { kind: "memory", identity },
    });
    expect((await context.request.get("/journal/export")).status()).toBe(200);
    expect(
      (
        await context.request.post("/settings?/choose", {
          headers: { origin: "https://attacker.example" },
          form: { drafter: "fixture" },
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await context.request.post("/settings?/choose", {
          headers: { origin },
          form: { drafter: "fixture" },
        })
      ).status(),
    ).toBe(200);
    await page.goto("/logout");
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page).toHaveURL(`${origin}/login`);
    expect((await context.request.get("/journal/export", { maxRedirects: 0 })).status()).toBe(303);
  } finally {
    await anonymous.dispose();
    await context.close();
    if (child && child.exitCode === null) {
      const exited = new Promise<void>((resolve) => child!.once("exit", () => resolve()));
      child.kill();
      await exited;
    }
  }
});
