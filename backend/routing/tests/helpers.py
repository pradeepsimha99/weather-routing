"""Shared builders for the weather, analysis and API tests."""

import json
import re
from collections.abc import Callable
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from urllib.parse import parse_qs, urlparse

import responses

from routing.services.entities import RouteCandidate, WeatherReading
from routing.services.geocoding import NOMINATIM_URL
from routing.services.route_provider import OSRM_BASE_URL
from routing.services.weather import OPEN_METEO_URL

MILES_PER_DEGREE_LAT = 69.0937
OSRM_URL = re.compile(re.escape(OSRM_BASE_URL) + r"/.*")


def reading(wind: float = 5.0, rain: float = 0.0, snow: float = 0.0) -> WeatherReading:
    return WeatherReading(wind_mph=wind, rain_in_hr=rain, snow_in_hr=snow)


def meridian_route(miles: float, hours: float) -> RouteCandidate:
    """A straight north-south route of a known length and duration."""
    return RouteCandidate(
        distance_miles=miles,
        duration_seconds=hours * 3600,
        geometry=[(0.0, 0.0), (miles / MILES_PER_DEGREE_LAT, 0.0)],
    )


# --- Weather ------------------------------------------------------------------------
@dataclass(frozen=True)
class Conditions:
    """Weather a fake Open-Meteo returns for one place and hour (calm by default)."""

    wind: float = 5.0
    rain: float = 0.0
    showers: float = 0.0
    snow: float = 0.0


ConditionsFn = Callable[[float, float, datetime], Conditions]


def calm(lat: float, lon: float, when: datetime) -> Conditions:
    return Conditions()


def open_meteo_payload(lats, lons, start: date, end: date, conditions_fn: ConditionsFn):
    """Build a response shaped like Open-Meteo's (object for 1 place, list for more)."""
    hours = []
    moment = datetime.combine(start, time.min, tzinfo=timezone.utc)
    stop = datetime.combine(end, time.max, tzinfo=timezone.utc)
    while moment <= stop:
        hours.append(moment)
        moment += timedelta(hours=1)

    locations = []
    for lat, lon in zip(lats, lons):
        samples = [conditions_fn(lat, lon, hour) for hour in hours]
        locations.append(
            {
                "latitude": lat,
                "longitude": lon,
                "hourly": {
                    "time": [hour.strftime("%Y-%m-%dT%H:%M") for hour in hours],
                    "wind_speed_10m": [s.wind for s in samples],
                    "rain": [s.rain for s in samples],
                    "showers": [s.showers for s in samples],
                    "snowfall": [s.snow for s in samples],
                },
            }
        )
    return locations[0] if len(locations) == 1 else locations


def open_meteo_callback(conditions_fn: ConditionsFn = calm):
    def callback(request):
        query = parse_qs(urlparse(request.url).query)
        lats = [float(value) for value in query["latitude"][0].split(",")]
        lons = [float(value) for value in query["longitude"][0].split(",")]
        start = date.fromisoformat(query["start_date"][0])
        end = date.fromisoformat(query["end_date"][0])
        body = open_meteo_payload(lats, lons, start, end, conditions_fn)
        return 200, {}, json.dumps(body)

    return callback


def mock_weather(mock, conditions_fn: ConditionsFn = calm) -> None:
    mock.add_callback(
        responses.GET,
        OPEN_METEO_URL,
        callback=open_meteo_callback(conditions_fn),
        content_type="application/json",
    )


# --- Geocoding ----------------------------------------------------------------------
PLACES = {
    "Dallas, TX": ("Dallas, Dallas County, Texas, United States", 32.7767, -96.7970),
    "Oklahoma City, OK": (
        "Oklahoma City, Oklahoma County, Oklahoma, United States",
        35.4676,
        -97.5164,
    ),
}


def _nominatim_callback(request):
    query = parse_qs(urlparse(request.url).query)["q"][0]
    place = PLACES.get(query)
    results = (
        []
        if place is None
        else [{"display_name": place[0], "lat": str(place[1]), "lon": str(place[2])}]
    )
    return 200, {}, json.dumps(results)


def mock_geocoding(mock) -> None:
    mock.add_callback(
        responses.GET,
        NOMINATIM_URL,
        callback=_nominatim_callback,
        content_type="application/json",
    )


# --- Routing ------------------------------------------------------------------------
def _osrm_route(lon_lat_pairs, distance_m, duration_s):
    return {
        "distance": distance_m,
        "duration": duration_s,
        "geometry": {"type": "LineString", "coordinates": lon_lat_pairs},
    }


# Three Dallas -> Oklahoma City routes: west (fastest), middle (I-35 style), east.
ROUTE_WEST = _osrm_route(
    [[-96.7970, 32.7767], [-98.3, 33.5], [-98.3, 34.5], [-97.5164, 35.4676]], 400_000, 11_000
)
ROUTE_MIDDLE = _osrm_route(
    [[-96.7970, 32.7767], [-97.1331, 33.2148], [-97.1436, 34.1743], [-97.5164, 35.4676]],
    300_000,
    12_000,
)
ROUTE_EAST = _osrm_route(
    [[-96.7970, 32.7767], [-96.6, 33.9], [-96.8, 35.0], [-97.5164, 35.4676]], 330_000, 14_000
)


def mock_routing(mock) -> None:
    mock.add(
        responses.GET,
        OSRM_URL,
        json={"code": "Ok", "routes": [ROUTE_EAST, ROUTE_WEST, ROUTE_MIDDLE]},
    )