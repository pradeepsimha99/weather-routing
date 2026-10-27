import type { Heatmap, LatLng, RouteOption } from "../types";
import { RISK_COLORS, RISK_LEVELS } from "./risk";

const EARTH_RADIUS_MILES = 3958.8;
/** Shortest piece of road drawn as one heat segment. */
const MIN_SEGMENT_MILES = 3;
/** Upper bound per route, so very long trips stay fast. */
const MAX_SEGMENTS_PER_ROUTE = 240;
const COLOR_STEPS_PER_LEVEL = 10;

/** One short piece of a route, positioned between two checkpoints. */
export interface HeatSegment {
  from: LatLng;
  to: LatLng;
  routeIndex: number;
  /** The checkpoint at or just before this piece of road. */
  index: number;
  /** How far (0 to 1) the piece lies toward the next checkpoint. */
  t: number;
}

export interface PreparedHeatmap {
  segments: HeatSegment[];
  /** frames[routeIndex][hour][checkpointIndex] is a risk score from 1 to 5. */
  frames: number[][][];
}

export function haversineMiles(a: LatLng, b: LatLng): number {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = toRadians(b[0] - a[0]);
  const dLon = toRadians(b[1] - a[1]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(a[0])) * Math.cos(toRadians(b[0])) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Split a route into short pieces that follow the real road, each tied to checkpoints. */
function buildSegments(route: RouteOption, routeIndex: number): HeatSegment[] {
  const { geometry, checkpoints } = route;
  if (geometry.length < 2 || checkpoints.length === 0) {
    return [];
  }

  const cumulative = [0];
  for (let i = 1; i < geometry.length; i += 1) {
    cumulative.push(cumulative[i - 1] + haversineMiles(geometry[i - 1], geometry[i]));
  }
  const geometryMiles = cumulative[cumulative.length - 1];
  if (geometryMiles <= 0) {
    return [];
  }

  // Checkpoint miles are measured on the reported distance, so scale the geometry to match.
  const scale = route.distance_miles / geometryMiles;
  const spacing = Math.max(MIN_SEGMENT_MILES, route.distance_miles / MAX_SEGMENTS_PER_ROUTE);
  const marks = checkpoints.map((checkpoint) => checkpoint.mile);

  const segments: HeatSegment[] = [];
  let start = 0;
  let checkpointIndex = 0;
  for (let i = 1; i < geometry.length; i += 1) {
    const isLast = i === geometry.length - 1;
    if (!isLast && (cumulative[i] - cumulative[start]) * scale < spacing) {
      continue;
    }

    const middle = ((cumulative[start] + cumulative[i]) / 2) * scale;
    while (checkpointIndex < marks.length - 2 && marks[checkpointIndex + 1] <= middle) {
      checkpointIndex += 1;
    }
    const hasNext = checkpointIndex + 1 < marks.length;
    const span = hasNext ? marks[checkpointIndex + 1] - marks[checkpointIndex] : 0;
    const t = span > 0 ? Math.min(Math.max((middle - marks[checkpointIndex]) / span, 0), 1) : 0;

    segments.push({
      from: geometry[start],
      to: geometry[i],
      routeIndex,
      index: checkpointIndex,
      t,
    });
    start = i;
  }
  return segments;
}

/** Combine the API's heatmap frames with route geometry. Do this once per result. */
export function prepareHeatmap(heatmap: Heatmap, routes: RouteOption[]): PreparedHeatmap {
  const segments: HeatSegment[] = [];
  const frames: number[][][] = [];
  for (const heatRoute of heatmap.routes) {
    const route = routes.find((candidate) => candidate.id === heatRoute.route_id);
    if (route) {
      const routeIndex = frames.length;
      frames.push(heatRoute.frames);
      segments.push(...buildSegments(route, routeIndex));
    }
  }
  return { segments, frames };
}

/** Risk score (1-5) of a piece of road, blended between its two checkpoints. */
export function segmentScore(frame: number[], segment: HeatSegment): number {
  const here = frame[segment.index] ?? 1;
  const next = frame[Math.min(segment.index + 1, frame.length - 1)] ?? here;
  return here + (next - here) * segment.t;
}

// --- Colours: a smooth ramp through the five legend colours ---------------------------
function hexToRgb(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

const RAMP = RISK_LEVELS.map((level) => hexToRgb(RISK_COLORS[level]));

/** Precomputed so recolouring a frame allocates nothing. */
const COLOR_LOOKUP: string[] = (() => {
  const lastLevel = RAMP.length - 1;
  return Array.from({ length: lastLevel * COLOR_STEPS_PER_LEVEL + 1 }, (_, step) => {
    const position = step / COLOR_STEPS_PER_LEVEL;
    const lower = Math.min(Math.floor(position), lastLevel - 1);
    const fraction = position - lower;
    const [r1, g1, b1] = RAMP[lower];
    const [r2, g2, b2] = RAMP[lower + 1];
    const mix = (a: number, b: number) => Math.round(a + (b - a) * fraction);
    return `rgb(${mix(r1, r2)}, ${mix(g1, g2)}, ${mix(b1, b2)})`;
  });
})();

/** Colour for a risk score from 1 (Low) to 5 (No Travel); in-between values blend. */
export function riskColor(score: number): string {
  const clamped = Math.min(Math.max(score, 1), RAMP.length);
  return COLOR_LOOKUP[Math.round((clamped - 1) * COLOR_STEPS_PER_LEVEL)];
}

/** One colour per segment for the given hour after departure. */
export function frameColors(prepared: PreparedHeatmap, hour: number): string[] {
  return prepared.segments.map((segment) => {
    const routeFrames = prepared.frames[segment.routeIndex];
    const frame = routeFrames[Math.min(Math.max(hour, 0), routeFrames.length - 1)];
    return frame ? riskColor(segmentScore(frame, segment)) : riskColor(1);
  });
}