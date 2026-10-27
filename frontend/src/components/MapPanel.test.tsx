import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { makeAnalyzeResponse } from "../test/fixtures";
import { MapPanel } from "./MapPanel";

// Leaflet needs a real browser; the Playwright tests cover the real map.
vi.mock("./RouteMap", () => ({
  RouteMap: ({ hour }: { hour: number }) => <div data-testid="route-map" data-hour={hour} />,
}));

const noop = () => undefined;

describe("MapPanel", () => {
  it("shows the map and legend, but no slider, before there is a result", () => {
    render(<MapPanel data={null} selectedId={null} isLoading={false} onSelect={noop} />);

    expect(screen.getByTestId("route-map")).toBeInTheDocument();
    expect(screen.getByLabelText("Risk level legend")).toBeInTheDocument();
    expect(screen.queryByRole("slider")).not.toBeInTheDocument();
  });

  it("shows the slider at departure once there is a result", () => {
    render(
      <MapPanel data={makeAnalyzeResponse()} selectedId="route-2" isLoading={false} onSelect={noop} />,
    );

    expect(screen.getByRole("slider")).toHaveValue("0");
    expect(screen.getByTestId("route-map")).toHaveAttribute("data-hour", "0");
  });

  it("passes the slider position to the map", () => {
    render(
      <MapPanel data={makeAnalyzeResponse()} selectedId="route-2" isLoading={false} onSelect={noop} />,
    );

    fireEvent.change(screen.getByRole("slider"), { target: { value: "12" } });

    expect(screen.getByTestId("route-map")).toHaveAttribute("data-hour", "12");
  });

  it("returns the slider to departure when a new result arrives", () => {
    const { rerender } = render(
      <MapPanel data={makeAnalyzeResponse()} selectedId="route-2" isLoading={false} onSelect={noop} />,
    );
    fireEvent.change(screen.getByRole("slider"), { target: { value: "30" } });
    expect(screen.getByTestId("route-map")).toHaveAttribute("data-hour", "30");

    rerender(
      <MapPanel data={makeAnalyzeResponse()} selectedId="route-2" isLoading={false} onSelect={noop} />,
    );

    expect(screen.getByTestId("route-map")).toHaveAttribute("data-hour", "0");
    expect(screen.getByRole("slider")).toHaveValue("0");
  });

  it("covers the map with a message while loading", () => {
    render(<MapPanel data={null} selectedId={null} isLoading onSelect={noop} />);

    expect(screen.getByRole("status")).toHaveTextContent(/Fetching routes and weather/);
  });
});