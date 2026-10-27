"""Integration tests: the whole /api/analyze/ pipeline with the three external APIs faked."""

from datetime import datetime, timedelta, timezone

import pytest
import responses
from rest_framework.test import APIClient

from routing.services.geocoding import NOMINATIM_URL
from routing.services.weather import OPEN_METEO_URL
from routing.tests.helpers import (
    OSRM_URL,
    Conditions,
    calm,
    mock_geocoding,
    mock_routing,
    mock_weather,
)

URL = "/api/analyze/"
NOW = datetime.now(timezone.utc)
DEPARTURE = (NOW + timedelta(days=1)).replace(minute=0, second=0, microsecond=0)
PAYLOAD = {
    "origin": "Dallas, TX",
    "destination": "Oklahoma City, OK",
    "departure_time": DEPARTURE.isoformat(),
    "load_weight_lb": 45_000,
}


@pytest.fixture
def services():
    """Fake Nominatim, OSRM and Open-Meteo. Any other web request fails the test."""
    with responses.RequestsMock(assert_all_requests_are_fired=False) as mock:
        yield mock


def install(mock, conditions=calm):
    mock_geocoding(mock)
    mock_routing(mock)
    mock_weather(mock, conditions)


def analyze(load_lb=45_000, **overrides):
    payload = {**PAYLOAD, "load_weight_lb": load_lb, **overrides}
    return APIClient().post(URL, payload, format="json")


def storm_over_the_western_route(lat, lon, when):
    """40 mph wind west of longitude -98, which only the fastest (west) route crosses."""
    return Conditions(wind=40.0) if lon < -98.0 else Conditions()


def everything_blocked(lat, lon, when):
    return Conditions(wind=60.0)


def storm_arrives_after_a_day(lat, lon, when):
    return Conditions(wind=60.0) if when >= DEPARTURE + timedelta(hours=24) else Conditions()


# --- Happy paths ----------------------------------------------------------------------
def test_response_contains_everything_the_ui_needs(services):
    install(services)

    response = analyze()

    assert response.status_code == 200
    body = response.json()
    assert set(body) == {
        "origin", "destination", "departure_time", "load_weight_lb",
        "recommendation", "routes", "heatmap",
    }
    assert body["origin"]["name"].startswith("Dallas")
    assert body["destination"]["name"].startswith("Oklahoma City")
    assert [route["id"] for route in body["routes"]] == ["route-1", "route-2", "route-3"]

    route = body["routes"][0]
    assert set(route) == {
        "id", "rank", "is_recommended", "distance_miles", "duration_seconds",
        "arrival_time", "checkpoint_interval_miles", "summary", "geometry", "checkpoints",
    }
    assert route["checkpoint_interval_miles"] == 25
    first, last = route["checkpoints"][0], route["checkpoints"][-1]
    assert first["mile"] == 0
    assert first["eta"] == DEPARTURE.strftime("%Y-%m-%dT%H:%M:%SZ")
    assert last["eta"] == route["arrival_time"]
    assert set(first["weather"]) == {"wind_mph", "rain_in_hr", "snow_in_hr"}
    assert set(first["risk"]) == {"level", "label", "score", "factor", "load_adjusted"}


def test_calm_weather_recommends_the_fastest_route(services):
    install(services)

    body = analyze().json()

    assert body["recommendation"]["route_id"] == "route-1"
    assert body["recommendation"]["has_safe_route"] is True
    assert body["recommendation"]["reason"].startswith("Shortest travel time")
    assert body["routes"][0]["is_recommended"] is True
    assert [route["rank"] for route in body["routes"]] == [1, 2, 3]
    assert all(route["summary"]["worst_level"] == "low" for route in body["routes"])


def test_storm_on_the_fast_route_with_a_heavy_load_is_severe_and_avoided(services):
    install(services, storm_over_the_western_route)

    body = analyze(load_lb=45_000).json()

    west, middle, _east = body["routes"]
    assert 75 <= west["summary"]["miles_by_level"]["severe"] <= 130
    assert west["summary"]["miles_by_level"]["high"] == 0
    assert middle["summary"]["miles_by_level"]["severe"] == 0
    assert body["recommendation"]["route_id"] == "route-2"
    assert body["recommendation"]["reason"].startswith("Fewest Severe miles")

    stormy = [c for c in west["checkpoints"] if c["risk"]["level"] == "severe"]
    assert stormy
    assert all(c["risk"]["load_adjusted"] and c["risk"]["factor"] == "wind" for c in stormy)


