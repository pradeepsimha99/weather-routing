/** Place suggestions for the search boxes, from the Open-Meteo Geocoding API (GeoNames data). */

const GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search";
/** The API only does prefix matching from 3 characters. */
export const MIN_SEARCH_CHARS = 3;
const RESULT_COUNT = 10;
const MAX_SUGGESTIONS = 6;

export interface PlaceSuggestion {
  id: number;
  /** The text put into the input, e.g. "Hyderabad, Telangana, India". */
  label: string;
}

interface GeocodingResult {
  id: number;
  name: string;
  admin1?: string;
  country?: string;
}

interface GeocodingResponse {
  /** Missing entirely when nothing matches. */
  results?: GeocodingResult[];
}

/** The place-name part of what the user typed ("Pune, Mah" becomes "Pune"). */
export function searchTerm(input: string): string {
  return input.split(",")[0].trim();
}

/** "Name, State, Country" without repeating a part (so no "Berlin, Berlin, Germany"). */
export function formatLabel(result: Pick<GeocodingResult, "name" | "admin1" | "country">): string {
  const parts: string[] = [];
  for (const part of [result.name, result.admin1, result.country]) {
    const text = part?.trim();
    if (text && text.toLowerCase() !== parts[parts.length - 1]?.toLowerCase()) {
      parts.push(text);
    }
  }
  return parts.join(", ");
}

/**
 * Turn API results into dropdown entries: unique labels, narrowed by whatever the
 * user typed after the first comma (if that matches anything), limited to a few.
 */
export function toSuggestions(results: GeocodingResult[], input: string): PlaceSuggestion[] {
  const seen = new Set<string>();
  const all: PlaceSuggestion[] = [];
  for (const result of results) {
    const label = formatLabel(result);
    const key = label.toLowerCase();
    if (label && !seen.has(key)) {
      seen.add(key);
      all.push({ id: result.id, label });
    }
  }

  const commaIndex = input.indexOf(",");
  const tokens =
    commaIndex === -1
      ? []
      : input
          .slice(commaIndex + 1)
          .toLowerCase()
          .split(/[\s,]+/)
          .filter(Boolean);
  const narrowed = all.filter((suggestion) =>
    tokens.every((token) => suggestion.label.toLowerCase().includes(token)),
  );

  return (narrowed.length > 0 ? narrowed : all).slice(0, MAX_SUGGESTIONS);
}

export async function searchPlaces(input: string, signal: AbortSignal): Promise<PlaceSuggestion[]> {
  const term = searchTerm(input);
  if (term.length < MIN_SEARCH_CHARS) {
    return [];
  }
  const params = new URLSearchParams({
    name: term,
    count: String(RESULT_COUNT),
    language: "en",
    format: "json",
  });
  const response = await fetch(`${GEOCODING_URL}?${params.toString()}`, { signal });
  if (!response.ok) {
    throw new Error(`Place search failed (${response.status}).`);
  }
  const body = (await response.json()) as GeocodingResponse;
  return toSuggestions(body.results ?? [], input);
}