import { expect, test } from "@playwright/test";
import { departureInput, heatPixel } from "./helpers";

test.skip(!process.env.E2E_LIVE, "Set E2E_LIVE=1 and start the backend to run the live smoke test.");

test("analyses a real trip with the live backend and real weather", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/");

  await page.getByRole("combobox", { name: "Origin" }).fill("Dallas, TX, USA");
  await page.getByRole("combobox", { name: "Destination" }).fill("Oklahoma City, OK, USA");
  await page.getByLabel("Departure date and time").fill(departureInput(2));
  await page.getByLabel("Load weight (lb)").fill("42000");
  await page.getByRole("button", { name: "Analyze routes" }).click();

  await expect(
    page.getByRole("heading", { name: /Recommended: Route \d|No clear route/ }),
  ).toBeVisible({ timeout: 90_000 });
  const cards = page.getByRole("region", { name: "Route options" }).getByRole("button");
  await expect(cards.first()).toBeVisible();
  expect(await cards.count()).toBeGreaterThanOrEqual(1);

  await expect(page.getByRole("region", { name: "Checkpoint details" })).toBeVisible();
  await expect(page.getByRole("slider", { name: /Weather heatmap/ })).toBeVisible();
  await expect.poll(() => heatPixel(page)).not.toBeNull();
});