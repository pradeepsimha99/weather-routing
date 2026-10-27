"""Fetch up to three driving route options from the public OSRM server."""

import logging
from collections.abc import Sequence

import requests
from django.conf import settings
from django.core.cache import cache

from .entities import Coordinate, RouteCandidate
from .exceptions import ExternalServiceError, NoRouteFoundError
from .geo import (
    bearing_degrees,
    cumulative_miles,
    decimate,
    destination_point,
    point_at_distance,
)

logger = logging.getLogger(__name__)

OSRM_BASE_URL = "https://router.project-osrm.org/route/v1/driving"
MAX_ROUTES = 3
METERS_PER_MILE = 1609.344
MAX_GEOMETRY_POINTS = 2000
MIN_TRIP_MILES = 0.5
CACHE_TTL_SECONDS = 15 * 60

# Fallback that creates extra routes through a detour waypoint.
MAX_VIA_ATTEMPTS = 6
VIA_FRACTIONS = (0.5, 0.35, 0.65)  # where along the base route to detour from
VIA_OFFSET_RATIO = 0.15  # detour distance as a share of route length
VIA_OFFSET_MIN_MILES = 3.0
VIA_OFFSET_MAX_MILES = 60.0
MAX_DETOUR_FACTOR = 1.75  # reject routes slower than 1.75x the fastest
DISTINCT_TOLERANCE = 0.005  # routes must differ by >0.5% in distance or time


def get_route_options(origin: Coordinate, destination: Coordinate) -> list[RouteCandidate]:
    """Return up to three routes, fastest first."""
    cache_key = (
        f"routes:{origin.lat:.4f},{origin.lon:.4f}:"
        f"{destination.lat:.4f},{destination.lon:.4f}"
    )
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    routes = sorted(
        _request_osrm([origin, destination], alternatives=True),
        key=lambda route: route.duration_seconds,
    )[:MAX_ROUTES]

    if routes[0].distance_miles < MIN_TRIP_MILES:
        raise NoRouteFoundError("The origin and destination are the same place.")

    if len(routes) < MAX_ROUTES:
        routes.extend(_synthesize_alternatives(origin, destination, routes))
        routes.sort(key=lambda route: route.duration_seconds)

    cache.set(cache_key, routes, CACHE_TTL_SECONDS)
    return routes


def _request_osrm(
    waypoints: Sequence[Coordinate], *, alternatives: bool
) -> list[RouteCandidate]:
    """Call OSRM for the given waypoints and parse the routes it returns."""
    path = ";".join(f"{p.lon:.6f},{p.lat:.6f}" for p in waypoints)
    params = {
        "overview": "full",
        "geometries": "geojson",
        "steps": "false",
        "alternatives": "3" if alternatives else "false",
    }
    try:
        response = requests.get(
            f"{OSRM_BASE_URL}/{path}",
            params=params,
            timeout=settings.EXTERNAL_API_TIMEOUT_SECONDS,
        )
        payload = response.json()
    except (requests.RequestException, ValueError) as exc:
        raise ExternalServiceError(
            "The routing service is unavailable. Please try again."
        ) from exc

    code = payload.get("code")
    if code == "NoRoute":
        raise NoRouteFoundError("No drivable route exists between these two locations.")
    if response.status_code != 200 or code != "Ok":
        raise ExternalServiceError("The routing service returned an error.")

    try:
        routes = [_parse_route(raw) for raw in payload["routes"]]
    except (KeyError, TypeError, ValueError) as exc:
        raise ExternalServiceError(
            "The routing service returned an unexpected response."
        ) from exc

    if not routes:
        raise NoRouteFoundError("No drivable route exists between these two locations.")
    return routes


def _parse_route(raw: dict) -> RouteCandidate:
    # GeoJSON order is [longitude, latitude]; we store (latitude, longitude).
    geometry = [(float(lat), float(lon)) for lon, lat in raw["geometry"]["coordinates"]]
    if len(geometry) < 2:
        raise ValueError("Route geometry is too short.")
    return RouteCandidate(
        distance_miles=float(raw["distance"]) / METERS_PER_MILE,
        duration_seconds=float(raw["duration"]),
        geometry=decimate(geometry, MAX_GEOMETRY_POINTS),
    )


def _synthesize_alternatives(
    origin: Coordinate, destination: Coordinate, existing: list[RouteCandidate]
) -> list[RouteCandidate]:
    """Create extra routes by detouring through a waypoint beside the base route."""
    needed = MAX_ROUTES - len(existing)
    base = existing[0]  # `existing` is sorted, so this is the fastest route
    accepted: list[RouteCandidate] = []

    for via in _via_candidates(base)[:MAX_VIA_ATTEMPTS]:
        if len(accepted) >= needed:
            break
        try:
            route = _request_osrm([origin, via, destination], alternatives=False)[0]
        except (ExternalServiceError, NoRouteFoundError):
            logger.warning("Detour route request failed; trying the next waypoint.")
            continue

        if route.duration_seconds > base.duration_seconds * MAX_DETOUR_FACTOR:
            continue
        if _is_distinct(route, [*existing, *accepted]):
            accepted.append(route)

    return accepted


def _via_candidates(base: RouteCandidate) -> list[Coordinate]:
    """Waypoints on either side of the base route, to force different paths."""
    cumulative = cumulative_miles(base.geometry)
    length = cumulative[-1]
    offset = min(max(length * VIA_OFFSET_RATIO, VIA_OFFSET_MIN_MILES), VIA_OFFSET_MAX_MILES)
    lookaround = max(length * 0.02, 0.1)

    candidates: list[Coordinate] = []
    for fraction in VIA_FRACTIONS:
        center = length * fraction
        middle = point_at_distance(base.geometry, cumulative, center)
        before = point_at_distance(base.geometry, cumulative, max(center - lookaround, 0.0))
        after = point_at_distance(base.geometry, cumulative, min(center + lookaround, length))
        heading = bearing_degrees(before, after)
        for side in (90, -90):  # perpendicular, left then right
            lat, lon = destination_point(middle, (heading + side) % 360, offset)
            candidates.append(Coordinate(lat=lat, lon=lon))
    return candidates


def _is_distinct(candidate: RouteCandidate, others: Sequence[RouteCandidate]) -> bool:
    return all(
        _relative_difference(candidate.distance_miles, other.distance_miles) > DISTINCT_TOLERANCE
        or _relative_difference(candidate.duration_seconds, other.duration_seconds)
        > DISTINCT_TOLERANCE
        for other in others
    )


def _relative_difference(a: float, b: float) -> float:
    return abs(a - b) / max(abs(b), 1e-9)