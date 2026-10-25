import { describe, expect, it } from "vite-plus/test";
import { redactSecrets, redactText } from "./redact.ts";

describe("export redaction", () => {
  it("replaces connection URLs and secret keys inside strings", () => {
    const redacted = redactSecrets({
      version: 1,
      note: "keep",
      databaseUrl: "postgresql://user:secret@localhost/pocketcheck",
      providerKey: "sk-live-notarealkey123",
      nested: { token: "Bearer sk-anotherfakekey99" },
      rows: ["plain", "postgres://user:pw@host/db?sslmode=require"],
    });
    expect(redacted).toEqual({
      version: 1,
      note: "keep",
      databaseUrl: "[redacted]",
      providerKey: "[redacted]",
      nested: { token: "Bearer [redacted]" },
      rows: ["plain", "[redacted]"],
    });
    const text = JSON.stringify(redacted);
    expect(text).not.toMatch(/postgres(ql)?:\/\//);
    expect(text).not.toContain("secret@");
    expect(text).not.toContain("notarealkey");
  });

  it("keeps ordinary words that happen to contain sk-", () => {
    const report = {
      summary: "A risk-adjusted view of the task-based injury notes; ask-price only.",
      claims: ["Desk-level pricing is unavailable."],
    };
    expect(redactSecrets(report)).toEqual(report);
  });

  it("redacts a URL embedded in an error message", () => {
    expect(redactText("connect failed for postgres://u:p@ep-x.neon.tech/db: timeout")).toBe(
      "connect failed for [redacted] timeout",
    );
  });
});
