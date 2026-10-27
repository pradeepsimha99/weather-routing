import pytest

from routing.services.entities import RiskLevel, RouteCandidate
from routing.services.recommendation import recommend
from routing.services.route_analysis import RouteAnalysis


def make(route_id, *, severe=0.0, high=0.0, no_travel=0.0, avg=1.0, minutes=180):
    miles = {level: 0.0 for level in RiskLevel}
    miles[RiskLevel.SEVERE] = severe
    miles[RiskLevel.HIGH] = high
    miles[RiskLevel.NO_TRAVEL] = no_travel
    route = RouteCandidate(
        distance_miles=200, duration_seconds=minutes * 60, geometry=[(0.0, 0.0), (1.0, 1.0)]
    )
    return RouteAnalysis(
        route_id=route_id, route=route, assessments=[], miles_by_level=miles, average_risk=avg
    )


def best_id(*analyses):
    return recommend(analyses).ranked[0].route_id


def test_fewest_severe_miles_beats_every_later_criterion():
    slow_but_calm = make("calm", severe=0, high=100, avg=3.0, minutes=400)
    fast_but_severe = make("fast", severe=10, high=0, avg=1.0, minutes=100)

    assert best_id(fast_but_severe, slow_but_calm) == "calm"


def test_fewest_high_miles_decides_when_severe_miles_tie():
    assert best_id(make("a", high=30, avg=1.0, minutes=100), make("b", high=5, avg=3.0, minutes=300)) == "b"


def test_lowest_average_risk_decides_when_miles_tie():
    assert best_id(make("a", avg=1.5, minutes=100), make("b", avg=1.2, minutes=300)) == "b"


def test_shortest_time_decides_last():
    assert best_id(make("a", minutes=200), make("b", minutes=180)) == "b"


def test_no_travel_miles_are_compared_before_severe_miles():
    blocked = make("blocked", no_travel=5, severe=0, minutes=100)
    severe_only = make("severe", no_travel=0, severe=50, minutes=200)

    assert best_id(blocked, severe_only) == "severe"


def test_differences_below_a_tenth_of_a_mile_count_as_ties():
    a = make("a", high=10.01, minutes=200)
    b = make("b", high=10.04, minutes=100)

    assert best_id(a, b) == "b"  # tie on High miles, so the faster route wins


def test_full_ranking_is_returned_best_first():
    analyses = [
        make("worst", severe=20),
        make("best"),
        make("middle", severe=5),
    ]

    assert [a.route_id for a in recommend(analyses).ranked] == ["best", "middle", "worst"]


def test_identical_routes_keep_input_order():
    result = recommend([make("first"), make("second")])

    assert [a.route_id for a in result.ranked] == ["first", "second"]
    assert result.reason == "All routes are equivalent; the fastest was chosen."


def test_reason_compares_with_the_fastest_route_when_it_is_not_chosen():
    result = recommend([make("fast", severe=10, minutes=100), make("calm", severe=0, minutes=400)])

    assert result.reason == "Fewest Severe miles (0.0 mi vs 10.0 mi on the fastest route)."


def test_reason_compares_with_the_runner_up_when_the_fastest_route_wins():
    result = recommend([make("a", minutes=180), make("b", minutes=200)])

    assert (
        result.reason
        == "Shortest travel time (3 h 00 min vs 3 h 20 min on the next-best route)."
    )


def test_reason_for_average_risk():
    result = recommend([make("a", avg=1.5, minutes=100), make("b", avg=1.2, minutes=300)])

    assert result.reason == "Lowest average risk (1.20 vs 1.50 on the fastest route)."


def test_a_clear_route_is_reported_as_safe():
    result = recommend([make("a", no_travel=5, minutes=100), make("b", no_travel=0, minutes=200)])

    assert result.has_safe_route is True
    assert result.reason.startswith("Fewest No Travel miles")


def test_when_every_route_is_blocked_there_is_no_safe_route():
    result = recommend([make("a", no_travel=10), make("b", no_travel=20)])

    assert result.has_safe_route is False
    assert result.ranked[0].route_id == "a"
    assert result.reason.startswith("Every route crosses No Travel weather")


def test_single_route():
    result = recommend([make("only")])

    assert result.reason == "Only one route is available."
    assert result.has_safe_route is True


def test_empty_input_is_rejected():
    with pytest.raises(ValueError):
        recommend([])