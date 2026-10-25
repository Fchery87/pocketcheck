import { assertNflverseGamesHeader } from "./nflverse.ts";

export type FetchLike = (
  url: string,
  init: { signal: AbortSignal; headers?: Record<string, string> },
) => Promise<{
  ok: boolean;
  text: () => Promise<string>;
}>;

export type FetchResult =
  | { ok: true; body: string; url: string }
  | { ok: false; failure: string; url: string };

export async function fetchBounded(
  url: string,
  input: {
    timeoutMs: number;
    schema: "csv" | "nflverse-games" | "json";
    fetch: FetchLike;
    headers?: Record<string, string>;
  },
): Promise<FetchResult> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error(`timeout after ${input.timeoutMs}ms`));
    }, input.timeoutMs);
  });
  try {
    const response = await Promise.race([
      input.fetch(url, { signal: controller.signal, headers: input.headers }),
      timeout,
    ]);
    if (!response.ok) return { ok: false, url, failure: `HTTP failure for ${url}` };
    const body = await response.text();
    if (input.schema === "nflverse-games") {
      try {
        assertNflverseGamesHeader(body);
      } catch (error) {
        const message = error instanceof Error ? error.message : "schema mismatch";
        return { ok: false, url, failure: message };
      }
    }
    if (input.schema === "json") {
      try {
        JSON.parse(body);
      } catch {
        return { ok: false, url, failure: "schema mismatch: response is not JSON" };
      }
    }
    return { ok: true, url, body };
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    if (aborted || controller.signal.aborted) {
      return { ok: false, url, failure: `timeout after ${input.timeoutMs}ms` };
    }
    const message = error instanceof Error ? error.message : "fetch failed";
    return { ok: false, url, failure: message };
  } finally {
    clearTimeout(timer);
  }
}
