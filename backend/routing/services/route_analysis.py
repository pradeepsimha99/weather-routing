"""Combine a route's checkpoints with weather to produce per-route risk metrics."""

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import datetime

from .entities import (
    Checkpoint,
    HourlyForecast,
    Point,
    RiskLevel,
    RouteCandidate,
    WeatherReading,
)
from .risk import RiskAssessment, assess
from .weather import reading_at, round_point


@dataclass(frozen=True)
class CheckpointAssessment:
    checkpoint: Checkpoint
    weather: WeatherReading
    risk: RiskAssessment
    segment_miles: float  # the stretch of road this checkpoint represents


@dataclass(frozen=True)
class RouteAnalysis:
    route_id: str
    route: RouteCandidate
    assessments: list[CheckpointAssessment]
    miles_by_level: dict[RiskLevel, float]
    average_risk: float  # mile-weighted, 1 (Low) to 5 (No Travel)

    @property
    def has_no_travel(self) -> bool:
        return self.miles_by_level[RiskLevel.NO_TRAVEL] > 0

    @property
    def arrival(self) -> datetime:
        return self.assessments[-1].checkpoint.eta

    @property
    def worst_level(self) -> RiskLevel:
        return max(item.risk.level for item in self.assessments)


def segment_lengths(marks: Sequence[float], total_miles: float) -> list[float]:
    """Miles of road each checkpoint represents.

    A checkpoint covers the road halfway to its neighbours, so the first one
    covers the start of the route and the last one covers the end. The lengths
    always add up to `total_miles`.
    """
    if len(marks) == 1:
        return [total_miles]
    midpoints = [(a + b) / 2 for a, b in zip(marks, marks[1:])]
    edges = [0.0, *midpoints, total_miles]
    return [edges[i + 1] - edges[i] for i in range(len(marks))]


def analyze_route(
    route_id: str,
    route: RouteCandidate,
    checkpoints: Sequence[Checkpoint],
    forecasts: Mapping[Point, HourlyForecast],
    load_lb: float,
) -> RouteAnalysis:
    """Weather and risk at every checkpoint, using the forecast for its ETA hour."""
    lengths = segment_lengths([c.mile for c in checkpoints], route.distance_miles)

    assessments: list[CheckpointAssessment] = []
    for checkpoint, length in zip(checkpoints, lengths):
        forecast = forecasts[round_point(checkpoint.lat, checkpoint.lon)]
        weather = reading_at(forecast, checkpoint.eta)
        assessments.append(
            CheckpointAssessment(
                checkpoint=checkpoint,
                weather=weather,
                risk=assess(weather, load_lb),
                segment_miles=length,
            )
        )

    miles_by_level = {level: 0.0 for level in RiskLevel}
    for item in assessments:
        miles_by_level[item.risk.level] += item.segment_miles

    total = sum(item.segment_miles for item in assessments)
    if total > 0:
        average_risk = sum(item.risk.level * item.segment_miles for item in assessments) / total
    else:
        average_risk = float(assessments[0].risk.level)

    return RouteAnalysis(
        route_id=route_id,
        route=route,
        assessments=assessments,
        miles_by_level=miles_by_level,
        average_risk=average_risk,
    )