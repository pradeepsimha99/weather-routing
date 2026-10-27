import re

import pytest
import responses

from routing.services import route_provider
from routing.services.entities import Coordinate, RouteCandidate
from routing.services.exceptions import ExternalServiceError, NoRouteFoundError
from routing.services.route_provider import (
    MAX_VIA_ATTEMPTS,
    METERS_PER_MILE,
    OSRM_BASE_URL,
    get_route_options,
)

OSRM_URL = re.compile(re.escape(OSRM_BASE_URL) + r"/.*")
DALLAS = Coordinate(lat=32.7767, lon=-96.7970)
OKC = Coordinate(lat=35.4676, lon=-97.5164)


def _osrm_route(lon_lat_pairs, distance_m, duration_s):
    return {
        "distance": distance_m,
        "duration": duration_s,
        "geometry": {"type": "LineString", "coordinates": lon_lat_pairs},
    }


ROUTE_FAST = _osrm_route(
    [[-96.7970, 32.7767], [-98.3, 33.5], [-98.3, 34.5], [-97.5164, 35.4676]], 400_000, 11_000
)
ROUTE_MID = _osrm_route(
    [[-96.7970, 32.7767], [-97.1331, 33.2148], [-97.1436, 34.1743], [-97.5164, 35.4676]],
    300_000,
    12_000,
)
ROUTE_SCENIC = _osrm_route(
    [[-96.7970, 32.7767], [-96.6, 33.9], [-96.8, 35.0], [-97.5164, 35.4676]], 330_000, 14_000
)


def _candidate(distance_miles: float, duration_seconds: float) -> RouteCandidate:
    return RouteCandidate(
        distance_miles=distance_miles,
        duration_seconds=duration_seconds,
        geometry=[(DALLAS.lat, DALLAS.lon), (OKC.lat, OKC.lon)],
    )


@responses.activate
def test_returns_three_routes_sorted_fastest_first():
    payload = {"code": "Ok", "routes": [ROUTE_SCENIC, ROUTE_FAST, ROUTE_MID]}
    responses.add(responses.GET, OSRM_URL, json=payload)

    routes = get_route_options(DALLAS, OKC)

    assert [r.duration_seconds for r in routes] == [11_000, 12_000, 14_000]
    assert routes[0].distance_miles == pytest.approx(400_000 / METERS_PER_MILE)
    # GeoJSON [lon, lat] must be flipped to (lat, lon).
    assert routes[0].geometry[0] == pytest.approx((32.7767, -96.7970))
    assert len(responses.calls) == 1  # three routes found, so no fallback needed
    assert "alternatives=3" in responses.calls[0].request.url


@responses.activate
def test_second_identical_request_is_served_from_cache():
    payload = {"code": "Ok", "routes": [ROUTE_FAST, ROUTE_MID, ROUTE_SCENIC]}
    responses.add(responses.GET, OSRM_URL, json=payload)

    get_route_options(DALLAS, OKC)
    get_route_options(DALLAS, OKC)

    assert len(responses.calls) == 1


@responses.activate
def test_no_route_error_is_translated():
    responses.add(
        responses.GET, OSRM_URL, json={"code": "NoRoute", "message": "Impossible"}, status=400
    )

    with pytest.raises(NoRouteFoundError):
        get_route_options(DALLAS, OKC)


@responses.activate
def test_server_failure_is_translated():
    responses.add(responses.GET, OSRM_URL, body="Bad gateway", status=502)

    with pytest.raises(ExternalServiceError):
        get_route_options(DALLAS, OKC)


@responses.activate
def test_identical_origin_and_destination_is_rejected():
    tiny = _osrm_route([[-96.7970, 32.7767], [-96.7971, 32.7768]], 300, 30)
    responses.add(responses.GET, OSRM_URL, json={"code": "Ok", "routes": [tiny]})

    with pytest.raises(NoRouteFoundError):
        get_route_options(DALLAS, OKC)


def test_fallback_adds_detour_routes_when_osrm_returns_fewer_than_three(monkeypatch):
    base = _candidate(186.0, 11_000)
    detour_a = _candidate(200.0, 12_000)
    detour_b = _candidate(215.0, 13_500)
    calls = []

    def fake_request(waypoints, *, alternatives):
        calls.append((len(waypoints), alternatives))
        if alternatives:
            return [base]
        return [detour_a if len(calls) == 2 else detour_b]

    monkeypatch.setattr(route_provider, "_request_osrm", fake_request)

    routes = get_route_options(DALLAS, OKC)

    assert [r.duration_seconds for r in routes] == [11_000, 12_000, 13_500]
    assert calls[0] == (2, True)
    assert all(count == 3 and not alt for count, alt in calls[1:])


@pytest.mark.parametrize(
    "rejected_detour",
    [
        _candidate(186.0, 11_000),  # duplicate of the base route
        _candidate(560.0, 33_000),  # far too slow to be a sensible alternative
    ],
    ids=["duplicate", "too-slow"],
)
def test_fallback_rejects_duplicate_and_unreasonable_detours(monkeypatch, rejected_detour):
    base = _candidate(186.0, 11_000)
    calls = []

    def fake_request(waypoints, *, alternatives):
        calls.append(alternatives)
        return [base] if alternatives else [rejected_detour]

    monkeypatch.setattr(route_provider, "_request_osrm", fake_request)

    routes = get_route_options(DALLAS, OKC)

    assert routes == [base]
    assert len(calls) == 1 + MAX_VIA_ATTEMPTS  # bounded number of extra calls


def test_fallback_failures_do_not_break_the_request(monkeypatch):
    base = _candidate(186.0, 11_000)

    def fake_request(waypoints, *, alternatives):
        if alternatives:
            return [base]
        raise ExternalServiceError("detour failed")

    monkeypatch.setattr(route_provider, "_request_osrm", fake_request)

    assert get_route_options(DALLAS, OKC) == [base]