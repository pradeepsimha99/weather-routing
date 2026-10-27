import { useMemo, useState } from "react";
import { prepareHeatmap } from "../lib/heatmap";
import type { AnalyzeResponse, RouteOption } from "../types";
import { HeatmapSlider } from "./HeatmapSlider";
import { RiskLegend } from "./RiskLegend";
import { RouteMap } from "./RouteMap";

const NO_ROUTES: RouteOption[] = []; // a stable reference, so the map does not re-fit

interface MapPanelProps {
  data: AnalyzeResponse | null;
  selectedId: string | null;
  isLoading: boolean;
  onSelect: (routeId: string) => void;
}

export function MapPanel({ data, selectedId, isLoading, onSelect }: MapPanelProps) {
  const [hour, setHour] = useState(0);

  // A new analysis starts the slider at departure again (React's "reset state when a
  // prop changes" pattern: compare during render instead of using an effect).
  const [hourFor, setHourFor] = useState(data);
  if (data !== hourFor) {
    setHourFor(data);
    setHour(0);
  }

  const heatmap = useMemo(
    () => (data ? prepareHeatmap(data.heatmap, data.routes) : null),
    [data],
  );
  const hours = data?.heatmap.hours ?? [];
  const activeHour = Math.min(hour, Math.max(hours.length - 1, 0));

  return (
    <div className="map-panel">
      <div className="map-wrap">
        <RouteMap
          origin={data?.origin ?? null}
          destination={data?.destination ?? null}
          routes={data?.routes ?? NO_ROUTES}
          selectedId={selectedId}
          onSelect={onSelect}
          heatmap={heatmap}
          hour={activeHour}
        />
        <RiskLegend />
        {isLoading && (
          <div className="map-overlay" role="status">
            Fetching routes and weather. This can take 10 to 60 seconds on free hosting.
          </div>
        )}
      </div>

      {hours.length > 0 && (
        <HeatmapSlider hours={hours} hour={activeHour} onChange={setHour} />
      )}
    </div>
  );
}