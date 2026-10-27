import { createServer } from "node:net";
import { expect, it } from "vite-plus/test";
import { browserPorts, chooseBrowserPort, portIsFree } from "../../scripts/browser-port.ts";
import { verificationRunEnv } from "../../scripts/verification-env.ts";

it("keeps the documented ports when no browser port is set", () => {
  expect(browserPorts({})).toEqual({
    main: 42627,
    launcher: 42628,
    origin: "http://127.0.0.1:42627",
  });
  expect(browserPorts({ POCKETCHECK_BROWSER_PORT: "" }).main).toBe(42627);
});

it("derives the origin and the launcher port from the browser port", () => {
  expect(browserPorts({ POCKETCHECK_BROWSER_PORT: "43100" })).toEqual({
    main: 43100,
    launcher: 43101,
    origin: "http://127.0.0.1:43100",
  });
});

it("rejects a browser port that cannot carry a port pair", () => {
  for (const value of ["abc", "0", "42627.5", "65535", "-1", " 4300"]) {
    expect(() => browserPorts({ POCKETCHECK_BROWSER_PORT: value })).toThrow(
      "POCKETCHECK_BROWSER_PORT",
    );
  }
});

it("uses an explicit browser port without probing", async () => {
  const probed: number[] = [];
  const port = await chooseBrowserPort({ POCKETCHECK_BROWSER_PORT: "43100" }, async (p) => {
    probed.push(p);
    return false;
  });
  expect(port).toBe(43100);
  expect(probed).toEqual([]);
});

it("falls back to the next pair when either port of a pair is taken", async () => {
  const taken = new Set([42627, 42630]);
  const port = await chooseBrowserPort({}, async (p) => !taken.has(p), 42627);
  // 42627 is taken; 42629 is free but its launcher 42630 is taken.
  expect(port).toBe(42631);
});

it("gives up after the candidate pairs are exhausted", async () => {
  await expect(chooseBrowserPort({}, async () => false, 42627)).rejects.toThrow(
    "No free browser port pair",
  );
});

it("reports a bound loopback port as taken and a released one as free", async () => {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as { port: number };
  expect(await portIsFree(port)).toBe(false);
  await new Promise<void>((resolve) => server.close(() => resolve()));
  expect(await portIsFree(port)).toBe(true);
});

it("passes only the browser port through the clean verification environment", () => {
  const env = verificationRunEnv({
    PATH: "/usr/bin",
    POCKETCHECK_BROWSER_PORT: "43100",
    DATABASE_URL: "postgres://synthetic@localhost/personal",
    DEEPSEEK_API_KEY: "synthetic-key",
    UNRELATED: "value",
  });
  expect(env.POCKETCHECK_BROWSER_PORT).toBe("43100");
  expect(env.PATH).toBe("/usr/bin");
  expect(env.DATABASE_URL).toBe("");
  expect(env.DEEPSEEK_API_KEY).toBe("");
  expect(env.UNRELATED).toBeUndefined();
  expect(verificationRunEnv({ PATH: "/usr/bin" })).not.toHaveProperty("POCKETCHECK_BROWSER_PORT");
});
