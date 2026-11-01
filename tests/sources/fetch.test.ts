import { describe, expect, it } from "vite-plus/test";
import { fetchBounded } from "../../src/lib/server/sources/fetch.ts";

const after = <T>(ms: number, settle: () => T) =>
  new Promise<T>((resolve, reject) => {
    setTimeout(() => {
      try {
        resolve(settle());
      } catch (error) {
        reject(error);
      }
    }, ms);
  });

describe("fetchBounded deadline", () => {
  it("returns a timeout when an abort-ignoring body finishes after the deadline", async () => {
    const result = await fetchBounded("https://example.test/slow.json", {
      timeoutMs: 20,
      schema: "json",
      fetch: async () => ({ ok: true, text: () => after(80, () => '{"late":true}') }),
    });
    expect(result).toEqual({
      ok: false,
      url: "https://example.test/slow.json",
      failure: "timeout after 20ms",
    });
  });

  it("observes a body that rejects after the deadline without an unhandled rejection", async () => {
    const unhandled: unknown[] = [];
    const record = (reason: unknown) => unhandled.push(reason);
    process.on("unhandledRejection", record);
    try {
      const result = await fetchBounded("https://example.test/slow.csv", {
        timeoutMs: 20,
        schema: "csv",
        fetch: async () => ({
          ok: true,
          text: () =>
            after<string>(40, () => {
              throw new Error("socket closed");
            }),
        }),
      });
      expect(result).toMatchObject({ ok: false, failure: "timeout after 20ms" });
      await after(60, () => undefined);
      expect(unhandled).toEqual([]);
    } finally {
      process.off("unhandledRejection", record);
    }
  });

  it("returns the body when it completes within the deadline", async () => {
    const result = await fetchBounded("https://example.test/quick.json", {
      timeoutMs: 100,
      schema: "json",
      fetch: async () => ({ ok: true, text: () => after(5, () => '{"ok":1}') }),
    });
    expect(result).toEqual({ ok: true, url: "https://example.test/quick.json", body: '{"ok":1}' });
  });
});
