import { RISK_LABELS, RISK_LEVELS } from "../lib/risk";
import type {
  AnalyzeRequest,
  AnalyzeResponse,
  Checkpoint,
  Heatmap,
  LatLng,
  RiskLevelKey,
  RouteOption,
  RouteSummary,
} from "../types";

export const DEPARTURE_ISO = "2026-10-28T14:00:00Z";
const DEPARTURE_MS = Date.parse(DEPARTURE_ISO);
const HOUR_MS = 3_600_000;
const CHECKPOINT_SPACING_MILES = 25;
const GEOMETRY_SPACING_MILES = 5;
const MILES_PER_DEGREE_LAT = 69.09;
const SPEED_MPH = 55;
const HEATMAP_FRAME_COUNT = 49; // hours 0 to 48

export const REQUEST: AnalyzeRequest = {
  origin: "Dallas, TX, USA",
  destination: "Oklahoma City, OK, USA",
  departure_time: DEPARTURE_ISO,
  load_weight_lb: 42_000,
};

const WIND_MPH: Record<RiskLevelKey, number> = {
  low: 5,
  moderate: 28,
  high: 38,
  severe: 48,
  no_travel: 60,
};

/** Risk score 1 (Low) to 5 (No Travel). */
export function scoreOf(level: RiskLevelKey): number {
  return RISK_LEVELS.indexOf(level) + 1;
}

export function makeCheckpoint(
  mile: number,
  level: RiskLevelKey = "low",
  loadAdjusted = false,
  lonOffset = 0,
): Checkpoint {
  return {
    mile,
    lat: 32 + mile / MILES_PER_DEGREE_LAT,
    lon: -97 + lonOffset,
    eta: new Date(DEPARTURE_MS + (mile / SPEED_MPH) * HOUR_MS).toISOString(),
    weather: { wind_mph: WIND_MPH[level], rain_in_hr: 0, snow_in_hr: 0 },
    risk: {
      level,
      label: RISK_LABELS[level],
      score: scoreOf(level),
      factor: level === "low" ? null : "wind",
      load_adjusted: loadAdjusted,
    },
  };
}

/** Miles per level and average risk, using the same "halfway to the neighbours" rule as the API. */
function summarize(levels: RiskLevelKey[], distance: number): RouteSummary {
  const marks = levels.map((_, index) => index * CHECKPOINT_SPACING_MILES);
  const midpoints = marks.slice(1).map((mark, index) => (marks[index] + mark) / 2);
  const edges = [0, ...midpoints, distance];

  const milesByLevel: Record<RiskLevelKey, number> = {
    low: 0,
    moderate: 0,
    high: 0,
    severe: 0,
    no_travel: 0,
  };
  let weighted = 0;
  levels.forEach((level, index) => {
    const miles = edges[index + 1] - edges[index];
    milesByLevel[level] += miles;
    weighted += scoreOf(level) * miles;
  });

  const worst = Math.max(...levels.map((level) => scoreOf(level)));
  return {
    miles_by_level: milesByLevel,
    average_risk: weighted / distance,
    worst_level: RISK_LEVELS[worst - 1],
  };
}

export interface RouteSpec {
  id: string;
  /** Risk level of each checkpoint, 25 miles apart. At least two. */
  levels: RiskLevelKey[];
  rank?: number;
  recommended?: boolean;
  /** Shifts the route east or west so routes do not overlap on a map. */
  lonOffset?: number;
}

export function makeRoute({
  id,
  levels,
  rank = 1,
  recommended = false,
  lonOffset = 0,
}: RouteSpec): RouteOption {
  if (levels.length < 2) {
    throw new Error("A route needs at least two checkpoints.");
  }
  const checkpoints = levels.map((level, index) =>
    makeCheckpoint(index * CHECKPOINT_SPACING_MILES, level, false, lonOffset),
  );
  const distance = (levels.length - 1) * CHECKPOINT_SPACING_MILES;
  const geometry = Array.from(
    { length: distance / GEOMETRY_SPACING_MILES + 1 },
    (_, index): LatLng => [
      32 + (index * GEOMETRY_SPACING_MILES) / MILES_PER_DEGREE_LAT,
      -97 + lonOffset,
    ],
  );

  return {
    id,
    rank,
    is_recommended: recommended,
    distance_miles: distance,
    duration_seconds: Math.round((distance / SPEED_MPH) * 3600),
    arrival_time: checkpoints[checkpoints.length - 1].eta,
    checkpoint_interval_miles: CHECKPOINT_SPACING_MILES,
    summary: summarize(levels, distance),
    geometry,
    checkpoints,
  };
}

/** Heatmap frames for 0-48 hours. By default every frame repeats the checkpoint's own risk. */
export function makeHeatmap(
  routes: RouteOption[],
  frameScore?: (route: RouteOption, hour: number, checkpointIndex: number) => number,
): Heatmap {
  const hours = Array.from({ length: HEATMAP_FRAME_COUNT }, (_, hour) =>
    new Date(DEPARTURE_MS + hour * HOUR_MS).toISOString(),
  );
  return {
    hours,
    routes: routes.map((route) => ({
      route_id: route.id,
      points: route.checkpoints.map((checkpoint): LatLng => [checkpoint.lat, checkpoint.lon]),
      frames: hours.map((_, hour) =>
        route.checkpoints.map((checkpoint, index) =>
          frameScore ? frameScore(route, hour, index) : checkpoint.risk.score,
        ),
      ),
    })),
  };
}

/** Fastest route crosses a storm, the middle route is clear, the third has light weather. */
export function makeRoutes(): RouteOption[] {
  return [
    makeRoute({
      id: "route-1",
      levels: ["low", "low", "severe", "severe", "high", "low", "low", "low", "low"],
      rank: 3,
      lonOffset: -0.6,
    }),
    makeRoute({
      id: "route-2",
      levels: Array.from({ length: 10 }, (): RiskLevelKey => "low"),
      rank: 1,
      recommended: true,
    }),
    makeRoute({
      id: "route-3",
      levels: [
        "low", "low", "moderate", "moderate", "low", "low", "low", "low", "low", "low", "low",
      ],
      rank: 2,
      lonOffset: 0.6,
    }),
  ];
}

export function makeAnalyzeResponse(): AnalyzeResponse {
  const routes = makeRoutes();
  return {
    origin: { name: "Dallas, Dallas County, Texas, United States", lat: 32.7767, lon: -96.797 },
    destination: {
      name: "Oklahoma City, Oklahoma County, Oklahoma, United States",
      lat: 35.4676,
      lon: -97.5164,
    },
    departure_time: DEPARTURE_ISO,
    load_weight_lb: 42_000,
    recommendation: {
      route_id: "route-2",
      reason: "Fewest Severe miles (0.0 mi vs 50.0 mi on the fastest route).",
      has_safe_route: true,
    },
    routes,
    heatmap: makeHeatmap(routes),
  };
}