import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { searchPlaces } from "../api/places";
import type { PlaceSuggestion } from "../api/places";
import { LocationInput } from "./LocationInput";

vi.mock("../api/places", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api/places")>()),
  searchPlaces: vi.fn(),
}));

const searchMock = vi.mocked(searchPlaces);

const HYDERABAD_IN: PlaceSuggestion = { id: 1, label: "Hyderabad, Telangana, India" };
const HYDERABAD_PK: PlaceSuggestion = { id: 2, label: "Hyderabad, Sindh, Pakistan" };
const HYDE_UK: PlaceSuggestion = { id: 3, label: "Hyde, England, United Kingdom" };
const SUGGESTIONS = [HYDERABAD_IN, HYDERABAD_PK, HYDE_UK];

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

interface HarnessProps {
  onSubmit?: () => void;
  error?: string;
}

/** LocationInput is controlled, so tests render it inside a tiny form that owns the value. */
function Harness({ onSubmit = () => undefined, error }: HarnessProps) {
  const [value, setValue] = useState("");
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <LocationInput
        id="origin"
        label="Origin"
        value={value}
        onChange={setValue}
        placeholder="Start typing"
        hint="Type 3+ letters"
        error={error}
      />
      <button type="submit">Go</button>
    </form>
  );
}

function setup(props: HarnessProps = {}) {
  const user = userEvent.setup();
  render(<Harness {...props} />);
  return { user, input: screen.getByRole("combobox", { name: "Origin" }) };
}

beforeEach(() => {
  searchMock.mockReset();
});

describe("LocationInput", () => {
  it("shows matching places after three letters", async () => {
    searchMock.mockResolvedValue(SUGGESTIONS);
    const { user, input } = setup();

    await user.type(input, "hyd");

    const options = await screen.findAllByRole("option");
    expect(options.map((option) => option.textContent)).toEqual(SUGGESTIONS.map((s) => s.label));
    expect(input).toHaveAttribute("aria-expanded", "true");
    expect(searchMock).toHaveBeenCalledTimes(1);
  });

  it("does not search for fewer than three letters", async () => {
    const { user, input } = setup();

    await user.type(input, "hy");
    await sleep(400);

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(searchMock).not.toHaveBeenCalled();
  });

  it("fills the field when a suggestion is clicked, then stays closed", async () => {
    searchMock.mockResolvedValue(SUGGESTIONS);
    const { user, input } = setup();
    await user.type(input, "hyd");

    await user.click(await screen.findByRole("option", { name: HYDERABAD_IN.label }));

    expect(input).toHaveValue(HYDERABAD_IN.label);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    await sleep(400);
    expect(searchMock).toHaveBeenCalledTimes(1); // picking a place does not trigger a new search
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("supports the arrow keys and Enter", async () => {
    searchMock.mockResolvedValue(SUGGESTIONS);
    const { user, input } = setup();
    await user.type(input, "hyd");
    const options = await screen.findAllByRole("option");

    await user.keyboard("{ArrowDown}");
    expect(input).toHaveAttribute("aria-activedescendant", options[0].id);
    expect(options[0]).toHaveAttribute("aria-selected", "true");

    await user.keyboard("{ArrowDown}{Enter}");
    expect(input).toHaveValue(HYDERABAD_PK.label);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("wraps around to the last suggestion with ArrowUp", async () => {
    searchMock.mockResolvedValue(SUGGESTIONS);
    const { user, input } = setup();
    await user.type(input, "hyd");
    const options = await screen.findAllByRole("option");

    await user.keyboard("{ArrowUp}");

    expect(options[2]).toHaveAttribute("aria-selected", "true");
  });

  it("closes with Escape and keeps what was typed", async () => {
    searchMock.mockResolvedValue(SUGGESTIONS);
    const { user, input } = setup();
    await user.type(input, "hyd");
    await screen.findAllByRole("option");

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(input).toHaveValue("hyd");
  });

  it("closes when focus leaves the field", async () => {
    searchMock.mockResolvedValue(SUGGESTIONS);
    const { user, input } = setup();
    await user.type(input, "hyd");
    await screen.findAllByRole("option");

    await user.tab();

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(input).toHaveValue("hyd");
  });

  it("submits the form on Enter when no suggestion is highlighted", async () => {
    searchMock.mockResolvedValue(SUGGESTIONS);
    const onSubmit = vi.fn();
    const { user, input } = setup({ onSubmit });
    await user.type(input, "hyd");
    await screen.findAllByRole("option");

    await user.keyboard("{Enter}");

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(input).toHaveValue("hyd");
  });

  it("tells the user when nothing matches", async () => {
    searchMock.mockResolvedValue([]);
    const { user, input } = setup();

    await user.type(input, "zzzz");

    // The box first says "Searching…", so wait for the final message.
    expect(await screen.findByText(/No matching places/)).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/No matching places/);
  });

  it("tells the user when suggestions are unavailable", async () => {
    searchMock.mockRejectedValue(new Error("down"));
    const { user, input } = setup();

    await user.type(input, "hyd");

    expect(await screen.findByText(/unavailable/)).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/unavailable/);
  });

  it("shows the hint, or the error instead of it", () => {
    const { input } = setup();
    expect(screen.getByText("Type 3+ letters")).toBeInTheDocument();
    expect(input).toHaveAttribute("aria-invalid", "false");
  });

  it("shows a validation error and marks the field invalid", () => {
    const { input } = setup({ error: "Enter a starting point." });

    expect(screen.getByRole("alert")).toHaveTextContent("Enter a starting point.");
    expect(screen.queryByText("Type 3+ letters")).not.toBeInTheDocument();
    expect(input).toHaveAttribute("aria-invalid", "true");
  });
});