import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { searchPlaces } from "../api/places";
import type { PlaceSuggestion } from "../api/places";
import { useLocationSuggestions } from "./useLocationSuggestions";

vi.mock("../api/places", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api/places")>()),
  searchPlaces: vi.fn(),
}));

const searchMock = vi.mocked(searchPlaces);

const HYDERABAD: PlaceSuggestion[] = [{ id: 1, label: "Hyderabad, Telangana, India" }];
const HYDE: PlaceSuggestion[] = [{ id: 2, label: "Hyde, England, United Kingdom" }];

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const PAST_DEBOUNCE_MS = 400;

beforeEach(() => {
  searchMock.mockReset();
});

describe("useLocationSuggestions", () => {
  it("stays idle and does not search for fewer than three letters", async () => {
    const { result } = renderHook(() => useLocationSuggestions("hy", true));

    await sleep(PAST_DEBOUNCE_MS);

    expect(result.current).toEqual({ status: "idle", suggestions: [] });
    expect(searchMock).not.toHaveBeenCalled();
  });

  it("stays idle while disabled", async () => {
    const { result } = renderHook(() => useLocationSuggestions("hyd", false));

    await sleep(PAST_DEBOUNCE_MS);

    expect(result.current.status).toBe("idle");
    expect(searchMock).not.toHaveBeenCalled();
  });

  it("reports loading, then the suggestions", async () => {
    searchMock.mockResolvedValue(HYDERABAD);

    const { result } = renderHook(() => useLocationSuggestions("hyd", true));

    expect(result.current.status).toBe("loading");
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.suggestions).toEqual(HYDERABAD);
    expect(searchMock).toHaveBeenCalledTimes(1);
    expect(searchMock).toHaveBeenCalledWith("hyd", expect.any(AbortSignal));
  });

  it("waits for typing to pause, so quick keystrokes cause one search", async () => {
    searchMock.mockResolvedValue(HYDE);
    const { result, rerender } = renderHook(
      ({ input }) => useLocationSuggestions(input, true),
      { initialProps: { input: "hyd" } },
    );

    rerender({ input: "hyde" });

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(searchMock).toHaveBeenCalledTimes(1);
    expect(searchMock).toHaveBeenCalledWith("hyde", expect.any(AbortSignal));
  });

  it("keeps showing the previous suggestions while the next search runs", async () => {
    searchMock.mockResolvedValueOnce(HYDERABAD).mockResolvedValueOnce(HYDE);
    const { result, rerender } = renderHook(
      ({ input }) => useLocationSuggestions(input, true),
      { initialProps: { input: "hyd" } },
    );
    await waitFor(() => expect(result.current.status).toBe("ready"));

    rerender({ input: "hyde" });

    expect(result.current).toEqual({ status: "loading", suggestions: HYDERABAD });
    await waitFor(() => expect(result.current.suggestions).toEqual(HYDE));
    expect(result.current.status).toBe("ready");
  });

  it("reports an error with no suggestions when the search fails", async () => {
    searchMock.mockRejectedValue(new Error("down"));

    const { result } = renderHook(() => useLocationSuggestions("hyd", true));

    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.suggestions).toEqual([]);
  });

  it("goes back to idle when disabled again", async () => {
    searchMock.mockResolvedValue(HYDERABAD);
    const { result, rerender } = renderHook(
      ({ enabled }) => useLocationSuggestions("hyd", enabled),
      { initialProps: { enabled: true } },
    );
    await waitFor(() => expect(result.current.status).toBe("ready"));

    rerender({ enabled: false });

    expect(result.current).toEqual({ status: "idle", suggestions: [] });
  });
});