def test_the_same_storm_is_only_high_risk_for_a_lighter_load(services):
    install(services, storm_over_the_western_route)

    body = analyze(load_lb=20_000).json()

    west = body["routes"][0]
    assert west["summary"]["miles_by_level"]["severe"] == 0
    assert 75 <= west["summary"]["miles_by_level"]["high"] <= 130
    assert not any(c["risk"]["load_adjusted"] for c in west["checkpoints"])
    assert body["recommendation"]["route_id"] == "route-2"
    assert body["recommendation"]["reason"].startswith("Fewest High miles")


def test_when_every_route_is_blocked_there_is_no_safe_route(services):
    install(services, everything_blocked)

    body = analyze().json()

    assert body["recommendation"]["has_safe_route"] is False
    assert body["recommendation"]["route_id"] == "route-2"  # shortest, so least exposure
    assert body["recommendation"]["reason"].startswith("Every route crosses No Travel weather")


def test_heatmap_frames_follow_the_forecast_hour_by_hour(services):
    install(services, storm_arrives_after_a_day)

    body = analyze().json()

    # The drive itself (a few hours) is calm, so the checkpoints are all Low...
    assert all(route["summary"]["worst_level"] == "low" for route in body["routes"])
    # ...but the heatmap slider shows the storm arriving 24 hours after departure.
    heatmap = body["heatmap"]
    assert len(heatmap["hours"]) == 49
    assert heatmap["hours"][0] == DEPARTURE.strftime("%Y-%m-%dT%H:%M:%SZ")
    assert [entry["route_id"] for entry in heatmap["routes"]] == ["route-1", "route-2", "route-3"]
    for entry in heatmap["routes"]:
        frames = entry["frames"]
        assert len(frames) == 49
        assert all(len(frame) == len(entry["points"]) for frame in frames)
        assert set(frames[0]) == {1} and set(frames[23]) == {1}
        assert set(frames[24]) == {5} and set(frames[48]) == {5}


# --- Validation -----------------------------------------------------------------------
@pytest.mark.parametrize(
    ("override", "field"),
    [
        ({"origin": ""}, "origin"),
        ({"destination": "   "}, "destination"),
        ({"load_weight_lb": 0}, "load_weight_lb"),
        ({"load_weight_lb": 80_001}, "load_weight_lb"),
        ({"load_weight_lb": "heavy"}, "load_weight_lb"),
        ({"departure_time": "tomorrow"}, "departure_time"),
        ({"departure_time": (NOW - timedelta(hours=5)).isoformat()}, "departure_time"),
        ({"departure_time": (NOW + timedelta(days=30)).isoformat()}, "departure_time"),
    ],
)
def test_invalid_input_is_rejected_with_field_errors(override, field):
    response = APIClient().post(URL, {**PAYLOAD, **override}, format="json")

    assert response.status_code == 400
    body = response.json()
    assert body["error"] == "Invalid input."
    assert field in body["fields"]


def test_missing_fields_are_all_reported():
    response = APIClient().post(URL, {}, format="json")

    assert response.status_code == 400
    assert set(response.json()["fields"]) == {
        "origin", "destination", "departure_time", "load_weight_lb",
    }


# --- Failures of the outside world ----------------------------------------------------
def test_unknown_place_returns_404(services):
    mock_geocoding(services)

    response = analyze(origin="Atlantis")

    assert response.status_code == 404
    assert "Atlantis" in response.json()["error"]


def test_no_drivable_route_returns_422(services):
    mock_geocoding(services)
    services.add(responses.GET, OSRM_URL, json={"code": "NoRoute"}, status=400)

    response = analyze()

    assert response.status_code == 422


def test_geocoder_outage_returns_502(services):
    services.add(responses.GET, NOMINATIM_URL, status=500)

    response = analyze()

    assert response.status_code == 502
    assert "geocoding" in response.json()["error"]


def test_weather_outage_returns_502(services):
    mock_geocoding(services)
    mock_routing(services)
    services.add(responses.GET, OPEN_METEO_URL, status=500)

    response = analyze()

    assert response.status_code == 502
    assert "weather" in response.json()["error"]