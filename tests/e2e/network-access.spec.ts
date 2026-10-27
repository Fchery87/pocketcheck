import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { browserFixture } from "../../src/lib/server/verification.ts";
import { verificationEnv } from "../../scripts/verification-env.ts";

interface Started {
  child: ChildProcess;
  stdout: string;
  stderr: string;
}

// Starts the documented Node command (`npm start`) with the fixture journal
// and outbound requests blocked, and resolves once the server is listening.
function startServer(env: Record<string, string>): Promise<Started> {
  const child = spawn(
    process.execPath,
    ["--import", "./scripts/reject-outbound.mjs", "--experimental-strip-types", "scripts/start.ts"],
    {
      env: {
        ...verificationEnv(),
        ...browserFixture,
        POCKETCHECK_TEST_JOURNAL_ID: `browser-${randomUUID()}`,
        ...env,
      },
    },
  );
  const started: Started = { child, stdout: "", stderr: "" };
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Server did not start: ${started.stderr}`));
    }, 30_000);
    child.stderr!.on("data", (chunk) => (started.stderr += chunk));
    child.stdout!.on("data", (chunk) => {
      started.stdout += chunk;
      if (started.stdout.includes("Listening on")) {
        clearTimeout(timer);
        resolve(started);
      }
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`Server exited with ${code}: ${started.stderr}`));
    });
  });
}

function stop(started: Started | undefined): void {
  started?.child.removeAllListeners("exit");
  started?.child.kill();
}

// A browser on plain HTTP sends Host and Origin, and no forwarded-protocol
// header. These requests send exactly that.
test("the Node command binds to loopback by default and accepts its own forms", async ({
  playwright,
}) => {
  const port = 42628;
  const origin = `http://127.0.0.1:${port}`;
  let started: Started | undefined;
  const request = await playwright.request.newContext({ baseURL: origin });
  try {
    started = await startServer({ PORT: String(port) });
    expect(started.stdout).toContain(`Listening on ${origin}`);
    expect(started.stderr).not.toContain("no login");

    const accepted = await request.post("/settings?/choose", {
      headers: { origin },
      form: { drafter: "fixture" },
    });
    expect(accepted.status()).toBe(200);
  } finally {
    await request.dispose();
    stop(started);
  }
});

test("the opt-in network run warns and accepts forms from its network origin", async ({
  playwright,
}) => {
  const port = 42628;
  // The phone addresses the computer by its network address.
  const networkHost = `192.0.2.10:${port}`;
  let started: Started | undefined;
  const request = await playwright.request.newContext({ baseURL: `http://127.0.0.1:${port}` });
  try {
    started = await startServer({ HOST: "0.0.0.0", PORT: String(port) });
    // stderr and stdout are separate pipes, so the warning may arrive just after "Listening".
    const log = started;
    await expect.poll(() => log.stderr).toContain("no login");
    expect(log.stderr).toContain("0.0.0.0");

    const accepted = await request.post("/settings?/choose", {
      headers: { host: networkHost, origin: `http://${networkHost}` },
      form: { drafter: "fixture" },
    });
    expect(accepted.status()).toBe(200);

    const rejected = await request.post("/settings?/choose", {
      headers: { host: networkHost, origin: "http://192.0.2.99:42628" },
      form: { drafter: "fixture" },
    });
    expect(rejected.status()).toBe(403);
  } finally {
    await request.dispose();
    stop(started);
  }
});
