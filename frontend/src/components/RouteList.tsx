import type { RouteOption } from "../types";
import { RouteCard } from "./RouteCard";

interface RouteListProps {
  routes: RouteOption[];
  selectedId: string | null;
  onSelect: (routeId: string) => void;
}

export function RouteList({ routes, selectedId, onSelect }: RouteListProps) {
  return (
    <section className="route-list" aria-label="Route options">
      <h2>Route options</h2>
      {routes.map((route, index) => (
        <RouteCard
          key={route.id}
          route={route}
          index={index}
          selected={route.id === selectedId}
          onSelect={onSelect}
        />
      ))}
    </section>
  );
}