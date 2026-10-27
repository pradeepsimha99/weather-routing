/** Line colours for the route options (distinct from the risk colours). */
export const ROUTE_COLORS = ["#2563eb", "#0d9488", "#475569"] as const;

export function routeColor(index: number): string {
  return ROUTE_COLORS[index % ROUTE_COLORS.length];
}

/** "route-2" becomes "Route 2". */
export function routeLabel(id: string): string {
  return id.replace("route-", "Route ");
}