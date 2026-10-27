"""Hourly weather from Open-Meteo, returned in the units used by the risk rules."""

from collections.abc import Iterator, Sequence
from datetime import date, datetime, timedelta, timezone

import requests
from django.conf import settings
from django.core.cache import cache

from .entities import HourlyForecast, Point, WeatherReading
from .exceptions import ExternalServiceError

OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"
# "rain" is large-scale rain and "showers" is convective rain: both count as rain.
HOURLY_VARIABLES = "wind_speed_10m,rain,showers,snowfall"
MAX_LOCATIONS_PER_REQUEST = 50
# Two decimals is roughly 0.7 miles, finer than the forecast grid itself. Rounding
# lets nearby points share one cached forecast.
COORDINATE_DECIMALS = 2
CACHE_TTL_SECONDS = 30 * 60


def round_point(lat: float, lon: float) -> Point:
    """The key under which a location's forecast is stored."""
    return round(lat, COORDINATE_DECIMALS), round(lon, COORDINATE_DECIMALS)


def nearest_hour(when: datetime) -> datetime:
    """Round a moment to the closest whole UTC hour (the forecast's resolution)."""
    utc = when.astimezone(timezone.utc)
    return (utc + timedelta(minutes=30)).replace(minute=0, second=0, microsecond=0)


def reading_at(forecast: HourlyForecast, when: datetime) -> WeatherReading:
    """The forecast for the hour closest to `when`."""
    try:
        return forecast.readings[nearest_hour(when)]
    except KeyError as exc:
        raise ExternalServiceError(
            "The weather forecast does not cover the requested travel time."
        ) from exc


def fetch_forecasts(
    points: Sequence[Point], start: date, end: date
) -> dict[Point, HourlyForecast]:
    """Hourly forecasts for every point between two UTC dates (inclusive).

    The result is keyed by `round_point(lat, lon)`.
    """
    unique = list(dict.fromkeys(round_point(lat, lon) for lat, lon in points))

    forecasts: dict[Point, HourlyForecast] = {}
    missing: list[Point] = []
    for point in unique:
        cached = cache.get(_cache_key(point, start, end))
        if cached is None:
            missing.append(point)
        else:
            forecasts[point] = cached

    for chunk in _chunks(missing, MAX_LOCATIONS_PER_REQUEST):
        for point, forecast in zip(chunk, _request_chunk(chunk, start, end)):
            cache.set(_cache_key(point, start, end), forecast, CACHE_TTL_SECONDS)
            forecasts[point] = forecast
    return forecasts


def _cache_key(point: Point, start: date, end: date) -> str:
    return f"weather:{point[0]:.2f},{point[1]:.2f}:{start.isoformat()}:{end.isoformat()}"


def _chunks(items: list[Point], size: int) -> Iterator[list[Point]]:
    for index in range(0, len(items), size):
        yield items[index : index + size]


def _request_chunk(chunk: list[Point], start: date, end: date) -> list[HourlyForecast]:
    """One Open-Meteo call for several locations. Results come back in request order."""
    params = {
        "latitude": ",".join(f"{lat:.2f}" for lat, _ in chunk),
        "longitude": ",".join(f"{lon:.2f}" for _, lon in chunk),
        "hourly": HOURLY_VARIABLES,
        "wind_speed_unit": "mph",
        "precipitation_unit": "inch",
        "timezone": "UTC",
        "start_date": start.isoformat(),
        "end_date": end.isoformat(),
    }
    try:
        response = requests.get(
            OPEN_METEO_URL, params=params, timeout=settings.EXTERNAL_API_TIMEOUT_SECONDS
        )
    except requests.RequestException as exc:
        raise ExternalServiceError(
            "The weather service is unavailable. Please try again."
        ) from exc

    if response.status_code == 429:
        raise ExternalServiceError(
            "The weather service rate limit was reached. Please try again in a minute."
        )
    try:
        response.raise_for_status()
        payload = response.json()
    except (requests.RequestException, ValueError) as exc:
        raise ExternalServiceError("The weather service returned an error.") from exc

    # One location returns an object, several locations return a list.
    items = payload if isinstance(payload, list) else [payload]
    if len(items) != len(chunk):
        raise ExternalServiceError("The weather service returned an unexpected response.")
    try:
        return [_parse_forecast(item) for item in items]
    except (KeyError, TypeError, ValueError) as exc:
        raise ExternalServiceError(
            "The weather service returned an unexpected response."
        ) from exc


def _parse_forecast(item: dict) -> HourlyForecast:
    hourly = item["hourly"]
    readings: dict[datetime, WeatherReading] = {}
    for time, wind, rain, showers, snow in zip(
        hourly["time"],
        hourly["wind_speed_10m"],
        hourly["rain"],
        hourly["showers"],
        hourly["snowfall"],
    ):
        hour = datetime.fromisoformat(time).replace(tzinfo=timezone.utc)
        readings[hour] = WeatherReading(
            wind_mph=wind or 0.0,
            rain_in_hr=(rain or 0.0) + (showers or 0.0),
            snow_in_hr=snow or 0.0,
        )
    return HourlyForecast(readings=readings)