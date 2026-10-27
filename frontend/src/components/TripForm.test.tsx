import type { ComponentProps } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { searchPlaces } from "../api/places";
import { toLocalInputValue } from "../lib/format";
import { TripForm } from "./TripForm";

vi.mock("../api/places", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api/places")>()),
  searchPlaces: vi.fn(),
}));

const searchMock = vi.mocked(searchPlaces);
const HOUR_MS = 3_600_000;

function departureValue(): string {
  return toLocalInputValue(new Date(Date.now() + 2 * HOUR_MS));
}

function setup(props: Partial<ComponentProps<typeof TripForm>> = {}) {
  const onSubmit = vi.fn();
  const user = userEvent.setup();
  render(<TripForm isLoading={false} serverErrors={{}} onSubmit={onSubmit} {...props} />);
  return { user, onSubmit };
}

const origin = () => screen.getByRole("combobox", { name: "Origin" });
const destination = () => screen.getByRole("combobox", { name: "Destination" });
const departure = () => screen.getByLabelText("Departure date and time");
const weight = () => screen.getByLabelText("Load weight (lb)");
const submit = () => screen.getByRole("button", { name: "Analyze routes" });

beforeEach(() => {
  searchMock.mockReset();
  searchMock.mockResolvedValue([]);
});

describe("TripForm", () => {
  it("starts empty, with guidance on every field", () => {
    setup();

    expect(origin()).toHaveValue("");
    expect(destination()).toHaveValue("");
    expect(weight()).toHaveValue("");
    expect(origin()).toHaveAttribute("placeholder");
    expect(weight()).toHaveAttribute("placeholder");
    expect(screen.getByText(/pick a suggestion, or enter any address/)).toBeInTheDocument();
    expect(screen.getByText(/Whole pounds, 1 to 80,000/)).toBeInTheDocument();
  });

  it("shows an error for every empty field and sends nothing", async () => {
    const { user, onSubmit } = setup();

    await user.click(submit());

    expect(screen.getAllByRole("alert")).toHaveLength(4);
    expect(screen.getByText("Enter a starting point.")).toBeInTheDocument();
    expect(screen.getByText("Enter a destination.")).toBeInTheDocument();
    expect(screen.getByText("Choose a departure date and time.")).toBeInTheDocument();
    expect(
      screen.getByText("Enter the load weight as a whole number of pounds."),
    ).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submits trimmed values with the departure as a UTC timestamp", async () => {
    const { user, onSubmit } = setup();
    const when = departureValue();

    await user.type(origin(), "  Dallas, TX, USA  ");
    await user.type(destination(), "Oklahoma City, OK, USA");
    fireEvent.change(departure(), { target: { value: when } });
    await user.type(weight(), "42000");
    await user.click(submit());

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({
      origin: "Dallas, TX, USA",
      destination: "Oklahoma City, OK, USA",
      departure_time: new Date(when).toISOString(),
      load_weight_lb: 42000,
    });
  });

  it("uses a place picked from the suggestions", async () => {
    searchMock.mockImplementation(async (input) => {
      const text = input.toLowerCase();
      if (text.startsWith("hyd")) return [{ id: 1, label: "Hyderabad, Telangana, India" }];
      if (text.startsWith("mum")) return [{ id: 2, label: "Mumbai, Maharashtra, India" }];
      return [];
    });
    const { user, onSubmit } = setup();

    await user.type(origin(), "hyd");
    await user.click(await screen.findByRole("option", { name: "Hyderabad, Telangana, India" }));
    await user.type(destination(), "mum");
    await user.click(await screen.findByRole("option", { name: "Mumbai, Maharashtra, India" }));
    fireEvent.change(departure(), { target: { value: departureValue() } });
    await user.type(weight(), "20000");
    await user.click(submit());

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        origin: "Hyderabad, Telangana, India",
        destination: "Mumbai, Maharashtra, India",
        load_weight_lb: 20000,
      }),
    );
  });

  it("rejects the same origin and destination", async () => {
    const { user, onSubmit } = setup();

    await user.type(origin(), "Dallas");
    await user.type(destination(), "dallas");
    fireEvent.change(departure(), { target: { value: departureValue() } });
    await user.type(weight(), "42000");
    await user.click(submit());

    expect(screen.getByText("The destination must differ from the origin.")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("shows validation messages returned by the backend", () => {
    setup({ serverErrors: { origin: "Could not find that place." } });

    expect(screen.getByText("Could not find that place.")).toBeInTheDocument();
    expect(origin()).toHaveAttribute("aria-invalid", "true");
  });

  it("disables the button while a request is running", () => {
    setup({ isLoading: true });

    expect(screen.getByRole("button", { name: "Analyzing…" })).toBeDisabled();
  });

  it("credits the place-suggestion data source", () => {
    setup();

    expect(screen.getByText(/Open-Meteo Geocoding, data from GeoNames/)).toBeInTheDocument();
  });
});