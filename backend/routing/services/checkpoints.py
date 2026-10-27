"""Place weather-sampling checkpoints along a route and estimate arrival times."""

from datetime import datetime, timedelta

from .entities import Checkpoint, RouteCandidate
from .geo import polyline_length_miles, resample_polyline

SHORT_ROUTE_MAX_MILES = 150
MEDIUM_ROUTE_MAX_MILES = 500


def choose_interval_miles(total_miles: float) -> int:
    """Checkpoint spacing: 10 mi (short), 25 mi (medium), 50 mi (long routes)."""
    if total_miles <= SHORT_ROUTE_MAX_MILES:
        return 10
    if total_miles <= MEDIUM_ROUTE_MAX_MILES:
        return 25
    return 50


def build_checkpoints(route: RouteCandidate, departure: datetime) -> list[Checkpoint]:
    """Checkpoints from start to finish, each with an estimated arrival time.

    ETA assumes a constant average speed: the share of the route completed
    equals the share of the total duration elapsed.
    """
    polyline_miles = polyline_length_miles(route.geometry)
    if polyline_miles <= 0 or route.distance_miles <= 0:
        lat, lon = route.geometry[0]
        return [Checkpoint(mile=0.0, lat=lat, lon=lon, eta=departure)]

    # The geometry's own length differs very slightly from the distance OSRM
    # reports; `scale` converts between the two so mile markers stay accurate.
    scale = route.distance_miles / polyline_miles
    step = choose_interval_miles(route.distance_miles) / scale

    checkpoints: list[Checkpoint] = []
    for lat, lon, along in resample_polyline(route.geometry, step):
        fraction = along / polyline_miles
        checkpoints.append(
            Checkpoint(
                mile=round(along * scale, 2),
                lat=lat,
                lon=lon,
                eta=departure + timedelta(seconds=route.duration_seconds * fraction),
            )
        )
    return checkpoints