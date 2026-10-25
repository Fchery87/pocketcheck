import { afterAll, describe } from "vite-plus/test";
import { readFile } from "node:fs/promises";
import { closeDb, createDb } from "#lib/server/db/client.ts";
import { createNeonStore } from "#lib/server/analysis/neon-store.ts";
import { describeStoreContract } from "../store-contract.ts";

function loadEnv(text: string) {
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const separator = trimmed.indexOf("=");
    const key = trimmed.slice(0, separator);
    if (process.env[key] === undefined) process.env[key] = trimmed.slice(separator + 1);
  }
}

try {
  loadEnv(await readFile(".env", "utf8"));
} catch {
  // The integration script skips when the URL is absent.
}

const databaseUrl = process.env.DATABASE_URL;

if (databaseUrl) {
  const db = createDb(databaseUrl);
  afterAll(() => closeDb(db));
  describeStoreContract("Neon", () => createNeonStore(db));
} else {
  describe.skip("Neon research store (DATABASE_URL is missing)", () => {});
}
