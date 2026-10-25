import { describe, expect, it } from "vite-plus/test";
import { redactSecrets } from "./redact.ts";

describe("export redaction", () => {
  it("strips connection URLs and secret-key strings", () => {
    const redacted = redactSecrets({
      version: 1,
      note: "keep",
      databaseUrl: "postgresql://user:secret@localhost/pocketcheck",
      providerKey: "sk-live-not-a-real-key",
      nested: { token: "sk-another" },
      rows: ["plain", "postgresql://other"],
    });
    expect(redacted).toEqual({
      version: 1,
      note: "keep",
      nested: {},
      rows: ["plain"],
    });
    expect(JSON.stringify(redacted)).not.toContain("postgresql://");
    expect(JSON.stringify(redacted)).not.toContain("sk-");
  });
});
