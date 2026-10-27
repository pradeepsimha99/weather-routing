/** Types mirroring the JSON returned by POST /api/analyze/ (see backend presenters.py). */

export type RiskLevelKey = "low" | "moderate" | "high" | "severe" | "no_travel";

export type LatLng = [number, number];

export interface Place {
  name: string;
  lat: number;
  lon: number;
}

export interface CheckpointWeather {
  wind_mph: number;
  rain_in_hr: number;
  snow_in_hr: number;
}

export interface CheckpointRisk {
  level: RiskLevelKey;
  label: string;
  /** 1 (Low) to 5 (No Travel). */
  score: number;
  /** The condition that sets the level, or null when everything is Low. */
  factor: "wind" | "rain" | "snow" | null;
  /** True when the heavy-load rules raised the wind level. */
  load_adjusted: boolean;
}

export interface Checkpoint {
  mile: number;
  lat: number;
  lon: number;
  /** ISO 8601, UTC. */
  eta: string;
  weather: CheckpointWeather;
  risk: CheckpointRisk;
}

export interface RouteSummary {
  miles_by_level: Record<RiskLevelKey, number>;
  /** Mile-weighted, 1 (Low) to 5 (No Travel). */
  average_risk: number;
  worst_level: RiskLevelKey;
}

export interface RouteOption {
  id: string;
  /** 1 = best route according to the recommendation rules. */
  rank: number;
  is_recommended: boolean;
  distance_miles: number;
  duration_seconds: number;
  arrival_time: string;
  checkpoint_interval_miles: number;
  summary: RouteSummary;
  geometry: LatLng[];
  checkpoints: Checkpoint[];
}

export interface Recommendation {
  route_id: string;
  reason: string;
  /** False when even the best route crosses No Travel weather. */
  has_safe_route: boolean;
}

export interface HeatmapRoute {
  route_id: string;
  points: LatLng[];
  /** frames[hour][pointIndex] is a risk score from 1 to 5. */
  frames: number[][];
}

export interface Heatmap {
  /** 49 ISO timestamps: departure + 0 ... 48 hours. */
  hours: string[];
  routes: HeatmapRoute[];
}

export interface AnalyzeRequest {
  origin: string;
  destination: string;
  /** ISO 8601. */
  departure_time: string;
  load_weight_lb: number;
}

export interface AnalyzeResponse {
  origin: Place;
  destination: Place;
  departure_time: string;
  load_weight_lb: number;
  recommendation: Recommendation;
  routes: RouteOption[];
  heatmap: Heatmap;
}