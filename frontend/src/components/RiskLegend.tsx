import { RISK_COLORS, RISK_LABELS, RISK_LEVELS } from "../lib/risk";

export function RiskLegend() {
  return (
    <div className="legend" aria-label="Risk level legend">
      <strong>Risk level</strong>
      <ul>
        {RISK_LEVELS.map((level) => (
          <li key={level}>
            <span className="dot" style={{ background: RISK_COLORS[level] }} aria-hidden="true" />
            {RISK_LABELS[level]}
          </li>
        ))}
      </ul>
    </div>
  );
}