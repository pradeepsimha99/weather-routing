import pytest
import requests
import responses
from django.conf import settings

from routing.services.exceptions import ExternalServiceError, LocationNotFoundError
from routing.services.geocoding import NOMINATIM_URL, geocode

DALLAS_RESULT = [
    {
        "display_name": "Dallas, Dallas County, Texas, United States",
        "lat": "32.7762719",
        "lon": "-96.7968559",
    }
]


@responses.activate
def test_geocode_returns_name_and_coordinates():
    responses.add(responses.GET, NOMINATIM_URL, json=DALLAS_RESULT)

    location = geocode("Dallas, TX")

    assert location.name.startswith("Dallas")
    assert location.coordinate.lat == pytest.approx(32.7763, abs=1e-3)
    assert location.coordinate.lon == pytest.approx(-96.7969, abs=1e-3)


@responses.activate
def test_geocode_sends_identifying_user_agent():
    responses.add(responses.GET, NOMINATIM_URL, json=DALLAS_RESULT)

    geocode("Dallas, TX")

    assert responses.calls[0].request.headers["User-Agent"] == settings.NOMINATIM_USER_AGENT


@responses.activate
def test_geocode_raises_when_place_is_unknown():
    responses.add(responses.GET, NOMINATIM_URL, json=[])

    with pytest.raises(LocationNotFoundError):
        geocode("asdfghjkl nowhere")


@responses.activate
def test_geocode_wraps_http_errors():
    responses.add(responses.GET, NOMINATIM_URL, status=500)

    with pytest.raises(ExternalServiceError):
        geocode("Dallas, TX")


@responses.activate
def test_geocode_wraps_connection_errors():
    responses.add(responses.GET, NOMINATIM_URL, body=requests.ConnectionError("boom"))

    with pytest.raises(ExternalServiceError):
        geocode("Dallas, TX")


@responses.activate
def test_geocode_caches_results_regardless_of_spacing_and_case():
    responses.add(responses.GET, NOMINATIM_URL, json=DALLAS_RESULT)

    first = geocode("Dallas, TX")
    second = geocode("  dallas,    tx ")

    assert first == second
    assert len(responses.calls) == 1