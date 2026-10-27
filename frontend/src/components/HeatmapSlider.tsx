import { formatDateTime } from "../lib/format";

interface HeatmapSliderProps {
  /** ISO timestamps; the index is the number of hours after departure. */
  hours: string[];
  hour: number;
  onChange: (hour: number) => void;
}

const SCALE_MARKS = [0, 12, 24, 36, 48];

function offsetLabel(hour: number): string {
  return hour === 0 ? "Departure" : `+${hour} h`;
}

export function HeatmapSlider({ hours, hour, onChange }: HeatmapSliderProps) {
  const last = hours.length - 1;
  const when = formatDateTime(hours[hour]);

  return (
    <section className="panel slider" aria-label="Weather forecast slider">
      <div className="slider__header">
        <label htmlFor="forecast-hour">
          <strong>Weather heatmap</strong> <span className="muted">(forecast hour)</span>
        </label>
        <output htmlFor="forecast-hour" className="slider__value">
          {offsetLabel(hour)} · {when}
        </output>
      </div>

      <input
        id="forecast-hour"
        type="range"
        min={0}
        max={last}
        step={1}
        value={hour}
        aria-valuetext={`${offsetLabel(hour)}, ${when}`}
        onChange={(event) => onChange(Number(event.target.value))}
      />

      <div className="slider__scale" aria-hidden="true">
        {SCALE_MARKS.filter((mark) => mark <= last).map((mark) => (
          <span key={mark}>{mark === 0 ? "Departure" : `+${mark} h`}</span>
        ))}
      </div>

      <p className="slider__note">
        The coloured bands show forecast conditions along each route at this hour for your load.
        The dots on the routes show conditions at the time the truck is expected to arrive there.
      </p>
    </section>
  );
}