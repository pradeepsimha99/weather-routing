"""Plain data containers shared by the service modules."""

from dataclasses import dataclass
from datetime import datetime
from enum import IntEnum

Point = tuple[float, float]  # (latitude, longitude)


class RiskLevel(IntEnum):
    """Risk classes, ordered so that a higher number is always worse.

    The number doubles as the risk score used for averaging and for the heatmap
    intensity (1 = Low ... 5 = No Travel).
    """

    LOW = 1
    MODERATE = 2
    HIGH = 3
    SEVERE = 4
    NO_TRAVEL = 5

    @property
    def label(self) -> str:
        return self.name.replace("_", " ").title()


@dataclass(frozen=True)
class Coordinate:
    lat: float
    lon: float


@dataclass(frozen=True)
class Location:
    """A geocoded place: human-readable name plus coordinates."""

    name: str
    coordinate: Coordinate


@dataclass(frozen=True)
class RouteCandidate:
    """One driving route returned by the routing provider."""

    distance_miles: float
    duration_seconds: float
    geometry: list[Point]


@dataclass(frozen=True)
class Checkpoint:
    """A weather-sampling stop along a route."""

    mile: float
    lat: float
    lon: float
    eta: datetime


@dataclass(frozen=True)
class WeatherReading:
    """Weather at one place and hour, in the units used by the risk rules."""

    wind_mph: float
    rain_in_hr: float
    snow_in_hr: float


@dataclass(frozen=True)
class HourlyForecast:
    """Hourly weather for one location, keyed by the (UTC) hour it applies to."""

    readings: dict[datetime, WeatherReading]