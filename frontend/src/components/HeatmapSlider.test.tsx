import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { makeHeatmap, makeRoutes } from "../test/fixtures";
import { HeatmapSlider } from "./HeatmapSlider";

const { hours } = makeHeatmap(makeRoutes());

describe("HeatmapSlider", () => {
  it("covers the 0 to 48 hour forecast", () => {
    render(<HeatmapSlider hours={hours} hour={0} onChange={vi.fn()} />);

    const slider = screen.getByRole("slider", { name: /Weather heatmap/ });
    expect(slider).toHaveAttribute("min", "0");
    expect(slider).toHaveAttribute("max", "48");
    expect(slider).toHaveValue("0");
  });

  it("labels departure and the hours after it", () => {
    const { rerender } = render(<HeatmapSlider hours={hours} hour={0} onChange={vi.fn()} />);
    expect(screen.getByRole("status")).toHaveTextContent(/^Departure ·/);

    rerender(<HeatmapSlider hours={hours} hour={12} onChange={vi.fn()} />);
    expect(screen.getByRole("status")).toHaveTextContent(/^\+12 h ·/);
    expect(screen.getByRole("slider")).toHaveAttribute(
      "aria-valuetext",
      expect.stringContaining("+12 h"),
    );
  });

  it("reports the chosen hour as a number", () => {
    const onChange = vi.fn();
    render(<HeatmapSlider hours={hours} hour={0} onChange={onChange} />);

    fireEvent.change(screen.getByRole("slider"), { target: { value: "30" } });

    expect(onChange).toHaveBeenCalledWith(30);
  });

  it("explains the difference between the bands and the dots", () => {
    render(<HeatmapSlider hours={hours} hour={0} onChange={vi.fn()} />);

    expect(screen.getByText(/coloured bands show forecast conditions/)).toBeInTheDocument();
    expect(screen.getByText(/dots on the routes show conditions/)).toBeInTheDocument();
  });
});