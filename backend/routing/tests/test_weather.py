from datetime import date, datetime, timedelta, timezone
from urllib.parse import parse_qs, urlparse

import pytest
import requests
import responses

from routing.services.entities import HourlyForecast
from routing.services.exceptions import ExternalServiceError
from routing.services.weather import (
    MAX_LOCATIONS_PER_REQUEST,
    OPEN_METEO_URL,
    fetch_forecasts,
    nearest_hour,
    reading_at,
    round_point,
)
from routing.tests.helpers import Conditions, open_meteo_callback, reading

DAY = date(2026, 10, 27)
HOUR_14 = datetime(2026, 10, 27, 14, tzinfo=timezone.utc)
HOUR_15 = HOUR_14 + timedelta(hours=1)
DALLAS = (32.78, -96.80)
OKC = (35.47, -97.52)


def _query(call) -> dict:
    return parse_qs(urlparse(call.request.url).query)


def _add_fake_open_meteo(conditions_fn=None):
    kwargs = {} if conditions_fn is None else {"conditions_fn": conditions_fn}
    responses.add_callback(
        responses.GET,
        OPEN_METEO_URL,
        callback=open_meteo_callback(**kwargs),
        content_type="application/json",
    )


@responses.activate
def test_fetch_asks_for_mph_inches_and_utc():
    _add_fake_open_meteo()

    fetch_forecasts([(32.7767, -96.797)], DAY, DAY)

    query = _query(responses.calls[0])
    assert query["wind_speed_unit"] == ["mph"]
    assert query["precipitation_unit"] == ["inch"]
    assert query["timezone"] == ["UTC"]
    assert query["start_date"] == ["2026-10-27"] and query["end_date"] == ["2026-10-27"]
    assert query["latitude"] == ["32.78"] and query["longitude"] == ["-96.80"]


@responses.activate
def test_fetch_combines_rain_with_showers_and_treats_null_as_zero():
    payload = {
        "hourly": {
            "time": ["2026-10-27T14:00", "2026-10-27T15:00"],
            "wind_speed_10m": [12.5, None],
            "rain": [0.05, 0.1],
            "showers": [0.02, None],
            "snowfall": [0.0, 0.3],
        }
    }
    responses.add(responses.GET, OPEN_METEO_URL, json=payload)

    forecasts = fetch_forecasts([DALLAS], DAY, DAY)

    forecast = forecasts[round_point(*DALLAS)]
    first, second = forecast.readings[HOUR_14], forecast.readings[HOUR_15]
    assert first.wind_mph == 12.5
    assert first.rain_in_hr == pytest.approx(0.07)
    assert second.wind_mph == 0.0
    assert second.rain_in_hr == pytest.approx(0.1)
    assert second.snow_in_hr == pytest.approx(0.3)


@responses.activate
def test_results_are_matched_to_the_right_location():
    _add_fake_open_meteo(lambda lat, lon, when: Conditions(wind=lat))  # wind encodes latitude

    forecasts = fetch_forecasts([DALLAS, OKC], DAY, DAY)

    assert forecasts[round_point(*DALLAS)].readings[HOUR_14].wind_mph == pytest.approx(32.78)
    assert forecasts[round_point(*OKC)].readings[HOUR_14].wind_mph == pytest.approx(35.47)


@responses.activate
def test_nearby_points_share_one_request_location():
    _add_fake_open_meteo()

    forecasts = fetch_forecasts([(32.7761, -96.7971), (32.7764, -96.7968)], DAY, DAY)

    assert len(forecasts) == 1
    assert _query(responses.calls[0])["latitude"] == ["32.78"]


@responses.activate
def test_requests_are_split_into_chunks_of_50_locations():
    _add_fake_open_meteo()
    points = [(30.0 + index * 0.1, -97.0) for index in range(120)]

    forecasts = fetch_forecasts(points, DAY, DAY)

    sizes = [len(_query(call)["latitude"][0].split(",")) for call in responses.calls]
    assert len(forecasts) == 120
    assert sizes == [MAX_LOCATIONS_PER_REQUEST, MAX_LOCATIONS_PER_REQUEST, 20]


@responses.activate
def test_cached_points_are_not_requested_again():
    _add_fake_open_meteo()

    fetch_forecasts([DALLAS], DAY, DAY)
    fetch_forecasts([DALLAS, OKC], DAY, DAY)

    assert len(responses.calls) == 2
    assert _query(responses.calls[1])["latitude"] == ["35.47"]


@responses.activate
def test_server_error_is_translated():
    responses.add(responses.GET, OPEN_METEO_URL, status=500)

    with pytest.raises(ExternalServiceError):
        fetch_forecasts([DALLAS], DAY, DAY)


@responses.activate
def test_rate_limit_has_a_helpful_message():
    responses.add(responses.GET, OPEN_METEO_URL, status=429)

    with pytest.raises(ExternalServiceError, match="rate limit"):
        fetch_forecasts([DALLAS], DAY, DAY)


@responses.activate
def test_connection_error_is_translated():
    responses.add(responses.GET, OPEN_METEO_URL, body=requests.ConnectionError("boom"))

    with pytest.raises(ExternalServiceError):
        fetch_forecasts([DALLAS], DAY, DAY)


@responses.activate
def test_unexpected_payload_is_translated():
    responses.add(responses.GET, OPEN_METEO_URL, json={"error": True, "reason": "bad request"})

    with pytest.raises(ExternalServiceError):
        fetch_forecasts([DALLAS], DAY, DAY)


@responses.activate
def test_wrong_number_of_locations_in_response_is_rejected():
    payload = {"hourly": {"time": [], "wind_speed_10m": [], "rain": [], "showers": [], "snowfall": []}}
    responses.add(responses.GET, OPEN_METEO_URL, json=[payload, payload])

    with pytest.raises(ExternalServiceError):
        fetch_forecasts([DALLAS], DAY, DAY)


def test_nearest_hour_rounds_to_the_closest_hour():
    assert nearest_hour(datetime(2026, 10, 27, 14, 29, tzinfo=timezone.utc)) == HOUR_14
    assert nearest_hour(datetime(2026, 10, 27, 14, 30, tzinfo=timezone.utc)) == HOUR_15


def test_reading_at_handles_other_time_zones():
    forecast = HourlyForecast(readings={HOUR_14: reading(wind=10), HOUR_15: reading(wind=20)})
    ist = timezone(timedelta(hours=5, minutes=30))

    # 20:00 IST is 14:30 UTC, which rounds to the 15:00 UTC reading.
    assert reading_at(forecast, datetime(2026, 10, 27, 20, 0, tzinfo=ist)).wind_mph == 20


def test_reading_at_outside_the_forecast_raises():
    forecast = HourlyForecast(readings={HOUR_14: reading()})

    with pytest.raises(ExternalServiceError):
        reading_at(forecast, HOUR_14 + timedelta(hours=5))