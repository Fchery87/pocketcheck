import { createHash } from "node:crypto";

export function checksumOf(bytes: string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export type CacheRecord = {
  url: string;
  retrievedAt: string;
  checksum: string;
  body: string;
};

export function cacheRecord(url: string, body: string, retrievedAt: string): CacheRecord {
  return { url, retrievedAt, checksum: checksumOf(body), body };
}
