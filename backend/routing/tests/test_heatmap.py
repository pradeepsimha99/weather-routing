from datetime import datetime, timedelta, timezone

from routing.services.checkpoints import build_checkpoints
from routing.services.entities import HourlyForecast, RiskLevel
from routing.services.heatmap import HEATMAP_HOURS, build_heatmap
from routing.services.route_analysis import analyze_route
from routing.services.weather import round_point
from routing.tests.helpers import meridian_route, reading

DEPARTURE = datetime(2026, 11, 2, 8, 0, tzinfo=timezone.utc)


def _build(wind_by_hour, load_lb=20_000):
    route = meridian_route(miles=100, hours=2)
    checkpoints = build_checkpoints(route, DEPARTURE)
    readings = {
        DEPARTURE + timedelta(hours=hour): reading(wind=wind_by_hour(hour)) for hour in range(60)
    }
    forecasts = {
        round_point(c.lat, c.lon): HourlyForecast(readings=readings) for c in checkpoints
    }
    analysis = analyze_route("route-1", route, checkpoints, forecasts, load_lb)
    return build_heatmap([analysis], forecasts, DEPARTURE, load_lb), checkpoints


def test_one_frame_per_hour_with_one_value_per_checkpoint():
    heatmap, checkpoints = _build(lambda hour: 5.0)

    route = heatmap.routes[0]
    assert len(heatmap.hours) == HEATMAP_HOURS + 1 == 49
    assert heatmap.hours[0] == DEPARTURE
    assert heatmap.hours[-1] == DEPARTURE + timedelta(hours=48)
    assert len(route.points) == len(checkpoints)
    assert len(route.frames) == 49
    assert all(len(frame) == len(route.points) for frame in route.frames)


def test_frames_follow_the_forecast_over_time():
    heatmap, _ = _build(lambda hour: 5.0 if hour < 24 else 40.0)

    frames = heatmap.routes[0].frames
    assert set(frames[0]) == {RiskLevel.LOW}
    assert set(frames[23]) == {RiskLevel.LOW}
    assert set(frames[24]) == {RiskLevel.HIGH}
    assert set(frames[48]) == {RiskLevel.HIGH}


def test_heatmap_uses_the_load_rules_for_this_truck():
    heatmap, _ = _build(lambda hour: 40.0, load_lb=45_000)

    assert set(heatmap.routes[0].frames[10]) == {RiskLevel.SEVERE}