import { expect, test } from "@playwright/test";
import { makeAnalyzeResponse, makeHeatmap } from "../src/test/fixtures";
import {
  departureInput,
  fillTrip,
  heatPixel,
  mockAnalyze,
  mockExternalServices,
  pickPlace,
  submitTrip,
} from "./helpers";

const GREEN = [46, 158, 91]; // Low risk
const PURPLE = [106, 27, 154]; // No Travel

test.beforeEach(async ({ page }) => {
  await mockExternalServices(page);
});

test.describe("planning a trip", () => {
  test("shows the recommendation, routes, checkpoints and the map layers", async ({ page }) => {
    const analyze = await mockAnalyze(page);
    await page.goto("/");
    await expect(page.getByText(/Enter a trip and choose/)).toBeVisible();

    await fillTrip(page);
    await submitTrip(page);

    // What the app sent.
    await expect.poll(() => analyze.requests.length).toBe(1);
    expect(analyze.requests[0]).toMatchObject({
      origin: "Dallas, Texas, United States",
      destination: "Oklahoma City, Oklahoma, United States",
      load_weight_lb: 42000,
    });
    expect(String(analyze.requests[0].departure_time)).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);

    // Recommendation and route cards.
    await expect(page.getByRole("heading", { name: "Recommended: Route 2" })).toBeVisible();
    await expect(page.getByText(/Fewest Severe miles/)).toBeVisible();
    const cards = page.getByRole("region", { name: "Route options" }).getByRole("button");
    await expect(cards).toHaveCount(3);

    // Checkpoint table of the recommended route.
    const table = page.getByRole("region", { name: "Checkpoint details" });
    await expect(table.getByRole("heading", { name: /Route 2 checkpoints/ })).toBeVisible();
    await expect(table.getByRole("row")).toHaveCount(11); // 10 checkpoints and the header

    // Map: three route lines plus checkpoint dots, the A and B pins, and the heat bands.
    await expect(page.locator(".leaflet-container")).toBeVisible();
    await expect
      .poll(() => page.locator(".leaflet-overlay-pane path").count())
      .toBeGreaterThanOrEqual(33); // 3 lines and 30 checkpoints
    await expect(page.locator(".pin--origin")).toBeVisible();
    await expect(page.locator(".pin--destination")).toBeVisible();
    await expect.poll(() => heatPixel(page)).toEqual(GREEN);
  });

  test("lets the user choose another route", async ({ page }) => {
    await mockAnalyze(page);
    await page.goto("/");
    await fillTrip(page);
    await submitTrip(page);
    await expect(page.getByRole("heading", { name: "Recommended: Route 2" })).toBeVisible();

    const route1 = page.getByRole("button", { name: /Route 1/ });
    await route1.click();

    await expect(route1).toHaveAttribute("aria-pressed", "true");
    const table = page.getByRole("region", { name: "Checkpoint details" });
    await expect(table.getByRole("heading", { name: /Route 1 checkpoints/ })).toBeVisible();
    await expect(table.getByRole("row")).toHaveCount(10); // 9 checkpoints and the header
    await expect(table.getByText("Severe").first()).toBeVisible();
  });

  test("opens a popup with the weather when a checkpoint is clicked", async ({ page }) => {
    await mockAnalyze(page);
    await page.goto("/");
    await fillTrip(page);
    await submitTrip(page);
    await expect(page.getByRole("heading", { name: "Recommended: Route 2" })).toBeVisible();

    // Checkpoint dots are filled circles; route lines have fill="none".
    await page.locator('.leaflet-overlay-pane path[fill="#2e9e5b"]').last().click();

    const popup = page.locator(".leaflet-popup-content");
    await expect(popup).toContainText("Wind:");
    await expect(popup).toContainText("Rain:");
    await expect(popup).toContainText("Snow:");
  });

  test("shows a loading state while the analysis runs", async ({ page }) => {
    await mockAnalyze(page, { delayMs: 1500 });
    await page.goto("/");
    await fillTrip(page);

    await submitTrip(page);

    await expect(page.getByRole("button", { name: "Analyzing…" })).toBeDisabled();
    await expect(page.getByText(/Fetching routes and weather/)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Recommended: Route 2" })).toBeVisible();
    await expect(page.getByText(/Fetching routes and weather/)).toBeHidden();
  });

  test("warns when no route is clear of No Travel weather", async ({ page }) => {
    const body = makeAnalyzeResponse();
    body.recommendation = { ...body.recommendation, has_safe_route: false };
    await mockAnalyze(page, { body });
    await page.goto("/");
    await fillTrip(page);

    await submitTrip(page);

    await expect(
      page.getByRole("heading", { name: "No clear route. Least exposed: Route 2" }),
    ).toBeVisible();
  });
});

