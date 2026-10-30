import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { describe, expect, it } from "vite-plus/test";
import { TRAINING_CODE } from "../../src/lib/server/models/training-code.ts";

const pin = {
  trainingCode: "training-2026-10-29",
  sourceHash: "e2d2ce8c6fe3b21211530697a1aaa0a17a411ad29555a0e2db405a9d822b5614",
};

const excluded = resolve("src/lib/server/models/training-code.ts");

function specifierPath(specifier: string, from: string): string | null {
  if (specifier.startsWith("#lib/")) return resolve("src/lib", specifier.slice("#lib/".length));
  if (specifier.startsWith("./") || specifier.startsWith("../")) {
    return resolve(dirname(from), specifier);
  }
  return null;
}

function trainingSources(entry: string): string[] {
  const seen = new Set<string>();
  const pending = [resolve(entry)];
  while (pending.length > 0) {
    const file = pending.pop()!;
    if (seen.has(file) || file === excluded) continue;
    seen.add(file);
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(
      /\bfrom\s+["']([^"']+)["']|\bimport\s*\(\s*["']([^"']+)["']/g,
    )) {
      const path = specifierPath(match[1] ?? match[2]!, file);
      if (path?.endsWith(".ts")) pending.push(path);
    }
  }
  return [...seen].map((file) => relative(process.cwd(), file)).sort();
}

function sourceHash(files: readonly string[]): string {
  const hash = createHash("sha256");
  for (const file of files) hash.update(file).update("\0").update(readFileSync(file)).update("\0");
  return hash.digest("hex");
}

describe("training code identity", () => {
  it("names the training source it pins", () => {
    const files = trainingSources("src/lib/server/models/train.ts");
    expect(
      { trainingCode: TRAINING_CODE, sourceHash: sourceHash(files) },
      `Training source changed:\n${files.join("\n")}\n` +
        "If fitted output can change, bump TRAINING_CODE and refit every artifact " +
        "(npm run model:refit, and the browser fixture per docs/testing.md). " +
        "If the change is cosmetic, update only sourceHash. " +
        "Either way, update both pins in tests/model/training-code.test.ts.",
    ).toEqual(pin);
  });
});
