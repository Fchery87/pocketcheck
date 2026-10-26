import { spawnSync } from "node:child_process";
import { verificationEnv } from "./verification-env.ts";

const result = spawnSync(
  process.execPath,
  ["node_modules/@playwright/test/cli.js", "test", ...process.argv.slice(2)],
  {
    env: verificationEnv(),
    stdio: "inherit",
  },
);
if (result.error) throw result.error;
process.exit(result.status ?? 1);
