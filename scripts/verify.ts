import { spawnSync } from "node:child_process";
import { verificationEnv } from "./verification-env.ts";

const env = verificationEnv();
const commands = process.argv.includes("--database")
  ? ["test:integration"]
  : ["check", "test", "build", "test:e2e"];
if (process.argv.includes("--database")) {
  if (!process.env.TEST_DATABASE_URL) {
    throw new Error("TEST_DATABASE_URL is required and must identify disposable test storage");
  }
  env.TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
}
for (const command of commands) {
  const result = spawnSync("npm", ["run", command], { env, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
