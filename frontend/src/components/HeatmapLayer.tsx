import { useEffect, useRef } from "react";
import { canvas, polyline } from "leaflet";
import type { Polyline } from "leaflet";
import { useMap } from "react-leaflet";
import { frameColors } from "../lib/heatmap";
import type { PreparedHeatmap } from "../lib/heatmap";

const PANE_NAME = "heatmap";
const PANE_Z_INDEX = "350"; // above the map tiles (200), below the route lines (400)
const BAND_WIDTH_PX = 30;
const BLUR_PX = 9;
const BAND_OPACITY = 0.6;
const INITIAL_COLOR = "#2e9e5b";

interface HeatmapLayerProps {
  heatmap: PreparedHeatmap;
  hour: number;
}

export function HeatmapLayer({ heatmap, hour }: HeatmapLayerProps) {
  const map = useMap();
  const linesRef = useRef<Polyline[]>([]);

  // Build the lines once per result. They are opaque; the pane applies blur and opacity
  // to the whole band, so overlapping pieces never show darker seams.
  useEffect(() => {
    const pane = map.getPane(PANE_NAME) ?? map.createPane(PANE_NAME);
    pane.style.zIndex = PANE_Z_INDEX;
    pane.style.pointerEvents = "none";
    pane.style.filter = `blur(${BLUR_PX}px)`;
    pane.style.opacity = String(BAND_OPACITY);

    const renderer = canvas({ pane: PANE_NAME, padding: 0.4 });
    const lines = heatmap.segments.map((segment) =>
      polyline([segment.from, segment.to], {
        renderer,
        interactive: false,
        color: INITIAL_COLOR,
        weight: BAND_WIDTH_PX,
        opacity: 1,
        lineCap: "round",
        lineJoin: "round",
      }).addTo(map),
    );
    linesRef.current = lines;

    return () => {
      lines.forEach((line) => line.remove());
      renderer.remove();
      linesRef.current = [];
    };
  }, [map, heatmap]);

  // Moving the slider only recolours the existing lines.
  useEffect(() => {
    const colors = frameColors(heatmap, hour);
    linesRef.current.forEach((line, index) => line.setStyle({ color: colors[index] }));
  }, [heatmap, hour]);

  return null;
}