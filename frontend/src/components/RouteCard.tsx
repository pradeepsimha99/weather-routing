import { formatDateTime, formatDuration, formatMiles } from "../lib/format";
import { RISK_COLORS, RISK_LABELS, RISK_LEVELS, levelFromScore } from "../lib/risk";
import { routeColor, routeLabel } from "../lib/routes";
import type { RouteOption } from "../types";

interface RouteCardProps {
  route: RouteOption;
  index: number;
  selected: boolean;
  onSelect: (routeId: string) => void;
}

export function RouteCard({ route, index, selected, onSelect }: RouteCardProps) {
  const { summary } = route;
  const total = RISK_LEVELS.reduce((sum, level) => sum + summary.miles_by_level[level], 0);
  const presentLevels = RISK_LEVELS.filter((level) => summary.miles_by_level[level] > 0);
  const averageLevel = levelFromScore(summary.average_risk);
  const barLabel =
    "Miles by risk level: " +
    presentLevels
      .map((level) => `${RISK_LABELS[level]} ${formatMiles(summary.miles_by_level[level])}`)
      .join(", ");

  return (
    <button
      type="button"
      className={`route-card${selected ? " route-card--selected" : ""}`}
      aria-pressed={selected}
      onClick={() => onSelect(route.id)}
    >
      <div className="route-card__title">
        <span className="swatch" style={{ background: routeColor(index) }} aria-hidden="true" />
        <strong>{routeLabel(route.id)}</strong>
        {route.is_recommended && <span className="badge">Recommended</span>}
        <span className="route-card__rank">Rank {route.rank}</span>
      </div>

      <dl className="stats">
        <div>
          <dt>Distance</dt>
          <dd>{formatMiles(route.distance_miles)}</dd>
        </div>
        <div>
          <dt>Travel time</dt>
          <dd>{formatDuration(route.duration_seconds)}</dd>
        </div>
        <div>
          <dt>Arrives</dt>
          <dd>{formatDateTime(route.arrival_time)}</dd>
        </div>
        <div>
          <dt>Average risk</dt>
          <dd>
            <span
              className="dot"
              style={{ background: RISK_COLORS[averageLevel] }}
              aria-hidden="true"
            />
            {summary.average_risk.toFixed(2)} ({RISK_LABELS[averageLevel]})
          </dd>
        </div>
        <div>
          <dt>Severe miles</dt>
          <dd>{formatMiles(summary.miles_by_level.severe)}</dd>
        </div>
        <div>
          <dt>High miles</dt>
          <dd>{formatMiles(summary.miles_by_level.high)}</dd>
        </div>
      </dl>

      <div className="mile-bar" role="img" aria-label={barLabel}>
        {presentLevels.map((level) => (
          <span
            key={level}
            style={{
              width: `${(summary.miles_by_level[level] / total) * 100}%`,
              background: RISK_COLORS[level],
            }}
          />
        ))}
      </div>

      <ul className="level-list">
        {presentLevels.map((level) => (
          <li key={level}>
            <span className="dot" style={{ background: RISK_COLORS[level] }} aria-hidden="true" />
            {RISK_LABELS[level]} {formatMiles(summary.miles_by_level[level])}
          </li>
        ))}
      </ul>
    </button>
  );
}