"""CORS: the deployed frontend (another domain) may call the API; other sites may not."""

from rest_framework.test import APIClient

FRONTEND = "https://weather-routing.vercel.app"


def preflight(origin: str):
    """The check a browser makes before sending a cross-site POST."""
    return APIClient().options(
        "/api/analyze/",
        HTTP_ORIGIN=origin,
        HTTP_ACCESS_CONTROL_REQUEST_METHOD="POST",
        HTTP_ACCESS_CONTROL_REQUEST_HEADERS="content-type",
    )


def test_configured_frontend_may_call_the_api(settings):
    settings.CORS_ALLOWED_ORIGINS = [FRONTEND]

    response = preflight(FRONTEND)

    assert response.status_code == 200
    assert response["Access-Control-Allow-Origin"] == FRONTEND
    assert "POST" in response["Access-Control-Allow-Methods"]
    assert "content-type" in response["Access-Control-Allow-Headers"].lower()


def test_other_websites_are_refused(settings):
    settings.CORS_ALLOWED_ORIGINS = [FRONTEND]

    response = preflight("https://evil.example.com")

    assert "Access-Control-Allow-Origin" not in response


def test_normal_requests_from_the_frontend_get_the_header(settings):
    settings.CORS_ALLOWED_ORIGINS = [FRONTEND]

    response = APIClient().get("/api/health/", HTTP_ORIGIN=FRONTEND)

    assert response["Access-Control-Allow-Origin"] == FRONTEND