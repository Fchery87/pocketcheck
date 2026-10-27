import { spawnSync } from "node:child_process";
import { BROWSER_PORT_VARIABLE, chooseBrowserPort } from "./browser-port.ts";
import { verificationRunEnv } from "./verification-env.ts";

const env = verificationRunEnv();
// Without an explicit port, take a free pair so parallel worktrees do not collide.
env[BROWSER_PORT_VARIABLE] = String(await chooseBrowserPort(env));
console.log(`Browser acceptance uses ${BROWSER_PORT_VARIABLE}=${env[BROWSER_PORT_VARIABLE]}`);

const result = spawnSync(
  process.execPath,
  ["node_modules/@playwright/test/cli.js", "test", ...process.argv.slice(2)],
  { env, stdio: "inherit" },
);
if (result.error) throw result.error;
process.exit(result.status ?? 1);
