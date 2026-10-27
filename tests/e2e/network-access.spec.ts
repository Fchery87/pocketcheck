import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { networkInterfaces } from "node:os";
import { expect, test } from "@playwright/test";
import { browserFixture } from "../../src/lib/server/verification.ts";
import { verificationEnv } from "../../scripts/verification-env.ts";
import { browserPorts } from "../../scripts/browser-port.ts";

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

function interfaceAddress(): string {
  for (const addresses of Object.values(networkInterfaces())) {
    for (const entry of addresses ?? []) {
      if (entry.family === "IPv4" && !entry.internal) return entry.address;
    }
  }
  return "127.0.0.1";
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
  const port = browserPorts(process.env).launcher;
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
  const port = browserPorts(process.env).launcher;
  // The phone addresses the computer by one of its network addresses. A machine
  // with no network interface falls back to its loopback address.
  const networkHost = `${interfaceAddress()}:${port}`;
  let started: Started | undefined;
  const request = await playwright.request.newContext({ baseURL: `http://127.0.0.1:${port}` });
  try {
    started = await startServer({ HOST: "0.0.0.0", PORT: String(port) });
    // stderr and stdout are separate pipes, so the warning may arrive just after "Listening".
    const log = started;
    await expect.poll(() => log.stderr).toContain("no login");
    expect(log.stderr).toContain("0.0.0.0");
    expect(log.stdout).toContain("Allowed hosts: localhost, 127.0.0.1, [::1]");

    const accepted = await request.post("/settings?/choose", {
      headers: { host: networkHost, origin: `http://${networkHost}` },
      form: { drafter: "fixture" },
    });
    expect(accepted.status()).toBe(200);

    const rejected = await request.post("/settings?/choose", {
      headers: { host: networkHost, origin: `http://192.0.2.99:${port}` },
      form: { drafter: "fixture" },
    });
    expect(rejected.status()).toBe(403);
  } finally {
    await request.dispose();
    stop(started);
  }
});

// A DNS-rebinding page resolves its own name to this computer, so the browser
// sends that name as Host and a matching Origin. The launcher must refuse it
// before SvelteKit sees the request, for reads as well as forms.
test("the Node command refuses a host name it does not know", async ({ playwright }) => {
  const port = browserPorts(process.env).launcher;
  const rebound = `rebind.attacker.example:${port}`;
  let started: Started | undefined;
  const request = await playwright.request.newContext({ baseURL: `http://127.0.0.1:${port}` });
  try {
    started = await startServer({
      HOST: "0.0.0.0",
      PORT: String(port),
      ALLOWED_HOSTS: "pocketcheck.local",
    });
    expect(started.stdout).toContain("pocketcheck.local");

    const read = await request.get("/settings", {
      headers: { host: rebound, origin: `http://${rebound}` },
    });
    expect(read.status()).toBe(421);
    expect(read.headers()["content-type"]).toContain("text/plain");
    expect(await read.text()).toContain("not an allowed host");

    const write = await request.post("/settings?/choose", {
      headers: { host: rebound, origin: `http://${rebound}` },
      form: { drafter: "fixture" },
    });
    expect(write.status()).toBe(421);
    expect(await write.text()).not.toContain("<html");

    const listed = `pocketcheck.local:${port}`;
    const named = await request.post("/settings?/choose", {
      headers: { host: listed, origin: `http://${listed}` },
      form: { drafter: "fixture" },
    });
    expect(named.status()).toBe(200);
  } finally {
    await request.dispose();
    stop(started);
  }
});
