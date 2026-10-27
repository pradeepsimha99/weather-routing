"""Weather risk classification: threshold tables plus the load-weight rules.

Thresholds follow the assignment table.
- Wind bands start at their lower bound (25 mph is Moderate, 55 mph is No Travel),
  so a fractional speed such as 34.5 mph stays in the lower band.
- For rain and snow the table marks the open ends ("<0.10", ">1.00", ">3.0"), so a
  value on a shared edge belongs to the lower band (0.25 in/hr is Moderate,
  1.00 in/hr is Severe).
"""

from dataclasses import dataclass

from .entities import RiskLevel, WeatherReading

# Load rules, in pounds. Both comparisons are strictly "greater than".
NO_TRAVEL_LOAD_LB = 30_000  # 45-54 mph wind with a heavier load -> No Travel
SEVERE_LOAD_LB = 40_000  # 35-44 mph wind with a heavier load -> Severe

# (level, threshold, whether the threshold value itself belongs to that level),
# listed from most to least severe. Anything below the last band is Low.
Band = tuple[RiskLevel, float, bool]

WIND_BANDS: tuple[Band, ...] = (
    (RiskLevel.NO_TRAVEL, 55.0, True),
    (RiskLevel.SEVERE, 45.0, True),
    (RiskLevel.HIGH, 35.0, True),
    (RiskLevel.MODERATE, 25.0, True),
)
RAIN_BANDS: tuple[Band, ...] = (
    (RiskLevel.NO_TRAVEL, 1.00, False),
    (RiskLevel.SEVERE, 0.50, False),
    (RiskLevel.HIGH, 0.25, False),
    (RiskLevel.MODERATE, 0.10, True),
)
SNOW_BANDS: tuple[Band, ...] = (
    (RiskLevel.NO_TRAVEL, 3.0, False),
    (RiskLevel.SEVERE, 2.0, False),
    (RiskLevel.HIGH, 1.0, False),
    (RiskLevel.MODERATE, 0.5, True),
)


def _classify(value: float, bands: tuple[Band, ...]) -> RiskLevel:
    for level, threshold, inclusive in bands:
        if value > threshold or (inclusive and value == threshold):
            return level
    return RiskLevel.LOW


def classify_wind(mph: float) -> RiskLevel:
    return _classify(mph, WIND_BANDS)


def classify_rain(inches_per_hour: float) -> RiskLevel:
    return _classify(inches_per_hour, RAIN_BANDS)


def classify_snow(inches_per_hour: float) -> RiskLevel:
    return _classify(inches_per_hour, SNOW_BANDS)


def apply_load_rules(wind_level: RiskLevel, load_lb: float) -> RiskLevel:
    """Escalate the wind level for heavy loads.

    The Severe wind band is 45-54 mph and the High band is 35-44 mph. Wind of
    55 mph or more is already No Travel for any load in the threshold table.
    """
    if wind_level is RiskLevel.SEVERE and load_lb > NO_TRAVEL_LOAD_LB:
        return RiskLevel.NO_TRAVEL
    if wind_level is RiskLevel.HIGH and load_lb > SEVERE_LOAD_LB:
        return RiskLevel.SEVERE
    return wind_level


@dataclass(frozen=True)
class RiskAssessment:
    """Risk at one checkpoint, with the reasoning kept for the UI."""

    level: RiskLevel
    wind: RiskLevel  # wind level after the load rules
    rain: RiskLevel
    snow: RiskLevel
    load_adjusted: bool  # True when the load rules raised the wind level

    @property
    def factor(self) -> str | None:
        """The condition that sets the overall level (None when everything is Low)."""
        if self.level is RiskLevel.LOW:
            return None
        candidates = (("wind", self.wind), ("rain", self.rain), ("snow", self.snow))
        return max(candidates, key=lambda candidate: candidate[1])[0]


def assess(weather: WeatherReading, load_lb: float) -> RiskAssessment:
    """Classify the weather at one checkpoint for a truck carrying `load_lb`."""
    base_wind = classify_wind(weather.wind_mph)
    wind = apply_load_rules(base_wind, load_lb)
    rain = classify_rain(weather.rain_in_hr)
    snow = classify_snow(weather.snow_in_hr)
    return RiskAssessment(
        level=max(wind, rain, snow),
        wind=wind,
        rain=rain,
        snow=snow,
        load_adjusted=wind != base_wind,
    )