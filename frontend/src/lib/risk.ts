import type { RiskLevelKey } from "../types";

/** Ordered from least to most severe. */
export const RISK_LEVELS: readonly RiskLevelKey[] = [
  "low",
  "moderate",
  "high",
  "severe",
  "no_travel",
];

export const RISK_LABELS: Record<RiskLevelKey, string> = {
  low: "Low",
  moderate: "Moderate",
  high: "High",
  severe: "Severe",
  no_travel: "No Travel",
};

export const RISK_COLORS: Record<RiskLevelKey, string> = {
  low: "#2e9e5b",
  moderate: "#e0b400",
  high: "#f08a00",
  severe: "#d93025",
  no_travel: "#6a1b9a",
};

/** Convert the API's 1-5 risk score (possibly fractional) to the nearest level. */
export function levelFromScore(score: number): RiskLevelKey {
  const index = Math.min(Math.max(Math.round(score), 1), RISK_LEVELS.length) - 1;
  return RISK_LEVELS[index];
}