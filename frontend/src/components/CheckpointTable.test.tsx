import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { makeRoutes } from "../test/fixtures";
import { CheckpointTable } from "./CheckpointTable";

const [stormy, clear] = makeRoutes();

describe("CheckpointTable", () => {
  it("titles the table with the route and checkpoint spacing", () => {
    render(<CheckpointTable route={stormy} />);

    expect(screen.getByRole("heading", { name: /Route 1 checkpoints/ })).toHaveTextContent(
      "(every 25 miles)",
    );
  });

  it("has one row per checkpoint plus the header", () => {
    render(<CheckpointTable route={stormy} />);

    expect(screen.getAllByRole("row")).toHaveLength(stormy.checkpoints.length + 1);
  });

  it("shows the weather and risk of each checkpoint", () => {
    render(<CheckpointTable route={stormy} />);

    expect(screen.getAllByText("48.0")).toHaveLength(2); // the two Severe checkpoints (wind mph)
    expect(screen.getAllByText("Severe")).toHaveLength(2);
    expect(screen.getAllByText("High")).toHaveLength(1);
    expect(screen.getAllByText("wind")).toHaveLength(3); // main factor of the non-Low checkpoints
    expect(screen.getAllByText("None")).toHaveLength(6); // Low checkpoints have no main factor
  });

  it("flags checkpoints raised by the heavy-load rule", () => {
    const [first, second, third, ...rest] = stormy.checkpoints;
    const route = {
      ...stormy,
      checkpoints: [
        first,
        second,
        { ...third, risk: { ...third.risk, load_adjusted: true } },
        ...rest,
      ],
    };

    render(<CheckpointTable route={route} />);

    expect(screen.getAllByText("(load rule)")).toHaveLength(1);
  });

  it("does not show the load-rule note when no checkpoint was raised", () => {
    render(<CheckpointTable route={clear} />);

    expect(screen.queryByText("(load rule)")).not.toBeInTheDocument();
  });
});