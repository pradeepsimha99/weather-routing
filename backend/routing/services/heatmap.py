"""Heatmap data: the risk level along each route for every hour of the next 48."""

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import datetime, timedelta

from .entities import HourlyForecast, Point, RiskLevel
from .risk import assess
from .route_analysis import RouteAnalysis
from .weather import reading_at, round_point

HEATMAP_HOURS = 48  # the slider runs from hour 0 (departure) to hour 48


@dataclass(frozen=True)
class RouteHeatmap:
    route_id: str
    points: list[Point]
    frames: list[list[RiskLevel]]  # frames[hour][point_index]


@dataclass(frozen=True)
class Heatmap:
    hours: list[datetime]  # the moment each frame represents
    routes: list[RouteHeatmap]


def build_heatmap(
    analyses: Sequence[RouteAnalysis],
    forecasts: Mapping[Point, HourlyForecast],
    departure: datetime,
    load_lb: float,
) -> Heatmap:
    hours = [departure + timedelta(hours=offset) for offset in range(HEATMAP_HOURS + 1)]

    routes: list[RouteHeatmap] = []
    for analysis in analyses:
        checkpoints = [item.checkpoint for item in analysis.assessments]
        series = [forecasts[round_point(c.lat, c.lon)] for c in checkpoints]
        frames = [
            [assess(reading_at(forecast, moment), load_lb).level for forecast in series]
            for moment in hours
        ]
        routes.append(
            RouteHeatmap(
                route_id=analysis.route_id,
                points=[(c.lat, c.lon) for c in checkpoints],
                frames=frames,
            )
        )
    return Heatmap(hours=hours, routes=routes)