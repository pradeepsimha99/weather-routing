import { memo, useEffect } from "react";
import { divIcon, latLngBounds } from "leaflet";
import {
  CircleMarker,
  MapContainer,
  Marker,
  Polyline,
  Popup,
  TileLayer,
  Tooltip,
  useMap,
} from "react-leaflet";
import { formatDateTime, formatDuration, formatMiles } from "../lib/format";
import type { PreparedHeatmap } from "../lib/heatmap";
import { RISK_COLORS } from "../lib/risk";
import { routeColor, routeLabel } from "../lib/routes";
import type { Checkpoint, Place, RouteOption } from "../types";
import { HeatmapLayer } from "./HeatmapLayer";

const US_CENTER: [number, number] = [39.5, -98.35];
const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

// Custom pins (HTML based), so no image files are needed.
const ORIGIN_ICON = divIcon({
  className: "pin pin--origin",
  html: "A",
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});
const DESTINATION_ICON = divIcon({
  className: "pin pin--destination",
  html: "B",
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

/**
 * Leaflet only notices window resizes, not changes to its own container (scrollbars
 * appearing, layout shifts, dev tools). Watching the container keeps tiles and
 * vector layers matched to the real size.
 */
function KeepSizeInSync() {
  const map = useMap();
  useEffect(() => {
    if (typeof ResizeObserver === "undefined") {
      return undefined;
    }
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(map.getContainer());
    return () => observer.disconnect();
  }, [map]);
  return null;
}

/** Zoom the map to show every route whenever a new result arrives. */
function FitToRoutes({ routes }: { routes: RouteOption[] }) {
  const map = useMap();
  useEffect(() => {
    if (routes.length === 0) {
      return;
    }
    map.invalidateSize(); // make sure Leaflet knows the real size before fitting
    map.fitBounds(latLngBounds(routes.flatMap((route) => route.geometry)), {
      padding: [32, 32],
    });
  }, [map, routes]);
  return null;
}

function CheckpointDetails({ checkpoint }: { checkpoint: Checkpoint }) {
  const { weather, risk } = checkpoint;
  return (
    <div className="popup">
      <strong>Mile {Math.round(checkpoint.mile)}</strong>
      <div>{formatDateTime(checkpoint.eta)}</div>
      <div>
        <span className="dot" style={{ background: RISK_COLORS[risk.level] }} aria-hidden="true" />
        {risk.label} risk{risk.load_adjusted ? " (heavy-load rule)" : ""}
      </div>
      <div>Wind: {weather.wind_mph.toFixed(1)} mph</div>
      <div>Rain: {weather.rain_in_hr.toFixed(3)} in/hr</div>
      <div>Snow: {weather.snow_in_hr.toFixed(3)} in/hr</div>
    </div>
  );
}

interface RouteOverlaysProps {
  origin: Place | null;
  destination: Place | null;
  routes: RouteOption[];
  selectedId: string | null;
  onSelect: (routeId: string) => void;
}

/** Routes, checkpoints and pins. Memoized so moving the heatmap slider never redraws them. */
const RouteOverlays = memo(function RouteOverlays({
  origin,
  destination,
  routes,
  selectedId,
  onSelect,
}: RouteOverlaysProps) {
  // Draw the selected route last so it sits on top of the others.
  const drawOrder = routes
    .map((route, index) => ({ route, color: routeColor(index), selected: route.id === selectedId }))
    .sort((a, b) => Number(a.selected) - Number(b.selected));

  return (
    <>
      {drawOrder.map(({ route, color, selected }) => (
        <Polyline
          key={route.id}
          positions={route.geometry}
          pathOptions={{
            color,
            weight: selected ? 7 : 4,
            opacity: selected ? 0.9 : 0.55,
            dashArray: selected ? undefined : "10 8",
          }}
          eventHandlers={{ click: () => onSelect(route.id) }}
        >
          <Tooltip sticky>
            {routeLabel(route.id)} · {formatMiles(route.distance_miles)} ·{" "}
            {formatDuration(route.duration_seconds)} · avg risk{" "}
            {route.summary.average_risk.toFixed(2)}
            {route.is_recommended ? " · Recommended" : ""}
          </Tooltip>
        </Polyline>
      ))}

      {/* Checkpoints are drawn after all lines so they are never hidden under one. */}
      {drawOrder.map(({ route, selected }) =>
        route.checkpoints.map((checkpoint) => (
          <CircleMarker
            key={`${route.id}-${checkpoint.mile}`}
            center={[checkpoint.lat, checkpoint.lon]}
            radius={selected ? 7 : 4}
            pathOptions={{
              fillColor: RISK_COLORS[checkpoint.risk.level],
              fillOpacity: 0.95,
              color: "#ffffff",
              weight: 1.5,
            }}
          >
            <Popup>
              <CheckpointDetails checkpoint={checkpoint} />
            </Popup>
          </CircleMarker>
        )),
      )}

      {origin && (
        <Marker position={[origin.lat, origin.lon]} icon={ORIGIN_ICON}>
          <Popup>{origin.name}</Popup>
        </Marker>
      )}
      {destination && (
        <Marker position={[destination.lat, destination.lon]} icon={DESTINATION_ICON}>
          <Popup>{destination.name}</Popup>
        </Marker>
      )}
    </>
  );
});

interface RouteMapProps extends RouteOverlaysProps {
  heatmap: PreparedHeatmap | null;
  /** Forecast hour shown by the heatmap (0 = departure). */
  hour: number;
}

export function RouteMap({
  origin,
  destination,
  routes,
  selectedId,
  onSelect,
  heatmap,
  hour,
}: RouteMapProps) {
  return (
    <MapContainer center={US_CENTER} zoom={4} scrollWheelZoom className="map">
      <TileLayer attribution={TILE_ATTRIBUTION} url={TILE_URL} />
      <KeepSizeInSync />
      <FitToRoutes routes={routes} />
      {heatmap && <HeatmapLayer heatmap={heatmap} hour={hour} />}
      <RouteOverlays
        origin={origin}
        destination={destination}
        routes={routes}
        selectedId={selectedId}
        onSelect={onSelect}
      />
    </MapContainer>
  );
}