test.describe("weather heatmap slider", () => {
  test("recolours the heat bands as the forecast hour changes", async ({ page }) => {
    const body = makeAnalyzeResponse();
    // Calm for the first day, then a storm everywhere (No Travel).
    body.heatmap = makeHeatmap(body.routes, (_route, hour) => (hour < 24 ? 1 : 5));
    await mockAnalyze(page, { body });
    await page.goto("/");
    await fillTrip(page);
    await submitTrip(page);

    const section = page.getByRole("region", { name: "Weather forecast slider" });
    const slider = section.getByRole("slider");
    await expect(slider).toBeVisible();
    await expect(section.locator("output")).toContainText("Departure");
    await expect.poll(() => heatPixel(page)).toEqual(GREEN);

    await slider.focus();
    await slider.press("End");
    await expect(section.locator("output")).toContainText("+48 h");
    await expect.poll(() => heatPixel(page)).toEqual(PURPLE);

    await slider.press("Home");
    await expect(section.locator("output")).toContainText("Departure");
    await expect.poll(() => heatPixel(page)).toEqual(GREEN);
  });

  test("moves one hour at a time with the arrow keys", async ({ page }) => {
    await mockAnalyze(page);
    await page.goto("/");
    await fillTrip(page);
    await submitTrip(page);

    const section = page.getByRole("region", { name: "Weather forecast slider" });
    const slider = section.getByRole("slider");
    await slider.focus();
    await slider.press("ArrowRight");
    await slider.press("ArrowRight");

    await expect(section.locator("output")).toContainText("+2 h");
    await expect(slider).toHaveValue("2");
  });

  test("keeps the sidebar untouched while the slider moves", async ({ page }) => {
    await mockAnalyze(page);
    await page.goto("/");
    await fillTrip(page);
    await submitTrip(page);
    const route1 = page.getByRole("button", { name: /Route 1/ });
    await route1.click();

    const slider = page.getByRole("slider", { name: /Weather heatmap/ });
    await slider.focus();
    await slider.press("End");

    await expect(route1).toHaveAttribute("aria-pressed", "true"); // selection survived
    await expect(page.getByRole("heading", { name: /Route 1 checkpoints/ })).toBeVisible();
  });
});

test.describe("location autocomplete", () => {
  test("suggests places as you type and fills the full name", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("combobox", { name: "Origin" }).fill("hyd");

    const options = page.getByRole("option");
    await expect(options).toHaveCount(3);
    await expect(options.nth(0)).toHaveText("Hyderabad, Telangana, India");
    await expect(options.nth(1)).toHaveText("Hyderabad, Sindh, Pakistan");
    await expect(options.nth(2)).toHaveText("Hyde, England, United Kingdom");

    await options.nth(0).click();
    await expect(page.getByRole("combobox", { name: "Origin" })).toHaveValue(
      "Hyderabad, Telangana, India",
    );
    await expect(page.getByRole("listbox")).toBeHidden();

    await pickPlace(page, "Destination", "mum", "Mumbai, Maharashtra, India");
  });

  test("works with the keyboard", async ({ page }) => {
    await page.goto("/");
    const input = page.getByRole("combobox", { name: "Origin" });

    await input.fill("hyd");
    await expect(page.getByRole("option")).toHaveCount(3);
    await input.press("ArrowDown");
    await input.press("ArrowDown");
    await input.press("Enter");

    await expect(input).toHaveValue("Hyderabad, Sindh, Pakistan");
    await expect(page.getByRole("listbox")).toBeHidden();
  });

  test("closes with Escape and keeps what was typed", async ({ page }) => {
    await page.goto("/");
    const input = page.getByRole("combobox", { name: "Origin" });
    await input.fill("hyd");
    await expect(page.getByRole("listbox")).toBeVisible();

    await input.press("Escape");

    await expect(page.getByRole("listbox")).toBeHidden();
    await expect(input).toHaveValue("hyd");
  });

  test("still accepts a place that has no suggestions", async ({ page }) => {
    const analyze = await mockAnalyze(page);
    await page.goto("/");
    await page.getByRole("combobox", { name: "Origin" }).fill("12 Warehouse Road");
    await expect(page.getByText(/No matching places/)).toBeVisible();
    await pickPlace(page, "Destination", "okl", "Oklahoma City, Oklahoma, United States");
    await page.getByLabel("Departure date and time").fill(departureInput());
    await page.getByLabel("Load weight (lb)").fill("42000");

    await submitTrip(page);

    await expect(page.getByRole("heading", { name: "Recommended: Route 2" })).toBeVisible();
    expect(analyze.requests[0]).toMatchObject({ origin: "12 Warehouse Road" });
  });
});

