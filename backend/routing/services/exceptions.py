"""Domain-specific errors. Each carries the HTTP status the API should return."""


class RoutingError(Exception):
    """Base class for all expected, user-facing errors."""

    status_code = 500

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


class LocationNotFoundError(RoutingError):
    """A place name could not be turned into coordinates."""

    status_code = 404


class NoRouteFoundError(RoutingError):
    """No drivable route exists between the two locations."""

    status_code = 422


class ExternalServiceError(RoutingError):
    """A third-party API (geocoding, routing, weather) failed."""

    status_code = 502