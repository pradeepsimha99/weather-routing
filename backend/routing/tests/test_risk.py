import pytest

from routing.services.entities import RiskLevel
from routing.services.risk import assess, classify_rain, classify_snow, classify_wind
from routing.tests.helpers import reading

LOW, MODERATE, HIGH = RiskLevel.LOW, RiskLevel.MODERATE, RiskLevel.HIGH
SEVERE, NO_TRAVEL = RiskLevel.SEVERE, RiskLevel.NO_TRAVEL


@pytest.mark.parametrize(
    ("mph", "expected"),
    [
        (0, LOW), (24.9, LOW),
        (25, MODERATE), (34, MODERATE), (34.9, MODERATE),
        (35, HIGH), (44.9, HIGH),
        (45, SEVERE), (54, SEVERE), (54.9, SEVERE),
        (55, NO_TRAVEL), (90, NO_TRAVEL),
    ],
)
def test_wind_thresholds(mph, expected):
    assert classify_wind(mph) is expected


@pytest.mark.parametrize(
    ("rain", "expected"),
    [
        (0, LOW), (0.099, LOW),
        (0.10, MODERATE), (0.25, MODERATE),
        (0.251, HIGH), (0.50, HIGH),
        (0.501, SEVERE), (1.00, SEVERE),
        (1.01, NO_TRAVEL),
    ],
)
def test_rain_thresholds(rain, expected):
    assert classify_rain(rain) is expected


@pytest.mark.parametrize(
    ("snow", "expected"),
    [
        (0, LOW), (0.49, LOW),
        (0.5, MODERATE), (1.0, MODERATE),
        (1.01, HIGH), (2.0, HIGH),
        (2.01, SEVERE), (3.0, SEVERE),
        (3.01, NO_TRAVEL),
    ],
)
def test_snow_thresholds(snow, expected):
    assert classify_snow(snow) is expected


@pytest.mark.parametrize("load_lb", [1_000, 30_000, 80_000])
def test_wind_of_55_mph_is_no_travel_for_any_load(load_lb):
    assert assess(reading(wind=55), load_lb).level is NO_TRAVEL


@pytest.mark.parametrize(
    ("load_lb", "expected"), [(29_000, SEVERE), (30_000, SEVERE), (30_001, NO_TRAVEL), (60_000, NO_TRAVEL)]
)
def test_45_to_54_mph_is_no_travel_only_above_30000_lb(load_lb, expected):
    assert assess(reading(wind=50), load_lb).level is expected


def test_54_9_mph_still_counts_as_the_45_to_54_band():
    assert assess(reading(wind=54.9), 35_000).level is NO_TRAVEL


@pytest.mark.parametrize(
    ("load_lb", "expected"), [(20_000, HIGH), (40_000, HIGH), (40_001, SEVERE), (80_000, SEVERE)]
)
def test_35_to_44_mph_is_severe_only_above_40000_lb(load_lb, expected):
    assert assess(reading(wind=40), load_lb).level is expected


def test_load_rules_do_not_change_light_wind():
    assert assess(reading(wind=30), 80_000).level is MODERATE


def test_load_adjustment_is_reported():
    heavy = assess(reading(wind=40), 45_000)
    light = assess(reading(wind=40), 20_000)

    assert heavy.load_adjusted is True and heavy.wind is SEVERE
    assert light.load_adjusted is False and light.wind is HIGH


def test_overall_level_is_the_worst_condition_and_names_its_factor():
    result = assess(reading(wind=10, rain=0.3, snow=0.6), 20_000)  # rain High, snow Moderate

    assert result.level is HIGH
    assert result.factor == "rain"


def test_factor_is_none_when_everything_is_low():
    result = assess(reading(wind=5), 20_000)

    assert result.level is LOW
    assert result.factor is None