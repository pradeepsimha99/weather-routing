import { routeLabel } from "../lib/routes";
import type { Recommendation } from "../types";

interface RecommendationBannerProps {
  recommendation: Recommendation;
}

export function RecommendationBanner({ recommendation }: RecommendationBannerProps) {
  const blocked = !recommendation.has_safe_route;
  const route = routeLabel(recommendation.route_id);

  return (
    <section
      className={`banner ${blocked ? "banner--warning" : "banner--good"}`}
      aria-label="Recommendation"
    >
      <h2>{blocked ? `No clear route. Least exposed: ${route}` : `Recommended: ${route}`}</h2>
      <p>{recommendation.reason}</p>
    </section>
  );
}