test.describe("validation and errors", () => {
  test("explains every missing field and sends nothing", async ({ page }) => {
    const analyze = await mockAnalyze(page);
    await page.goto("/");

    await submitTrip(page);

    await expect(page.getByText("Enter a starting point.")).toBeVisible();
    await expect(page.getByText("Enter a destination.")).toBeVisible();
    await expect(page.getByText("Choose a departure date and time.")).toBeVisible();
    await expect(
      page.getByText("Enter the load weight as a whole number of pounds."),
    ).toBeVisible();
    expect(analyze.requests).toHaveLength(0);
  });

  test("rejects a load heavier than the limit before calling the server", async ({ page }) => {
    const analyze = await mockAnalyze(page);
    await page.goto("/");
    await fillTrip(page);
    await page.getByLabel("Load weight (lb)").fill("90000");

    await submitTrip(page);

    await expect(page.getByText("Load must be between 1 and 80,000 lb.")).toBeVisible();
    expect(analyze.requests).toHaveLength(0);
  });

  test("shows the backend's message when a place cannot be found", async ({ page }) => {
    await mockAnalyze(page, {
      status: 404,
      body: { error: 'Could not find a location matching "Atlantis".' },
    });
    await page.goto("/");
    await fillTrip(page);

    await submitTrip(page);

    await expect(page.getByRole("alert")).toContainText("Could not find a location matching");
    await expect(page.getByRole("region", { name: "Route options" })).toBeHidden();
  });

  test("shows a service outage message", async ({ page }) => {
    await mockAnalyze(page, {
      status: 502,
      body: { error: "The weather service is unavailable. Please try again." },
    });
    await page.goto("/");
    await fillTrip(page);

    await submitTrip(page);

    await expect(page.getByRole("alert")).toContainText("The weather service is unavailable");
  });

  test("highlights fields the backend rejected", async ({ page }) => {
    await mockAnalyze(page, {
      status: 400,
      body: { error: "Invalid input.", fields: { load_weight_lb: ["Too heavy for this truck."] } },
    });
    await page.goto("/");
    await fillTrip(page);

    await submitTrip(page);

    await expect(page.getByText("Too heavy for this truck.")).toBeVisible();
    await expect(page.getByText("Please correct the highlighted fields.")).toBeVisible();
  });

  test("tells the user when the server cannot be reached", async ({ page }) => {
    await page.route(/\/api\/analyze\/$/, (route) => route.abort("failed"));
    await page.goto("/");
    await fillTrip(page);

    await submitTrip(page);

    await expect(page.getByRole("alert")).toContainText("Cannot reach the server");
  });
});

test.describe("phone layout", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("fits the screen and keeps every control usable", async ({ page }) => {
    await mockAnalyze(page);
    await page.goto("/");
    await fillTrip(page);
    await submitTrip(page);
    await expect(page.getByRole("heading", { name: "Recommended: Route 2" })).toBeVisible();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1); // no sideways scrolling

    const slider = page.getByRole("slider", { name: /Weather heatmap/ });
    await slider.scrollIntoViewIfNeeded();
    await slider.focus();
    await slider.press("End");
    await expect(page.getByRole("region", { name: "Weather forecast slider" }).locator("output")).toContainText(
      "+48 h",
    );
    await expect(page.locator(".leaflet-container")).toBeVisible();
  });
});