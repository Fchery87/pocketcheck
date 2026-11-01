import { afterEach, describe, expect, it } from "vite-plus/test";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const SCRIPT = resolve("scripts/model/refit.ts");
const SYNTHETIC = resolve("tests/model/fixtures/synthetic-games.json");
const IN_USE = resolve("tests/fixtures/models/browser-forecasting-model.json");

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

/** A scratch directory as the working directory, so no default path can reach data/artifacts. */
function workspace() {
  const directory = mkdtempSync(join(tmpdir(), "pocketcheck-refit-"));
  directories.push(directory);
  const inUse = join(directory, "in-use.json");
  copyFileSync(IN_USE, inUse);
  return { directory, inUse };
}

function refit(cwd: string, ...args: string[]) {
  return spawnSync(process.execPath, ["--experimental-strip-types", SCRIPT, ...args], {
    cwd,
    encoding: "utf8",
  });
}

describe("model:refit", () => {
  it("refuses to fit without a games file instead of fitting synthetic data", () => {
    const { directory } = workspace();
    const result = refit(directory);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/games file/i);
    expect(readdirSync(directory)).toEqual(["in-use.json"]);
  });

  it("leaves the artifact in use untouched when the replacement input is missing", () => {
    const { directory, inUse } = workspace();
    const before = readFileSync(inUse, "utf8");
    const result = refit(directory, join(directory, "missing.json"), inUse, "--replace");
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/Games not found/);
    expect(readFileSync(inUse, "utf8")).toBe(before);
    expect(readdirSync(directory)).toEqual(["in-use.json"]);
  });

  it("requires the artifact in use to be named before replacing it", () => {
    const { directory } = workspace();
    const result = refit(directory, SYNTHETIC, "--replace");
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/artifact in use/i);
    expect(readdirSync(directory)).toEqual(["in-use.json"]);
  });

  it("replaces only the named artifact from the named games and keeps the old one", () => {
    const { directory, inUse } = workspace();
    const before = readFileSync(inUse, "utf8");
    const result = refit(directory, SYNTHETIC, inUse, "--replace");
    expect(result.status, result.stderr).toBe(0);
    const replaced = JSON.parse(readFileSync(inUse, "utf8"));
    expect(JSON.parse(result.stdout)).toMatchObject({
      output: inUse,
      checksum: replaced.checksum,
      replaced: true,
    });
    expect(readFileSync(`${inUse}.replaced`, "utf8")).toBe(before);
    expect(existsSync(join(directory, "data"))).toBe(false);
  });

  it("writes a candidate beside the artifact in use without replacing it", () => {
    const { directory, inUse } = workspace();
    const before = readFileSync(inUse, "utf8");
    const output = join(directory, "next.json");
    const result = refit(directory, SYNTHETIC, inUse, output);
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(readFileSync(output, "utf8")).releaseStatus).toBe("unreleased");
    expect(readFileSync(inUse, "utf8")).toBe(before);
  });
});
