import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RecommendationBanner } from "./RecommendationBanner";

describe("RecommendationBanner", () => {
  it("names the recommended route and explains why", () => {
    render(
      <RecommendationBanner
        recommendation={{
          route_id: "route-2",
          reason: "Fewest Severe miles (0.0 mi vs 50.0 mi on the fastest route).",
          has_safe_route: true,
        }}
      />,
    );

    expect(screen.getByRole("heading", { name: "Recommended: Route 2" })).toBeInTheDocument();
    expect(screen.getByText(/Fewest Severe miles/)).toBeInTheDocument();
  });

  it("warns when no route is clear of No Travel weather", () => {
    render(
      <RecommendationBanner
        recommendation={{
          route_id: "route-2",
          reason: "Every route crosses No Travel weather.",
          has_safe_route: false,
        }}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "No clear route. Least exposed: Route 2" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Every route crosses No Travel weather/)).toBeInTheDocument();
  });
});