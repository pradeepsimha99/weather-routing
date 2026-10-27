import { describe, expect, it } from "vitest";
import { RISK_COLORS, RISK_LABELS, RISK_LEVELS, levelFromScore } from "./risk";

describe("levelFromScore", () => {
  it.each([
    [1, "low"],
    [1.4, "low"],
    [1.5, "moderate"],
    [2.49, "moderate"],
    [3, "high"],
    [3.5, "severe"],
    [4.5, "no_travel"],
    [5, "no_travel"],
  ])("maps score %d to %s", (score, expected) => {
    expect(levelFromScore(score)).toBe(expected);
  });

  it("clamps out-of-range scores", () => {
    expect(levelFromScore(0)).toBe("low");
    expect(levelFromScore(-3)).toBe("low");
    expect(levelFromScore(9)).toBe("no_travel");
  });
});

describe("risk constants", () => {
  it("lists the five levels from least to most severe", () => {
    expect(RISK_LEVELS).toEqual(["low", "moderate", "high", "severe", "no_travel"]);
  });

  it("has a label and a hex colour for every level", () => {
    for (const level of RISK_LEVELS) {
      expect(RISK_LABELS[level].length).toBeGreaterThan(0);
      expect(RISK_COLORS[level]).toMatch(/^#[0-9a-f]{6}$/i);
    }
    expect(RISK_LABELS.no_travel).toBe("No Travel");
  });
});