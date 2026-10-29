import { describe, expect, it } from "vite-plus/test";
import { shrinkFactor } from "../../src/lib/server/models/train.ts";

const predictions = (means: number[]) =>
  means.map((mean, index) => ({ index, block: 1, mean, residual: 0 }));

describe("shrink factor", () => {
  it("keeps an adjustment that predicted the distance from the close", () => {
    const means = [2, -1, 3, -4];
    expect(shrinkFactor(predictions(means), means)).toBeCloseTo(1, 10);
  });

  it("drops an adjustment unrelated to the distance from the close", () => {
    expect(shrinkFactor(predictions([2, -2, 2, -2]), [1, 1, -1, -1])).toBe(0);
  });

  it("keeps half of an adjustment that overshoots twofold, and never more than all", () => {
    expect(shrinkFactor(predictions([2, -4]), [1, -2])).toBeCloseTo(0.5, 10);
    expect(shrinkFactor(predictions([1, -1]), [3, -3])).toBe(1);
  });
});
