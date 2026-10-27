import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { ApiError, analyzeTrip } from "./api/client";
import { toLocalInputValue } from "./lib/format";
import { makeAnalyzeResponse } from "./test/fixtures";

vi.mock("./api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./api/client")>()),
  analyzeTrip: vi.fn(),
}));
vi.mock("./api/places", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./api/places")>()),
  searchPlaces: vi.fn().mockResolvedValue([]),
}));
// Leaflet needs a real browser; the Playwright tests cover the real map.
vi.mock("./components/RouteMap", () => ({
  RouteMap: () => <div data-testid="route-map" />,
}));

const analyzeMock = vi.mocked(analyzeTrip);
const HOUR_MS = 3_600_000;

async function submitValidTrip() {
  const user = userEvent.setup();
  await user.type(screen.getByRole("combobox", { name: "Origin" }), "Dallas, TX, USA");
  await user.type(
    screen.getByRole("combobox", { name: "Destination" }),
    "Oklahoma City, OK, USA",
  );
  fireEvent.change(screen.getByLabelText("Departure date and time"), {
    target: { value: toLocalInputValue(new Date(Date.now() + 2 * HOUR_MS)) },
  });
  await user.type(screen.getByLabelText("Load weight (lb)"), "42000");
  await user.click(screen.getByRole("button", { name: "Analyze routes" }));
  return user;
}

const routeCards = () =>
  within(screen.getByRole("region", { name: "Route options" })).getAllByRole("button");

beforeEach(() => {
  analyzeMock.mockReset();
});

describe("App", () => {
  it("starts with the form and a prompt, and no results", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "Weather-Aware Truck Routing" })).toBeInTheDocument();
    expect(screen.getByText(/Enter a trip and choose/)).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Route options" })).not.toBeInTheDocument();
    expect(screen.queryByRole("slider")).not.toBeInTheDocument();
  });

  it("analyses a trip and shows the recommendation, routes, table and slider", async () => {
    analyzeMock.mockResolvedValue(makeAnalyzeResponse());
    render(<App />);

    await submitValidTrip();

    expect(await screen.findByRole("heading", { name: "Recommended: Route 2" })).toBeInTheDocument();
    expect(analyzeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        origin: "Dallas, TX, USA",
        destination: "Oklahoma City, OK, USA",
        load_weight_lb: 42000,
      }),
      expect.any(AbortSignal),
    );
    expect(routeCards()).toHaveLength(3);
    expect(screen.getByRole("heading", { name: /Route 2 checkpoints/ })).toBeInTheDocument();
    expect(screen.getByRole("slider")).toBeInTheDocument();
  });

  it("shows the checkpoints of the route the user selects", async () => {
    analyzeMock.mockResolvedValue(makeAnalyzeResponse());
    const user = userEvent.setup();
    render(<App />);
    await submitValidTrip();
    await screen.findByRole("heading", { name: "Recommended: Route 2" });

    const route1 = within(screen.getByRole("region", { name: "Route options" })).getByRole(
      "button",
      { name: /Route 1/ },
    );
    await user.click(route1);

    expect(route1).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("heading", { name: /Route 1 checkpoints/ })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /Route 2 checkpoints/ })).not.toBeInTheDocument();
  });

  it("starts from the recommended route again after a new analysis", async () => {
    analyzeMock.mockResolvedValue(makeAnalyzeResponse());
    const user = userEvent.setup();
    render(<App />);
    await submitValidTrip();
    await screen.findByRole("heading", { name: "Recommended: Route 2" });
    await user.click(
      within(screen.getByRole("region", { name: "Route options" })).getByRole("button", {
        name: /Route 1/,
      }),
    );

    await user.click(screen.getByRole("button", { name: "Analyze routes" }));

    expect(await screen.findByRole("heading", { name: /Route 2 checkpoints/ })).toBeInTheDocument();
  });

  it("shows a loading state while waiting", async () => {
    analyzeMock.mockReturnValue(new Promise(() => undefined));
    render(<App />);

    await submitValidTrip();

    expect(screen.getByRole("button", { name: "Analyzing…" })).toBeDisabled();
    expect(screen.getByText(/Fetching routes and weather/)).toBeInTheDocument();
  });

  it("shows the backend's message when the analysis fails", async () => {
    analyzeMock.mockRejectedValue(new ApiError('Could not find a location matching "Atlantis".', 404));
    render(<App />);

    await submitValidTrip();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      'Could not find a location matching "Atlantis".',
    );
    expect(screen.queryByRole("region", { name: "Route options" })).not.toBeInTheDocument();
  });

  it("highlights fields the backend rejected", async () => {
    analyzeMock.mockRejectedValue(
      new ApiError("Invalid input.", 400, { load_weight_lb: ["Too heavy for this truck."] }),
    );
    render(<App />);

    await submitValidTrip();

    expect(await screen.findByText("Too heavy for this truck.")).toBeInTheDocument();
    expect(screen.getByText("Please correct the highlighted fields.")).toBeInTheDocument();
  });

  it("warns when no route is clear of No Travel weather", async () => {
    const data = makeAnalyzeResponse();
    data.recommendation = { ...data.recommendation, has_safe_route: false };
    analyzeMock.mockResolvedValue(data);
    render(<App />);

    await submitValidTrip();

    expect(
      await screen.findByRole("heading", { name: "No clear route. Least exposed: Route 2" }),
    ).toBeInTheDocument();
  });
});