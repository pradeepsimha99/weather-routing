import { useEffect, useState } from "react";
import { MIN_SEARCH_CHARS, searchPlaces, searchTerm } from "../api/places";
import type { PlaceSuggestion } from "../api/places";

const DEBOUNCE_MS = 250;
const NO_SUGGESTIONS: PlaceSuggestion[] = [];

export type SuggestionStatus = "idle" | "loading" | "ready" | "error";

export interface SuggestionsState {
  status: SuggestionStatus;
  suggestions: PlaceSuggestion[];
}

interface Settled {
  query: string;
  status: "ready" | "error";
  suggestions: PlaceSuggestion[];
}

/** Suggestions for what the user is typing. Does nothing unless `enabled`. */
export function useLocationSuggestions(input: string, enabled: boolean): SuggestionsState {
  const query = input.trim();
  const active = enabled && searchTerm(query).length >= MIN_SEARCH_CHARS;
  const [settled, setSettled] = useState<Settled | null>(null);

  useEffect(() => {
    if (!active) {
      return undefined;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      searchPlaces(query, controller.signal)
        .then((suggestions) => setSettled({ query, status: "ready", suggestions }))
        .catch(() => {
          if (!controller.signal.aborted) {
            setSettled({ query, status: "error", suggestions: NO_SUGGESTIONS });
          }
        });
    }, DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [active, query]);

  if (!active) {
    return { status: "idle", suggestions: NO_SUGGESTIONS };
  }
  if (settled?.query === query) {
    return { status: settled.status, suggestions: settled.suggestions };
  }
  // Still waiting: keep showing the previous suggestions instead of flashing empty.
  return { status: "loading", suggestions: settled?.suggestions ?? NO_SUGGESTIONS };
}