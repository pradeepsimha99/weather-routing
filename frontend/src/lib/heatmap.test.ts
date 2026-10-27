import { describe, expect, it } from "vitest";
import { makeHeatmap, makeRoute } from "../test/fixtures";
import type { LatLng, RiskLevelKey } from "../types";
import {
  frameColors,
  haversineMiles,
  prepareHeatmap,
  riskColor,
  segmentScore,
} from "./heatmap";
import type { HeatSegment } from "./heatmap";
import { RISK_COLORS } from "./risk";

function rgb(hex: string): string {
  const value = Number.parseInt(hex.slice(1), 16);
  return `rgb(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255})`;
}

function channels(color: string): number[] {
  return (color.match(/\d+/g) ?? []).map(Number);
}

const FOUR_CHECKPOINTS: RiskLevelKey[] = ["low", "low", "low", "low"]; // 75 miles

describe("haversineMiles", () => {
  it("measures a degree of latitude as about 69 miles", () => {
    expect(haversineMiles([0, 0], [1, 0])).toBeCloseTo(69.09, 1);
  });

  it("is zero for the same point", () => {
    expect(haversineMiles([32.78, -96.8], [32.78, -96.8])).toBe(0);
  });
});

describe("riskColor", () => {
  it("returns the legend colour at every whole level", () => {
    expect(riskColor(1)).toBe(rgb(RISK_COLORS.low));
    expect(riskColor(2)).toBe(rgb(RISK_COLORS.moderate));
    expect(riskColor(3)).toBe(rgb(RISK_COLORS.high));
    expect(riskColor(4)).toBe(rgb(RISK_COLORS.severe));
    expect(riskColor(5)).toBe(rgb(RISK_COLORS.no_travel));
  });

  it("blends smoothly between two levels", () => {
    const low = channels(riskColor(1));
    const moderate = channels(riskColor(2));

    channels(riskColor(1.5)).forEach((value, index) => {
      expect(value).toBeGreaterThanOrEqual(Math.min(low[index], moderate[index]));
      expect(value).toBeLessThanOrEqual(Math.max(low[index], moderate[index]));
      expect(Math.abs(value - (low[index] + moderate[index]) / 2)).toBeLessThanOrEqual(1);
    });
  });

  it("clamps scores outside 1 to 5", () => {
    expect(riskColor(0)).toBe(riskColor(1));
    expect(riskColor(-4)).toBe(riskColor(1));
    expect(riskColor(9)).toBe(riskColor(5));
  });
});

describe("segmentScore", () => {
  const segment = (index: number, t: number): HeatSegment => ({
    from: [0, 0],
    to: [0, 0],
    routeIndex: 0,
    index,
    t,
  });

  it("blends between a checkpoint and the next one", () => {
    expect(segmentScore([1, 1, 5], segment(1, 0.5))).toBe(3);
    expect(segmentScore([1, 1, 5], segment(0, 0))).toBe(1);
  });

  it("uses the last checkpoint's score at the end of the route", () => {
    expect(segmentScore([1, 5], segment(1, 0.5))).toBe(5);
  });

  it("handles a single checkpoint", () => {
    expect(segmentScore([3], segment(0, 0))).toBe(3);
  });
});

