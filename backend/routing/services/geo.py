"""Geographic helper functions (distance, interpolation, offsets)."""

import math
from bisect import bisect_right
from collections.abc import Sequence

from .entities import Point

EARTH_RADIUS_MILES = 3958.8
# If the final stretch is shorter than this share of the step, merge it into
# the previous checkpoint so we don't place two stops right next to each other.
MIN_FINAL_GAP_RATIO = 0.2


def haversine_miles(a: Point, b: Point) -> float:
    """Great-circle distance between two (lat, lon) points, in miles."""
    lat1, lon1 = map(math.radians, a)
    lat2, lon2 = map(math.radians, b)
    d_lat = lat2 - lat1
    d_lon = lon2 - lon1
    h = (
        math.sin(d_lat / 2) ** 2
        + math.cos(lat1) * math.cos(lat2) * math.sin(d_lon / 2) ** 2
    )
    return 2 * EARTH_RADIUS_MILES * math.asin(min(1.0, math.sqrt(h)))


def cumulative_miles(points: Sequence[Point]) -> list[float]:
    """Running distance from the first point to each point of a polyline."""
    cumulative = [0.0]
    for start, end in zip(points, points[1:]):
        cumulative.append(cumulative[-1] + haversine_miles(start, end))
    return cumulative


def polyline_length_miles(points: Sequence[Point]) -> float:
    return cumulative_miles(points)[-1]


def point_at_distance(
    points: Sequence[Point], cumulative: Sequence[float], target_miles: float
) -> Point:
    """The point located `target_miles` along the polyline."""
    if len(points) < 2:
        raise ValueError("A polyline needs at least two points.")
    index = min(max(bisect_right(cumulative, target_miles) - 1, 0), len(points) - 2)
    start, end = points[index], points[index + 1]
    segment = cumulative[index + 1] - cumulative[index]
    ratio = 0.0 if segment == 0 else (target_miles - cumulative[index]) / segment
    ratio = min(max(ratio, 0.0), 1.0)
    return (
        start[0] + (end[0] - start[0]) * ratio,
        start[1] + (end[1] - start[1]) * ratio,
    )


def resample_polyline(
    points: Sequence[Point], step_miles: float
) -> list[tuple[float, float, float]]:
    """Points every `step_miles` along a polyline.

    Returns (lat, lon, miles_from_start) tuples. Always includes the start and
    the end of the line.
    """
    if len(points) < 2:
        raise ValueError("A polyline needs at least two points.")
    if step_miles <= 0:
        raise ValueError("step_miles must be positive.")

    cumulative = cumulative_miles(points)
    total = cumulative[-1]

    targets = [i * step_miles for i in range(int(total // step_miles) + 1)]
    if total - targets[-1] > 1e-9:
        targets.append(total)
    if len(targets) > 2 and total - targets[-2] < step_miles * MIN_FINAL_GAP_RATIO:
        del targets[-2]

    return [(*point_at_distance(points, cumulative, t), t) for t in targets]


def bearing_degrees(start: Point, end: Point) -> float:
    """Compass bearing (0-360, clockwise from north) from start to end."""
    lat1, lon1 = map(math.radians, start)
    lat2, lon2 = map(math.radians, end)
    d_lon = lon2 - lon1
    x = math.sin(d_lon) * math.cos(lat2)
    y = math.cos(lat1) * math.sin(lat2) - math.sin(lat1) * math.cos(lat2) * math.cos(
        d_lon
    )
    return (math.degrees(math.atan2(x, y)) + 360) % 360


def destination_point(start: Point, bearing: float, distance_miles: float) -> Point:
    """The point reached by travelling `distance_miles` on a given bearing."""
    lat1, lon1 = map(math.radians, start)
    theta = math.radians(bearing)
    delta = distance_miles / EARTH_RADIUS_MILES
    lat2 = math.asin(
        math.sin(lat1) * math.cos(delta)
        + math.cos(lat1) * math.sin(delta) * math.cos(theta)
    )
    lon2 = lon1 + math.atan2(
        math.sin(theta) * math.sin(delta) * math.cos(lat1),
        math.cos(delta) - math.sin(lat1) * math.sin(lat2),
    )
    return math.degrees(lat2), (math.degrees(lon2) + 540) % 360 - 180


def decimate(points: Sequence[Point], max_points: int) -> list[Point]:
    """Thin out a long polyline (keeping first and last point).

    Long routes can have tens of thousands of vertices. Reducing them keeps the
    API response small and the map fast, with no visible difference.
    """
    if max_points < 2:
        raise ValueError("max_points must be at least 2.")
    if len(points) <= max_points:
        return list(points)
    step = math.ceil(len(points) / max_points)
    reduced = list(points[::step])
    if reduced[-1] != points[-1]:
        reduced.append(points[-1])
    return reduced