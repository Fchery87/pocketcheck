import { describe, expect, it } from "vite-plus/test";
import { decidePolicy, POLICY_VERSION } from "./policy.ts";

const released = {
  offerValid: true,
  gameStarted: false,
  materialEvidenceMissing: false,
  releaseStatus: "released-experimental" as const,
  probabilities: { win: 0.55, loss: 0.45, push: 0 },
  decimalOdds: 1.909090909,
  targetExpectedValue: 0,
};

describe("experimental value policy", () => {
  it("names policy-2026-10-25 and does not treat the threshold as established science", () => {
    const decision = decidePolicy(released);
    expect(decision.policyVersion).toBe(POLICY_VERSION);
    expect(decision.policyVersion).toBe("policy-2026-10-25");
    expect(decision.label.toLowerCase()).toContain("not scientifically established");
    expect(decision.experimental).toBe(true);
  });

  it("refuses an invalid offer", () => {
    const decision = decidePolicy({ ...released, offerValid: false });
    expect(decision.conclusion).not.toBe("experimental value candidate");
    expect(decision.blockingReason).toMatch(/offer/i);
    expect(decision.expectedValuePerUnit).toBeNull();
  });

  it("refuses a started game", () => {
    const decision = decidePolicy({ ...released, gameStarted: true });
    expect(decision.conclusion).not.toBe("experimental value candidate");
    expect(decision.blockingReason).toMatch(/started/i);
    expect(decision.expectedValuePerUnit).toBeNull();
  });

  it("refuses missing material evidence", () => {
    const decision = decidePolicy({ ...released, materialEvidenceMissing: true });
    expect(decision.conclusion).toBe("insufficient evidence");
    expect(decision.blockingReason).toMatch(/material evidence/i);
    expect(decision.expectedValuePerUnit).toBeNull();
  });

  it("refuses an unreleased artifact", () => {
    const decision = decidePolicy({ ...released, releaseStatus: "unreleased" });
    expect(decision.conclusion).not.toBe("experimental value candidate");
    expect(decision.blockingReason).toMatch(/unreleased/i);
    expect(decision.expectedValuePerUnit).toBeNull();
  });

  it("keeps missing expected value unavailable rather than zero", () => {
    const decision = decidePolicy({ ...released, probabilities: null });
    expect(decision.expectedValuePerUnit).toBeNull();
    expect(decision.conclusion).toBe("insufficient evidence");
    expect(decision.priceCutoff.available).toBe(false);
  });

  it("shows experimental expected value for a released artifact with a valid pregame offer", () => {
    const decision = decidePolicy(released);
    expect(decision.conclusion).toBe("experimental value candidate");
    expect(decision.blockingReason).toBeNull();
    expect(decision.expectedValuePerUnit).toBeCloseTo(0.55 * (released.decimalOdds - 1) - 0.45, 8);
    expect(decision.priceCutoff.available).toBe(true);
    if (decision.priceCutoff.available) {
      expect(decision.priceCutoff.decimalMinimum).toBeCloseTo(1 + 0.45 / 0.55, 8);
    }
  });
});
