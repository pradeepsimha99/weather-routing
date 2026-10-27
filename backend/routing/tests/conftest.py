import pytest
from django.core.cache import cache

from routing.services import geocoding


@pytest.fixture(autouse=True)
def isolate_tests(monkeypatch):
    """Give every test a clean cache and skip Nominatim's real-time throttle."""
    cache.clear()
    monkeypatch.setattr(geocoding, "_MIN_INTERVAL_SECONDS", 0)
    yield
    cache.clear()