import { describe, expect, it } from "vite-plus/test";
import { containsSecret, redactText } from "./redact.ts";

describe("redaction", () => {
  it("replaces connection URLs and secret keys inside strings", () => {
    expect(redactText("postgresql://user:secret@localhost/pocketcheck")).toBe("[redacted]");
    expect(redactText("sk-live-notarealkey123")).toBe("[redacted]");
    expect(redactText("Bearer sk-anotherfakekey99")).toBe("Bearer [redacted]");
    expect(redactText("plain")).toBe("plain");
    expect(redactText("postgres://user:pw@host/db?sslmode=require")).toBe("[redacted]");
  });

  it("keeps ordinary words that happen to contain sk-", () => {
    const summary = "A risk-adjusted view of the task-based injury notes; ask-price only.";
    expect(redactText(summary)).toBe(summary);
    expect(redactText("Desk-level pricing is unavailable.")).toBe(
      "Desk-level pricing is unavailable.",
    );
  });

  it("detects configured secrets and key shapes but not prose about passwords", () => {
    expect(containsSecret("echo claw_live_7f3a9c21e0", ["claw_live_7f3a9c21e0"])).toBe(true);
    expect(containsSecret("old sk-abcdefghijklmnop1234", [])).toBe(true);
    expect(containsSecret("Their password: defense is stout.", [])).toBe(false);
    expect(containsSecret("risk-adjusted", [""])).toBe(false);
  });

  it("redacts a URL embedded in an error message", () => {
    expect(redactText("connect failed for postgres://u:p@ep-x.neon.tech/db: timeout")).toBe(
      "connect failed for [redacted] timeout",
    );
  });

  it("removes an exact configured secret that matches no known key shape", () => {
    const key = "claw_live_7f3a9c21e0";
    expect(redactText(`upstream echoed ${key} in its error`, [key])).toBe(
      "upstream echoed [redacted] in its error",
    );
  });

  it("removes credential-bearing diagnostics", () => {
    const text = redactText(
      "request failed: authorization: Bearer abc.DEF-123_xyz; x-api-key: key-998877 " +
        "https://user:pw@proxy.example/v1?api_key=qwerty12345&mode=json",
    );
    expect(text).not.toMatch(/abc\.DEF|key-998877|user:pw|qwerty12345/);
    expect(text).toContain("request failed:");
    expect(text).toContain("mode=json");
  });

  it("ignores an empty configured secret", () => {
    expect(redactText("nothing to hide", ["", "   "])).toBe("nothing to hide");
  });
});
