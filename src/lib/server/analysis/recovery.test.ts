import { describe, expect, it } from "vite-plus/test";
import { describeRecovery } from "./recovery.ts";

describe("recovery notes", () => {
  it("says existing completed reports stay readable", () => {
    for (const state of [
      "interrupted",
      "provider-unavailable",
      "failed-write",
      "schema-change",
    ] as const) {
      const note = describeRecovery(state);
      expect(note.existingCompletedReportsReadable).toBe(true);
      expect(note.message.toLowerCase()).toContain("existing completed reports stay readable");
    }
  });
});
