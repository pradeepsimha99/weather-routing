"""Rank route options and explain the choice.

Preference order from the assignment: fewest Severe miles, fewest High miles,
lowest average risk, shortest travel time. One addition: No Travel miles are
compared first, so a route that crosses No Travel weather never beats one that
does not.
"""

from collections.abc import Callable, Sequence
from dataclasses import dataclass

from .entities import RiskLevel
from .route_analysis import RouteAnalysis


def _format_miles(value: float) -> str:
    return f"{value:.1f} mi"


def _format_risk(value: float) -> str:
    return f"{value:.2f}"


def _format_duration(minutes: float) -> str:
    return f"{int(minutes // 60)} h {int(minutes % 60):02d} min"


@dataclass(frozen=True)
class _Criterion:
    headline: str
    value: Callable[[RouteAnalysis], float]
    digits: int  # values are rounded to this many decimals before comparing
    show: Callable[[float], str]


_CRITERIA: tuple[_Criterion, ...] = (
    _Criterion(
        "Fewest No Travel miles",
        lambda a: a.miles_by_level[RiskLevel.NO_TRAVEL],
        1,
        _format_miles,
    ),
    _Criterion(
        "Fewest Severe miles",
        lambda a: a.miles_by_level[RiskLevel.SEVERE],
        1,
        _format_miles,
    ),
    _Criterion(
        "Fewest High miles",
        lambda a: a.miles_by_level[RiskLevel.HIGH],
        1,
        _format_miles,
    ),
    _Criterion("Lowest average risk", lambda a: a.average_risk, 2, _format_risk),
    _Criterion(
        "Shortest travel time",
        lambda a: a.route.duration_seconds / 60,
        0,
        _format_duration,
    ),
)


@dataclass(frozen=True)
class Recommendation:
    ranked: list[RouteAnalysis]  # best first
    reason: str
    has_safe_route: bool  # False when even the best route crosses No Travel weather


def _rounded(criterion: _Criterion, analysis: RouteAnalysis) -> float:
    return round(criterion.value(analysis), criterion.digits)


def _rank_key(analysis: RouteAnalysis) -> tuple[float, ...]:
    return tuple(_rounded(criterion, analysis) for criterion in _CRITERIA)


def recommend(analyses: Sequence[RouteAnalysis]) -> Recommendation:
    """Order routes best-first. Ties keep the input order (fastest route first)."""
    if not analyses:
        raise ValueError("At least one route is required.")
    ranked = sorted(analyses, key=_rank_key)
    return Recommendation(
        ranked=ranked,
        reason=_explain(ranked),
        has_safe_route=not ranked[0].has_no_travel,
    )


def _explain(ranked: Sequence[RouteAnalysis]) -> str:
    best = ranked[0]
    if len(ranked) == 1:
        return "Only one route is available."
    if best.has_no_travel:
        return (
            "Every route crosses No Travel weather. This one has the least exposure; "
            "consider changing your departure time."
        )

    # Explain the win against the fastest route (what a driver would pick by default).
    fastest = min(ranked, key=lambda a: a.route.duration_seconds)
    if best is fastest:
        other, other_name = ranked[1], "the next-best route"
    else:
        other, other_name = fastest, "the fastest route"

    for criterion in _CRITERIA:
        best_value = _rounded(criterion, best)
        other_value = _rounded(criterion, other)
        if best_value != other_value:
            return (
                f"{criterion.headline} ({criterion.show(best_value)} "
                f"vs {criterion.show(other_value)} on {other_name})."
            )
    return "All routes are equivalent; the fastest was chosen."