describe("prepareHeatmap", () => {
  it("cuts a route into contiguous pieces that follow its geometry", () => {
    const route = makeRoute({ id: "route-1", levels: FOUR_CHECKPOINTS });
    const { segments } = prepareHeatmap(makeHeatmap([route]), [route]);

    expect(segments).toHaveLength(15); // 75 miles in 5-mile vertex steps
    expect(segments[0].from).toEqual(route.geometry[0]);
    expect(segments[segments.length - 1].to).toEqual(route.geometry[route.geometry.length - 1]);
    for (let i = 1; i < segments.length; i += 1) {
      expect(segments[i].from).toEqual(segments[i - 1].to);
    }
  });

  it("ties each piece to the checkpoints on either side of it", () => {
    const route = makeRoute({ id: "route-1", levels: FOUR_CHECKPOINTS });
    const { segments } = prepareHeatmap(makeHeatmap([route]), [route]);

    expect(segments[0].index).toBe(0);
    expect(segments[0].t).toBeCloseTo(0.1, 2); // middle at mile 2.5 of 25
    expect(segments[5].index).toBe(1);
    expect(segments[5].t).toBeCloseTo(0.1, 2); // middle at mile 27.5
    expect(segments[14].index).toBe(2); // the last interval is checkpoint 2 to 3
    expect(segments[14].t).toBeCloseTo(0.9, 2);

    for (let i = 1; i < segments.length; i += 1) {
      expect(segments[i].index).toBeGreaterThanOrEqual(segments[i - 1].index);
    }
    expect(segments.every((segment) => segment.t >= 0 && segment.t <= 1)).toBe(true);
  });

  it("limits the number of pieces on very long routes", () => {
    const levels = Array.from({ length: 101 }, (): RiskLevelKey => "low"); // 2,500 miles
    const route = makeRoute({ id: "route-1", levels });
    const { segments } = prepareHeatmap(makeHeatmap([route]), [route]);

    expect(segments.length).toBeLessThanOrEqual(240);
    expect(segments.length).toBeGreaterThan(100);
  });

  it("keeps the routes apart and ignores heatmap routes it has no geometry for", () => {
    const first = makeRoute({ id: "route-1", levels: FOUR_CHECKPOINTS });
    const second = makeRoute({ id: "route-2", levels: FOUR_CHECKPOINTS, lonOffset: 0.5 });
    const heatmap = makeHeatmap([first, second]);
    heatmap.routes.push({ route_id: "route-99", points: [], frames: [] });

    const prepared = prepareHeatmap(heatmap, [first, second]);

    expect(prepared.frames).toHaveLength(2);
    expect(new Set(prepared.segments.map((segment) => segment.routeIndex))).toEqual(
      new Set([0, 1]),
    );
  });

  it("produces nothing for a route without geometry", () => {
    const route = { ...makeRoute({ id: "route-1", levels: FOUR_CHECKPOINTS }), geometry: [] as LatLng[] };

    expect(prepareHeatmap(makeHeatmap([route]), [route]).segments).toEqual([]);
  });
});

describe("frameColors", () => {
  const route = makeRoute({ id: "route-1", levels: FOUR_CHECKPOINTS });

  it("colours every piece from the frame of the chosen hour", () => {
    const heatmap = makeHeatmap([route], (_route, hour) => (hour < 24 ? 1 : 5));
    const prepared = prepareHeatmap(heatmap, [route]);

    expect(new Set(frameColors(prepared, 0))).toEqual(new Set([riskColor(1)]));
    expect(new Set(frameColors(prepared, 23))).toEqual(new Set([riskColor(1)]));
    expect(new Set(frameColors(prepared, 24))).toEqual(new Set([riskColor(5)]));
    expect(new Set(frameColors(prepared, 48))).toEqual(new Set([riskColor(5)]));
  });

  it("clamps hours outside the forecast", () => {
    const heatmap = makeHeatmap([route], (_route, hour) => (hour < 24 ? 1 : 5));
    const prepared = prepareHeatmap(heatmap, [route]);

    expect(frameColors(prepared, -5)).toEqual(frameColors(prepared, 0));
    expect(frameColors(prepared, 99)).toEqual(frameColors(prepared, 48));
  });

  it("blends scores between neighbouring checkpoints", () => {
    // Only the second checkpoint (mile 25) is stormy.
    const heatmap = makeHeatmap([route], (_route, _hour, index) => (index === 1 ? 5 : 1));
    const prepared = prepareHeatmap(heatmap, [route]);
    const frame = prepared.frames[0][0];
    const scores = prepared.segments.map((segment) => segmentScore(frame, segment));

    expect(frameColors(prepared, 0)).toEqual(scores.map((score) => riskColor(score)));
    expect(Math.max(...scores)).toBeGreaterThan(4);
    expect(scores[0]).toBeLessThan(2); // far from the storm
    expect(scores[scores.length - 1]).toBeLessThan(2);
  });
});