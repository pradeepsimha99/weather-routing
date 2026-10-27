import { formatEta } from "../lib/format";
import { RISK_COLORS } from "../lib/risk";
import { routeLabel } from "../lib/routes";
import type { RouteOption } from "../types";

interface CheckpointTableProps {
  route: RouteOption;
}

export function CheckpointTable({ route }: CheckpointTableProps) {
  return (
    <section className="panel" aria-label="Checkpoint details">
      <h2>
        {routeLabel(route.id)} checkpoints{" "}
        <span className="muted">(every {route.checkpoint_interval_miles} miles)</span>
      </h2>
      <div className="table-wrap">
        <table className="checkpoint-table">
          <thead>
            <tr>
              <th scope="col">Mile</th>
              <th scope="col">ETA (local)</th>
              <th scope="col">Wind (mph)</th>
              <th scope="col">Rain (in/hr)</th>
              <th scope="col">Snow (in/hr)</th>
              <th scope="col">Risk</th>
              <th scope="col">Main factor</th>
            </tr>
          </thead>
          <tbody>
            {route.checkpoints.map((checkpoint) => (
              <tr key={checkpoint.mile}>
                <td className="num">{Math.round(checkpoint.mile)}</td>
                <td>{formatEta(checkpoint.eta)}</td>
                <td className="num">{checkpoint.weather.wind_mph.toFixed(1)}</td>
                <td className="num">{checkpoint.weather.rain_in_hr.toFixed(3)}</td>
                <td className="num">{checkpoint.weather.snow_in_hr.toFixed(3)}</td>
                <td>
                  <span
                    className="dot"
                    style={{ background: RISK_COLORS[checkpoint.risk.level] }}
                    aria-hidden="true"
                  />
                  {checkpoint.risk.label}
                  {checkpoint.risk.load_adjusted && (
                    <span className="note" title="Raised by the heavy-load rule">
                      {" "}
                      (load rule)
                    </span>
                  )}
                </td>
                <td>{checkpoint.risk.factor ?? "None"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}