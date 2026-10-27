/** Form validation. Limits must match the backend (serializers.py). */

export const MAX_LOAD_LB = 80_000;
export const MAX_DEPARTURE_DAYS_AHEAD = 7;
const MAX_PLACE_LENGTH = 200;
const PAST_GRACE_MS = 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export const FIELD_NAMES = [
  "origin",
  "destination",
  "departure_time",
  "load_weight_lb",
] as const;

export type FieldName = (typeof FIELD_NAMES)[number];
export type FieldErrors = Partial<Record<FieldName, string>>;

export interface TripFormValues {
  origin: string;
  destination: string;
  /** datetime-local value, e.g. "2026-10-28T14:00". */
  departure: string;
  /** Kept as text while the user types. */
  weight: string;
}

export function validateTripForm(values: TripFormValues, now: Date = new Date()): FieldErrors {
  const errors: FieldErrors = {};
  const origin = values.origin.trim();
  const destination = values.destination.trim();

  if (!origin) {
    errors.origin = "Enter a starting point.";
  } else if (origin.length > MAX_PLACE_LENGTH) {
    errors.origin = `Keep this under ${MAX_PLACE_LENGTH} characters.`;
  }

  if (!destination) {
    errors.destination = "Enter a destination.";
  } else if (destination.length > MAX_PLACE_LENGTH) {
    errors.destination = `Keep this under ${MAX_PLACE_LENGTH} characters.`;
  } else if (origin && origin.toLowerCase() === destination.toLowerCase()) {
    errors.destination = "The destination must differ from the origin.";
  }

  const departure = new Date(values.departure);
  if (!values.departure || Number.isNaN(departure.getTime())) {
    errors.departure_time = "Choose a departure date and time.";
  } else if (departure.getTime() < now.getTime() - PAST_GRACE_MS) {
    errors.departure_time = "Departure time cannot be in the past.";
  } else if (departure.getTime() > now.getTime() + MAX_DEPARTURE_DAYS_AHEAD * DAY_MS) {
    errors.departure_time = `Weather forecasts only reach ${MAX_DEPARTURE_DAYS_AHEAD} days ahead.`;
  }

  const weight = values.weight.trim();
  if (!/^\d+$/.test(weight)) {
    errors.load_weight_lb = "Enter the load weight as a whole number of pounds.";
  } else {
    const pounds = Number(weight);
    if (pounds < 1 || pounds > MAX_LOAD_LB) {
      errors.load_weight_lb = `Load must be between 1 and ${MAX_LOAD_LB.toLocaleString("en-US")} lb.`;
    }
  }

  return errors;
}

/** Keep the first backend message for each known field. */
export function toFieldErrors(fields: Record<string, string[]>): FieldErrors {
  const errors: FieldErrors = {};
  for (const name of FIELD_NAMES) {
    const message = fields[name]?.[0];
    if (message) {
      errors[name] = message;
    }
  }
  return errors;
}