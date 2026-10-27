import { describe, expect, it, vi } from "vitest";
import { formatLabel, searchPlaces, searchTerm, toSuggestions } from "./places";

const HYDERABAD = { id: 1, name: "Hyderabad", admin1: "Telangana", country: "India" };
const HYDERABAD_PK = { id: 2, name: "Hyderabad", admin1: "Sindh", country: "Pakistan" };
const DALLAS_TX = { id: 3, name: "Dallas", admin1: "Texas", country: "United States" };
const DALLAS_GA = { id: 4, name: "Dallas", admin1: "Georgia", country: "United States" };

function stubFetch(body: unknown, status = 200) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("searchTerm", () => {
  it.each([
    ["hyd", "hyd"],
    ["Pune, Mah", "Pune"],
    ["  Dallas , TX ", "Dallas"],
    ["", ""],
  ])("takes the place name from %j", (input, expected) => {
    expect(searchTerm(input)).toBe(expected);
  });
});

describe("formatLabel", () => {
  it("joins name, state and country", () => {
    expect(formatLabel(HYDERABAD)).toBe("Hyderabad, Telangana, India");
  });

  it("skips missing parts", () => {
    expect(formatLabel({ name: "Monaco", country: "Monaco" })).toBe("Monaco");
    expect(formatLabel({ name: "Oslo", country: "Norway" })).toBe("Oslo, Norway");
  });

  it("does not repeat a part", () => {
    expect(formatLabel({ name: "Berlin", admin1: "Berlin", country: "Germany" })).toBe(
      "Berlin, Germany",
    );
    expect(formatLabel({ name: "Singapore", country: "singapore" })).toBe("Singapore");
  });

  it("trims whitespace", () => {
    expect(formatLabel({ name: " Pune ", admin1: " Maharashtra", country: "India " })).toBe(
      "Pune, Maharashtra, India",
    );
  });
});

describe("toSuggestions", () => {
  it("builds one suggestion per result", () => {
    expect(toSuggestions([HYDERABAD, HYDERABAD_PK], "hyd")).toEqual([
      { id: 1, label: "Hyderabad, Telangana, India" },
      { id: 2, label: "Hyderabad, Sindh, Pakistan" },
    ]);
  });

  it("removes duplicate labels, keeping the first", () => {
    const result = toSuggestions([DALLAS_TX, { ...DALLAS_TX, id: 99 }], "dal");

    expect(result).toEqual([{ id: 3, label: "Dallas, Texas, United States" }]);
  });

  it("limits the list to six entries", () => {
    const many = Array.from({ length: 10 }, (_, index) => ({
      id: index,
      name: `Place ${index}`,
      country: "Testland",
    }));

    expect(toSuggestions(many, "pla")).toHaveLength(6);
  });

  it("narrows by what was typed after the comma", () => {
    const labels = toSuggestions([DALLAS_GA, DALLAS_TX], "Dallas, tex").map((s) => s.label);

    expect(labels).toEqual(["Dallas, Texas, United States"]);
  });

  it("requires every typed qualifier word to match", () => {
    const labels = toSuggestions([HYDERABAD, HYDERABAD_PK], "Hyderabad, sindh pakistan").map(
      (s) => s.label,
    );

    expect(labels).toEqual(["Hyderabad, Sindh, Pakistan"]);
  });

  it("shows everything when the qualifier matches nothing (for example an abbreviation)", () => {
    expect(toSuggestions([DALLAS_GA, DALLAS_TX], "Dallas, TX")).toHaveLength(2);
  });
});

describe("searchPlaces", () => {
  it("asks the geocoding API for the place name and maps the answer", async () => {
    const fetchMock = stubFetch({ results: [HYDERABAD] });
    const controller = new AbortController();

    const result = await searchPlaces("hyd", controller.signal);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const params = new URL(url).searchParams;
    expect(new URL(url).hostname).toBe("geocoding-api.open-meteo.com");
    expect(params.get("name")).toBe("hyd");
    expect(params.get("count")).toBe("10");
    expect(params.get("language")).toBe("en");
    expect(init.signal).toBe(controller.signal);
    expect(result).toEqual([{ id: 1, label: "Hyderabad, Telangana, India" }]);
  });

  it("sends only the place name when a qualifier was typed", async () => {
    const fetchMock = stubFetch({ results: [DALLAS_TX] });

    await searchPlaces("Dallas, TX", new AbortController().signal);

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(new URL(url).searchParams.get("name")).toBe("Dallas");
  });

  it("does not call the API for fewer than three letters", async () => {
    const fetchMock = stubFetch({ results: [] });

    expect(await searchPlaces("hy", new AbortController().signal)).toEqual([]);
    expect(await searchPlaces("ab, Texas", new AbortController().signal)).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns an empty list when the API has no results field", async () => {
    stubFetch({ generationtime_ms: 0.4 });

    expect(await searchPlaces("zzzzz", new AbortController().signal)).toEqual([]);
  });

  it("throws when the API answers with an error", async () => {
    stubFetch({ error: true }, 500);

    await expect(searchPlaces("hyd", new AbortController().signal)).rejects.toThrow(
      "Place search failed (500).",
    );
  });
});