import { describe, expect, it } from "vite-plus/test";
import { stepAmericanOdds, stepPointLine } from "#lib/domain/stepper.ts";

describe("American odds stepper", () => {
  it("moves by five cents within one side of even money", () => {
    expect(stepAmericanOdds(-110, 1)).toBe(-105);
    expect(stepAmericanOdds(-110, -1)).toBe(-115);
    expect(stepAmericanOdds(120, 1)).toBe(125);
    expect(stepAmericanOdds(120, -1)).toBe(115);
  });

  it("skips the impossible range between −100 and +100", () => {
    expect(stepAmericanOdds(-105, 1)).toBe(100);
    expect(stepAmericanOdds(100, -1)).toBe(-105);
  });

  it("treats even money as +100", () => {
    expect(stepAmericanOdds(-100, 1)).toBe(105);
    expect(stepAmericanOdds(-100, -1)).toBe(-105);
  });

  it("starts from −110 when the entry is not a price", () => {
    expect(stepAmericanOdds(null, 1)).toBe(-105);
    expect(stepAmericanOdds(50, -1)).toBe(-115);
  });
});

describe("point line stepper", () => {
  it("moves by half a point", () => {
    expect(stepPointLine(-3, 1)).toBe(-2.5);
    expect(stepPointLine(44.5, -1)).toBe(44);
  });

  it("starts from zero when the entry is not a number", () => {
    expect(stepPointLine(null, -1)).toBe(-0.5);
  });

  it("does not accumulate floating point drift", () => {
    let line = 0;
    for (let index = 0; index < 7; index += 1) line = stepPointLine(line, 1);
    expect(line).toBe(3.5);
  });
});
