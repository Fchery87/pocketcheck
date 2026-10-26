import { spawnSync } from "node:child_process";
import { verificationEnv } from "./verification-env.ts";

for (const args of [
  ["--exclude", "tests/integration/**", "--exclude", "tests/model/density-grid.test.ts"],
  ["tests/model/density-grid.test.ts", "--maxWorkers", "1"],
]) {
  const result = spawnSync("node_modules/.bin/vp", ["test", "run", ...args], {
    env: verificationEnv(),
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
