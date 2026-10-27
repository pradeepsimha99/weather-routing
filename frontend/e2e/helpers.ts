import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { toLocalInputValue } from "../src/lib/format";
import { makeAnalyzeResponse } from "../src/test/fixtures";

const HOUR_MS = 3_600_000;
const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "*",
};
// A 1x1 transparent PNG, used for every map tile.
const BLANK_TILE = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=",
  "base64",
);

interface GeocodingResult {
  id: number;
  name: string;
  admin1: string;
  country: string;
  latitude: number;
  longitude: number;
}

const PLACES_BY_TERM: Record<string, GeocodingResult[]> = {
  hyd: [
    { id: 1269843, name: "Hyderabad", admin1: "Telangana", country: "India", latitude: 17.38, longitude: 78.47 },
    { id: 1176734, name: "Hyderabad", admin1: "Sindh", country: "Pakistan", latitude: 25.39, longitude: 68.37 },
    { id: 2646227, name: "Hyde", admin1: "England", country: "United Kingdom", latitude: 53.45, longitude: -2.08 },
  ],
  mum: [
    { id: 1275339, name: "Mumbai", admin1: "Maharashtra", country: "India", latitude: 19.07, longitude: 72.88 },
  ],
  dal: [
    { id: 4684888, name: "Dallas", admin1: "Texas", country: "United States", latitude: 32.78, longitude: -96.8 },
  ],
  okl: [
    { id: 4544349, name: "Oklahoma City", admin1: "Oklahoma", country: "United States", latitude: 35.47, longitude: -97.52 },
  ],
};

/** Fake the map tiles and the place-suggestion API (no real network in these tests). */
export async function mockExternalServices(page: Page): Promise<void> {
  await page.route(/tile\.openstreetmap\.org/, (route) =>
    route.fulfill({ contentType: "image/png", body: BLANK_TILE }),
  );
  await page.route(/geocoding-api\.open-meteo\.com\/v1\/search/, async (route) => {
    const term = new URL(route.request().url()).searchParams.get("name")?.toLowerCase() ?? "";
    const results = PLACES_BY_TERM[term] ?? [];
    await route.fulfill({
      json: results.length > 0 ? { results } : {},
      headers: CORS_HEADERS,
    });
  });
}

export interface AnalyzeMock {
  /** Bodies of the POST requests the app sent. */
  requests: Array<Record<string, unknown>>;
}

interface AnalyzeMockOptions {
  status?: number;
  /** The JSON answer. Defaults to the Dallas to Oklahoma City fixture. */
  body?: unknown;
  delayMs?: number;
}

/** Fake POST /api/analyze/ and record what the app sent. */
export async function mockAnalyze(page: Page, options: AnalyzeMockOptions = {}): Promise<AnalyzeMock> {
  const mock: AnalyzeMock = { requests: [] };
  await page.route(/\/api\/analyze\/$/, async (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: CORS_HEADERS });
      return;
    }
    mock.requests.push(request.postDataJSON() as Record<string, unknown>);
    if (options.delayMs) {
      await new Promise((resolve) => setTimeout(resolve, options.delayMs));
    }
    await route.fulfill({
      status: options.status ?? 200,
      json: options.body ?? makeAnalyzeResponse(),
      headers: CORS_HEADERS,
    });
  });
  return mock;
}

export async function pickPlace(
  page: Page,
  field: "Origin" | "Destination",
  typed: string,
  label: string,
): Promise<void> {
  const input = page.getByRole("combobox", { name: field });
  await input.fill(typed);
  await page.getByRole("option", { name: label, exact: true }).click();
  await expect(input).toHaveValue(label);
}

export function departureInput(hoursFromNow = 3): string {
  return toLocalInputValue(new Date(Date.now() + hoursFromNow * HOUR_MS));
}

/** Fill the whole form with a Dallas to Oklahoma City trip, using the suggestion dropdown. */
export async function fillTrip(page: Page): Promise<void> {
  await pickPlace(page, "Origin", "dal", "Dallas, Texas, United States");
  await pickPlace(page, "Destination", "okl", "Oklahoma City, Oklahoma, United States");
  await page.getByLabel("Departure date and time").fill(departureInput());
  await page.getByLabel("Load weight (lb)").fill("42000");
}

export async function submitTrip(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Analyze routes" }).click();
}

/** RGB of the first fully opaque pixel of the heat canvas, or null if nothing is drawn yet. */
export async function heatPixel(page: Page): Promise<number[] | null> {
  return page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>(".leaflet-heatmap-pane canvas");
    const context = canvas?.getContext("2d");
    if (!canvas || !context || canvas.width === 0 || canvas.height === 0) {
      return null;
    }
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] === 255) {
        return [data[i - 3], data[i - 2], data[i - 1]];
      }
    }
    return null;
  });
}