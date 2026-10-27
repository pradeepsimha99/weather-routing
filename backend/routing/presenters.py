"""Convert a TripPlan into the JSON-serialisable response of /api/analyze/."""

from datetime import datetime, timezone

from .services.checkpoints import choose_interval_miles
from .services.entities import Location, RiskLevel
from .services.heatmap import Heatmap
from .services.route_analysis import CheckpointAssessment, RouteAnalysis
from .services.trip_planner import TripPlan


def plan_to_dict(plan: TripPlan) -> dict:
    ranked = plan.recommendation.ranked
    ranks = {analysis.route_id: rank for rank, analysis in enumerate(ranked, start=1)}
    best_id = ranked[0].route_id
    return {
        "origin": _location(plan.origin),
        "destination": _location(plan.destination),
        "departure_time": _iso(plan.departure),
        "load_weight_lb": plan.load_lb,
        "recommendation": {
            "route_id": best_id,
            "reason": plan.recommendation.reason,
            "has_safe_route": plan.recommendation.has_safe_route,
        },
        "routes": [
            _route(analysis, ranks[analysis.route_id], analysis.route_id == best_id)
            for analysis in plan.routes
        ],
        "heatmap": _heatmap(plan.heatmap),
    }


def _iso(moment: datetime) -> str:
    return moment.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _level_key(level: RiskLevel) -> str:
    return level.name.lower()


def _location(location: Location) -> dict:
    return {
        "name": location.name,
        "lat": location.coordinate.lat,
        "lon": location.coordinate.lon,
    }


def _route(analysis: RouteAnalysis, rank: int, is_recommended: bool) -> dict:
    route = analysis.route
    return {
        "id": analysis.route_id,
        "rank": rank,
        "is_recommended": is_recommended,
        "distance_miles": round(route.distance_miles, 1),
        "duration_seconds": round(route.duration_seconds),
        "arrival_time": _iso(analysis.arrival),
        "checkpoint_interval_miles": choose_interval_miles(route.distance_miles),
        "summary": {
            "miles_by_level": {
                _level_key(level): round(analysis.miles_by_level[level], 1)
                for level in RiskLevel
            },
            "average_risk": round(analysis.average_risk, 2),
            "worst_level": _level_key(analysis.worst_level),
        },
        "geometry": [[round(lat, 5), round(lon, 5)] for lat, lon in route.geometry],
        "checkpoints": [_checkpoint(item) for item in analysis.assessments],
    }


def _checkpoint(item: CheckpointAssessment) -> dict:
    checkpoint, weather, risk = item.checkpoint, item.weather, item.risk
    return {
        "mile": checkpoint.mile,
        "lat": round(checkpoint.lat, 5),
        "lon": round(checkpoint.lon, 5),
        "eta": _iso(checkpoint.eta),
        "weather": {
            "wind_mph": round(weather.wind_mph, 1),
            "rain_in_hr": round(weather.rain_in_hr, 3),
            "snow_in_hr": round(weather.snow_in_hr, 3),
        },
        "risk": {
            "level": _level_key(risk.level),
            "label": risk.level.label,
            "score": int(risk.level),
            "factor": risk.factor,
            "load_adjusted": risk.load_adjusted,
        },
    }


def _heatmap(heatmap: Heatmap) -> dict:
    return {
        "hours": [_iso(moment) for moment in heatmap.hours],
        "routes": [
            {
                "route_id": route.route_id,
                "points": [[round(lat, 5), round(lon, 5)] for lat, lon in route.points],
                "frames": [[int(level) for level in frame] for frame in route.frames],
            }
            for route in heatmap.routes
        ],
    }