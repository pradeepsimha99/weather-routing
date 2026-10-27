import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { makeRoutes } from "../test/fixtures";
import { RouteCard } from "./RouteCard";

const [stormy, clear] = makeRoutes(); // route-1 (storm, rank 3) and route-2 (clear, recommended)

function stat(term: string): string | null | undefined {
  return screen.getByText(term).nextElementSibling?.textContent;
}

describe("RouteCard", () => {
  it("summarises the route", () => {
    render(<RouteCard route={stormy} index={0} selected={false} onSelect={vi.fn()} />);

    expect(screen.getByText("Route 1")).toBeInTheDocument();
    expect(screen.getByText("Rank 3")).toBeInTheDocument();
    expect(stat("Distance")).toBe("200.0 mi");
    expect(stat("Travel time")).toBe("3 h 38 min");
    expect(stat("Severe miles")).toBe("50.0 mi");
    expect(stat("High miles")).toBe("25.0 mi");
    expect(screen.getByText("Average risk").nextElementSibling).toHaveTextContent("2.00 (Moderate)");
  });

  it("describes the miles per risk level for screen readers", () => {
    render(<RouteCard route={stormy} index={0} selected={false} onSelect={vi.fn()} />);

    const bar = screen.getByRole("img", { name: /Miles by risk level/ });
    expect(bar).toHaveAccessibleName(expect.stringContaining("Severe 50.0 mi"));
    expect(bar).toHaveAccessibleName(expect.stringContaining("High 25.0 mi"));
    expect(bar).toHaveAccessibleName(expect.stringContaining("Low 125.0 mi"));
  });

  it("only lists risk levels that occur on the route", () => {
    const { unmount } = render(
      <RouteCard route={clear} index={1} selected={false} onSelect={vi.fn()} />,
    );

    // Entries of the risk-level list look like "Low 225.0 mi". The stats grid always has a
    // "Severe miles" label, so match "Severe" followed by a number.
    expect(screen.getByText(/^Low 225\.0 mi$/)).toBeInTheDocument();
    expect(screen.queryByText(/^Severe \d/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^High \d/)).not.toBeInTheDocument();
    unmount();

    render(<RouteCard route={stormy} index={0} selected={false} onSelect={vi.fn()} />);
    expect(screen.getByText(/^Severe 50\.0 mi$/)).toBeInTheDocument();
    expect(screen.getByText(/^High 25\.0 mi$/)).toBeInTheDocument();
  });

  it("marks the recommended route", () => {
    const { unmount } = render(
      <RouteCard route={clear} index={1} selected={false} onSelect={vi.fn()} />,
    );
    expect(screen.getByText("Recommended")).toBeInTheDocument();
    unmount();

    render(<RouteCard route={stormy} index={0} selected={false} onSelect={vi.fn()} />);
    expect(screen.queryByText("Recommended")).not.toBeInTheDocument();
  });

  it("reports whether it is selected", () => {
    const { rerender } = render(
      <RouteCard route={clear} index={1} selected={false} onSelect={vi.fn()} />,
    );
    expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "false");

    rerender(<RouteCard route={clear} index={1} selected onSelect={vi.fn()} />);
    expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "true");
  });

  it("selects the route when clicked", async () => {
    const onSelect = vi.fn();
    render(<RouteCard route={clear} index={1} selected={false} onSelect={onSelect} />);

    await userEvent.setup().click(screen.getByRole("button"));

    expect(onSelect).toHaveBeenCalledWith("route-2");
  });
});