from datetime import datetime, timedelta, timezone

import pytest

from routing.services.checkpoints import build_checkpoints
from routing.services.entities import HourlyForecast, RiskLevel
from routing.services.route_analysis import analyze_route, segment_lengths
from routing.services.weather import round_point
from routing.tests.helpers import meridian_route, reading

DEPARTURE = datetime(2026, 11, 2, 8, 0, tzinfo=timezone.utc)


def _analyze(wind_by_hour, load_lb=20_000):
    """A 100-mile, 2-hour route with 11 checkpoints; wind depends on the forecast hour."""
    route = meridian_route(miles=100, hours=2)
    checkpoints = build_checkpoints(route, DEPARTURE)
    readings = {
        DEPARTURE + timedelta(hours=hour): reading(wind=wind_by_hour(hour)) for hour in range(6)
    }
    forecasts = {
        round_point(c.lat, c.lon): HourlyForecast(readings=readings) for c in checkpoints
    }
    return analyze_route("route-1", route, checkpoints, forecasts, load_lb)


def test_segments_split_the_road_halfway_between_checkpoints():
    assert segment_lengths([0, 10, 20, 30], 30) == [5, 10, 10, 5]


def test_segments_always_add_up_to_the_route_length():
    assert sum(segment_lengths([0, 25, 50, 69.1], 69.1)) == pytest.approx(69.1)


def test_single_checkpoint_covers_the_whole_route():
    assert segment_lengths([0], 12.5) == [12.5]


def test_weather_is_sampled_at_each_checkpoints_eta_not_at_departure():
    # Calm for the first 1.5 hours of the drive, then a storm (60 mph = No Travel).
    analysis = _analyze(lambda hour: 5.0 if hour < 2 else 60.0)

    levels = [item.risk.level for item in analysis.assessments]
    assert levels == [RiskLevel.LOW] * 8 + [RiskLevel.NO_TRAVEL] * 3  # miles 80, 90, 100
    assert analysis.miles_by_level[RiskLevel.NO_TRAVEL] == pytest.approx(25, abs=0.1)
    assert analysis.miles_by_level[RiskLevel.LOW] == pytest.approx(75, abs=0.1)
    assert analysis.has_no_travel is True
    assert analysis.worst_level is RiskLevel.NO_TRAVEL


def test_average_risk_is_weighted_by_miles():
    analysis = _analyze(lambda hour: 5.0 if hour < 2 else 60.0)

    # 75 miles at score 1 and 25 miles at score 5 -> (75 * 1 + 25 * 5) / 100
    assert analysis.average_risk == pytest.approx(2.0, abs=0.01)


@pytest.mark.parametrize(
    ("load_lb", "expected"), [(20_000, RiskLevel.HIGH), (45_000, RiskLevel.SEVERE)]
)
def test_heavier_load_raises_the_risk_of_the_same_wind(load_lb, expected):
    analysis = _analyze(lambda hour: 40.0, load_lb=load_lb)

    assert {item.risk.level for item in analysis.assessments} == {expected}
    assert analysis.miles_by_level[expected] == pytest.approx(100, abs=0.1)
    assert analysis.average_risk == pytest.approx(int(expected), abs=0.01)


def test_miles_by_level_add_up_to_the_distance_and_arrival_matches_duration():
    analysis = _analyze(lambda hour: 5.0)

    assert sum(analysis.miles_by_level.values()) == pytest.approx(100)
    assert abs(analysis.arrival - (DEPARTURE + timedelta(hours=2))) < timedelta(seconds=1)