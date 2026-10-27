from datetime import datetime, timedelta, timezone

import pytest

from routing.services.checkpoints import build_checkpoints, choose_interval_miles
from routing.services.entities import RouteCandidate

DEPARTURE = datetime(2026, 11, 2, 8, 0, tzinfo=timezone.utc)
MILES_PER_DEGREE_LAT = 69.0937


def _meridian_route(miles: float, hours: float) -> RouteCandidate:
    """A straight north-south route of a known length and duration."""
    return RouteCandidate(
        distance_miles=miles,
        duration_seconds=hours * 3600,
        geometry=[(0.0, 0.0), (miles / MILES_PER_DEGREE_LAT, 0.0)],
    )


@pytest.mark.parametrize(
    ("route_miles", "expected_interval"),
    [(5, 10), (150, 10), (150.1, 25), (500, 25), (500.1, 50), (2500, 50)],
)
def test_interval_depends_on_route_length(route_miles, expected_interval):
    assert choose_interval_miles(route_miles) == expected_interval


def test_short_route_gets_a_checkpoint_every_10_miles():
    checkpoints = build_checkpoints(_meridian_route(miles=100, hours=2), DEPARTURE)

    assert [c.mile for c in checkpoints] == pytest.approx(list(range(0, 101, 10)), abs=0.1)


def test_long_route_gets_a_checkpoint_every_50_miles():
    checkpoints = build_checkpoints(_meridian_route(miles=600, hours=10), DEPARTURE)

    assert len(checkpoints) == 13
    assert [c.mile for c in checkpoints] == pytest.approx(list(range(0, 601, 50)), abs=0.5)


def test_etas_start_at_departure_and_end_at_arrival():
    checkpoints = build_checkpoints(_meridian_route(miles=100, hours=2), DEPARTURE)

    assert checkpoints[0].eta == DEPARTURE
    assert abs(checkpoints[-1].eta - (DEPARTURE + timedelta(hours=2))) < timedelta(seconds=1)


def test_etas_increase_in_proportion_to_distance():
    checkpoints = build_checkpoints(_meridian_route(miles=100, hours=2), DEPARTURE)
    halfway = checkpoints[5]  # mile 50

    assert abs(halfway.eta - (DEPARTURE + timedelta(hours=1))) < timedelta(minutes=1)
    assert [c.eta for c in checkpoints] == sorted(c.eta for c in checkpoints)


def test_zero_length_route_yields_a_single_checkpoint():
    route = RouteCandidate(distance_miles=0, duration_seconds=0, geometry=[(1.0, 1.0), (1.0, 1.0)])

    checkpoints = build_checkpoints(route, DEPARTURE)

    assert len(checkpoints) == 1
    assert checkpoints[0].eta == DEPARTURE