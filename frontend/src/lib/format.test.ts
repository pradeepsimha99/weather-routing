import { describe, expect, it } from "vitest";
import { formatDuration, formatMiles, localInputToIso, toLocalInputValue } from "./format";

describe("formatMiles", () => {
  it("shows one decimal", () => {
    expect(formatMiles(205.64)).toBe("205.6 mi");
    expect(formatMiles(0)).toBe("0.0 mi");
  });
});

describe("formatDuration", () => {
  it.each([
    [0, "0 min"],
    [59, "1 min"],
    [600, "10 min"],
    [3600, "1 h 00 min"],
    [13_260, "3 h 41 min"],
    [19_020, "5 h 17 min"],
  ])("formats %i seconds as %s", (seconds, expected) => {
    expect(formatDuration(seconds)).toBe(expected);
  });
});

describe("date helpers", () => {
  it("formats a Date for a datetime-local input in local time", () => {
    expect(toLocalInputValue(new Date(2026, 9, 28, 9, 5))).toBe("2026-10-28T09:05");
  });

  it("converts a datetime-local value to a UTC ISO string for the API", () => {
    const iso = localInputToIso("2026-10-28T09:05");

    expect(iso.endsWith("Z")).toBe(true);
    expect(new Date(iso).getTime()).toBe(new Date(2026, 9, 28, 9, 5).getTime());
  });
});