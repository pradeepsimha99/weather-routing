"""Convert a free-text place name into coordinates using OpenStreetMap Nominatim."""

import hashlib
import threading
import time

import requests
from django.conf import settings
from django.core.cache import cache

from .entities import Coordinate, Location
from .exceptions import ExternalServiceError, LocationNotFoundError

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
CACHE_TTL_SECONDS = 24 * 60 * 60
# Nominatim's usage policy allows at most one request per second.
_MIN_INTERVAL_SECONDS = 1.1

_throttle_lock = threading.Lock()
_last_request_at = float("-inf")


def _wait_for_rate_limit() -> None:
    """Sleep if needed so we never exceed Nominatim's request rate."""
    global _last_request_at
    with _throttle_lock:
        elapsed = time.monotonic() - _last_request_at
        if elapsed < _MIN_INTERVAL_SECONDS:
            time.sleep(_MIN_INTERVAL_SECONDS - elapsed)
        _last_request_at = time.monotonic()


def geocode(query: str) -> Location:
    """Resolve a place name to a Location, or raise a RoutingError."""
    normalized = " ".join(query.split())
    cache_key = "geocode:" + hashlib.sha256(normalized.lower().encode("utf-8")).hexdigest()

    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    _wait_for_rate_limit()
    try:
        response = requests.get(
            NOMINATIM_URL,
            params={"q": normalized, "format": "jsonv2", "limit": 1},
            headers={"User-Agent": settings.NOMINATIM_USER_AGENT},
            timeout=settings.EXTERNAL_API_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        results = response.json()
    except (requests.RequestException, ValueError) as exc:
        raise ExternalServiceError(
            "The geocoding service is unavailable. Please try again."
        ) from exc

    if not results:
        raise LocationNotFoundError(f'Could not find a location matching "{normalized}".')

    try:
        top = results[0]
        location = Location(
            name=top["display_name"],
            coordinate=Coordinate(lat=float(top["lat"]), lon=float(top["lon"])),
        )
    except (KeyError, TypeError, ValueError) as exc:
        raise ExternalServiceError(
            "The geocoding service returned an unexpected response."
        ) from exc

    cache.set(cache_key, location, CACHE_TTL_SECONDS)
    return location