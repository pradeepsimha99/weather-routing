import { describe, expect, it } from "vitest";
import { toLocalInputValue } from "./format";
import {
  MAX_DEPARTURE_DAYS_AHEAD,
  MAX_LOAD_LB,
  toFieldErrors,
  validateTripForm,
} from "./validation";
import type { TripFormValues } from "./validation";

const NOW = new Date(2026, 9, 27, 12, 0, 0); // local time, October 27 2026
const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

function inputAt(offsetMs: number): string {
  return toLocalInputValue(new Date(NOW.getTime() + offsetMs));
}

function valid(overrides: Partial<TripFormValues> = {}): TripFormValues {
  return {
    origin: "Dallas, TX, USA",
    destination: "Oklahoma City, OK, USA",
    departure: inputAt(2 * HOUR_MS),
    weight: "42000",
    ...overrides,
  };
}

describe("validateTripForm", () => {
  it("accepts a complete, valid trip", () => {
    expect(validateTripForm(valid(), NOW)).toEqual({});
  });

  describe("places", () => {
    it.each(["", "   "])("requires an origin (%j)", (origin) => {
      expect(validateTripForm(valid({ origin }), NOW).origin).toBe("Enter a starting point.");
    });

    it.each(["", "   "])("requires a destination (%j)", (destination) => {
      expect(validateTripForm(valid({ destination }), NOW).destination).toBe(
        "Enter a destination.",
      );
    });

    it("rejects an identical origin and destination, ignoring case and spaces", () => {
      const errors = validateTripForm(valid({ origin: "Dallas", destination: "  dallas " }), NOW);
      expect(errors.destination).toBe("The destination must differ from the origin.");
    });

    it("rejects place names longer than 200 characters", () => {
      const errors = validateTripForm(valid({ origin: "a".repeat(201) }), NOW);
      expect(errors.origin).toBe("Keep this under 200 characters.");
    });
  });

  describe("departure time", () => {
    it("requires a value", () => {
      expect(validateTripForm(valid({ departure: "" }), NOW).departure_time).toBe(
        "Choose a departure date and time.",
      );
    });

    it("rejects text that is not a date", () => {
      expect(validateTripForm(valid({ departure: "tomorrow" }), NOW).departure_time).toBe(
        "Choose a departure date and time.",
      );
    });

    it("allows up to one hour in the past (time to fill in the form)", () => {
      expect(validateTripForm(valid({ departure: inputAt(-HOUR_MS) }), NOW).departure_time).toBe(
        undefined,
      );
    });

    it("rejects more than one hour in the past", () => {
      const departure = inputAt(-61 * 60 * 1000);
      expect(validateTripForm(valid({ departure }), NOW).departure_time).toBe(
        "Departure time cannot be in the past.",
      );
    });

    it("allows exactly the maximum number of days ahead", () => {
      const departure = inputAt(MAX_DEPARTURE_DAYS_AHEAD * DAY_MS);
      expect(validateTripForm(valid({ departure }), NOW).departure_time).toBe(undefined);
    });

    it("rejects departures beyond the forecast horizon", () => {
      const departure = inputAt(MAX_DEPARTURE_DAYS_AHEAD * DAY_MS + HOUR_MS);
      expect(validateTripForm(valid({ departure }), NOW).departure_time).toBe(
        `Weather forecasts only reach ${MAX_DEPARTURE_DAYS_AHEAD} days ahead.`,
      );
    });
  });

  describe("load weight", () => {
    it.each(["1", "42000", String(MAX_LOAD_LB), " 42000 "])("accepts %j", (weight) => {
      expect(validateTripForm(valid({ weight }), NOW).load_weight_lb).toBe(undefined);
    });

    it.each(["", "abc", "12.5", "-5", "4,2000", "1e4"])("rejects non-integers (%j)", (weight) => {
      expect(validateTripForm(valid({ weight }), NOW).load_weight_lb).toBe(
        "Enter the load weight as a whole number of pounds.",
      );
    });

    it.each(["0", String(MAX_LOAD_LB + 1), "1000000"])("rejects out-of-range values (%j)", (weight) => {
      expect(validateTripForm(valid({ weight }), NOW).load_weight_lb).toBe(
        "Load must be between 1 and 80,000 lb.",
      );
    });
  });

  it("reports every problem at once", () => {
    const errors = validateTripForm({ origin: "", destination: "", departure: "", weight: "" }, NOW);
    expect(Object.keys(errors).sort()).toEqual([
      "departure_time",
      "destination",
      "load_weight_lb",
      "origin",
    ]);
  });
});

describe("toFieldErrors", () => {
  it("keeps the first message of each known field", () => {
    expect(
      toFieldErrors({ origin: ["First.", "Second."], load_weight_lb: ["Too heavy."] }),
    ).toEqual({ origin: "First.", load_weight_lb: "Too heavy." });
  });

  it("ignores unknown fields and empty lists", () => {
    expect(toFieldErrors({ unknown: ["x"], destination: [] })).toEqual({});
  });
});