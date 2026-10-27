"""The full pipeline: geocode, route, sample weather at ETAs, assess, recommend."""

from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone

from .checkpoints import build_checkpoints
from .entities import Checkpoint, Location
from .geocoding import geocode
from .heatmap import HEATMAP_HOURS, Heatmap, build_heatmap
from .recommendation import Recommendation, recommend
from .route_analysis import RouteAnalysis, analyze_route
from .route_provider import get_route_options
from .weather import fetch_forecasts


@dataclass(frozen=True)
class TripPlan:
    origin: Location
    destination: Location
    departure: datetime
    load_lb: float
    routes: list[RouteAnalysis]  # fastest first: route-1, route-2, route-3
    recommendation: Recommendation
    heatmap: Heatmap


def plan_trip(
    origin_query: str, destination_query: str, departure: datetime, load_lb: float
) -> TripPlan:
    # 1. Turn the typed places into coordinates, then fetch up to 3 routes.
    origin = geocode(origin_query)
    destination = geocode(destination_query)
    routes = get_route_options(origin.coordinate, destination.coordinate)

    # 2. Place checkpoints on every route, each with an estimated arrival time.
    checkpoints = [build_checkpoints(route, departure) for route in routes]

    # 3. One batched weather request covers every checkpoint of every route.
    points = [(c.lat, c.lon) for route_checkpoints in checkpoints for c in route_checkpoints]
    start, end = _forecast_window(departure, checkpoints)
    forecasts = fetch_forecasts(points, start, end)

    # 4. Risk per checkpoint using the forecast for its ETA, then the ranking.
    analyses = [
        analyze_route(f"route-{number}", route, route_checkpoints, forecasts, load_lb)
        for number, (route, route_checkpoints) in enumerate(zip(routes, checkpoints), start=1)
    ]
    return TripPlan(
        origin=origin,
        destination=destination,
        departure=departure,
        load_lb=load_lb,
        routes=analyses,
        recommendation=recommend(analyses),
        heatmap=build_heatmap(analyses, forecasts, departure, load_lb),
    )


def _forecast_window(
    departure: datetime, checkpoints: list[list[Checkpoint]]
) -> tuple[date, date]:
    """UTC dates covering the departure, every ETA and the 48-hour heatmap."""
    last_eta = max(c.eta for route_checkpoints in checkpoints for c in route_checkpoints)
    latest = max(departure + timedelta(hours=HEATMAP_HOURS), last_eta) + timedelta(hours=1)
    return departure.astimezone(timezone.utc).date(), latest.astimezone(timezone.utc).date()