import { useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { localInputToIso, toLocalInputValue } from "../lib/format";
import { MAX_DEPARTURE_DAYS_AHEAD, MAX_LOAD_LB, validateTripForm } from "../lib/validation";
import type { FieldErrors, TripFormValues } from "../lib/validation";
import type { AnalyzeRequest } from "../types";
import { FieldMessage } from "./FieldMessage";
import { LocationInput } from "./LocationInput";

interface TripFormProps {
  isLoading: boolean;
  /** Validation messages returned by the backend. */
  serverErrors: FieldErrors;
  onSubmit: (request: AnalyzeRequest) => void;
}

const DAY_MS = 24 * 60 * 60 * 1000;

const EMPTY_VALUES: TripFormValues = {
  origin: "",
  destination: "",
  departure: "",
  weight: "",
};

interface TextFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  hint: string;
  error?: string;
  type?: "text" | "datetime-local";
  inputMode?: "numeric";
  placeholder?: string;
  min?: string;
  max?: string;
}

function TextField({
  id,
  label,
  value,
  onChange,
  hint,
  error,
  type = "text",
  inputMode,
  placeholder,
  min,
  max,
}: TextFieldProps) {
  const messageId = `${id}-message`;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type={type}
        inputMode={inputMode}
        placeholder={placeholder}
        min={min}
        max={max}
        autoComplete="off"
        value={value}
        onChange={onChange}
        aria-invalid={Boolean(error)}
        aria-describedby={messageId}
      />
      <FieldMessage id={messageId} hint={hint} error={error} />
    </div>
  );
}

export function TripForm({ isLoading, serverErrors, onSubmit }: TripFormProps) {
  const [values, setValues] = useState<TripFormValues>(EMPTY_VALUES);
  const [clientErrors, setClientErrors] = useState<FieldErrors>({});
  const [limits] = useState(() => {
    const now = new Date();
    return {
      min: toLocalInputValue(now),
      max: toLocalInputValue(new Date(now.getTime() + MAX_DEPARTURE_DAYS_AHEAD * DAY_MS)),
    };
  });

  const errors: FieldErrors = { ...serverErrors, ...clientErrors };

  const updateText =
    (field: keyof TripFormValues) => (event: ChangeEvent<HTMLInputElement>) => {
      setValues((current) => ({ ...current, [field]: event.target.value }));
    };

  const updateLocation = (field: "origin" | "destination") => (value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const found = validateTripForm(values);
    setClientErrors(found);
    if (Object.keys(found).length > 0) {
      return;
    }
    onSubmit({
      origin: values.origin.trim(),
      destination: values.destination.trim(),
      departure_time: localInputToIso(values.departure),
      load_weight_lb: Number(values.weight),
    });
  };

  return (
    <form className="panel form" onSubmit={handleSubmit} noValidate>
      <h2>Plan a trip</h2>

      <LocationInput
        id="origin"
        label="Origin"
        value={values.origin}
        onChange={updateLocation("origin")}
        placeholder="Start typing, e.g. hyd, dallas, pune"
        hint="Type 3+ letters and pick a suggestion, or enter any address. Add the country outside the US."
        error={errors.origin}
      />

      <LocationInput
        id="destination"
        label="Destination"
        value={values.destination}
        onChange={updateLocation("destination")}
        placeholder="Start typing, e.g. mum, tulsa, berlin"
        hint="Where the load is delivered. Same format as the origin."
        error={errors.destination}
      />

      <TextField
        id="departure"
        label="Departure date and time"
        type="datetime-local"
        value={values.departure}
        onChange={updateText("departure")}
        min={limits.min}
        max={limits.max}
        hint={`In your device's time zone, up to ${MAX_DEPARTURE_DAYS_AHEAD} days ahead.`}
        error={errors.departure_time}
      />

      <TextField
        id="weight"
        label="Load weight (lb)"
        inputMode="numeric"
        value={values.weight}
        onChange={updateText("weight")}
        placeholder="Load in pounds, e.g. 42000"
        hint={`Whole pounds, 1 to ${MAX_LOAD_LB.toLocaleString("en-US")} (kg × 2.2046 = lb).`}
        error={errors.load_weight_lb}
      />

      <button type="submit" className="button" disabled={isLoading}>
        {isLoading ? "Analyzing…" : "Analyze routes"}
      </button>

      <p className="form__credit">Place suggestions: Open-Meteo Geocoding, data from GeoNames.</p>
    </form>
  );
}