import pytest

from routing.services.geo import (
    bearing_degrees,
    cumulative_miles,
    decimate,
    destination_point,
    haversine_miles,
    point_at_distance,
    resample_polyline,
)

MERIDIAN_DEGREE_MILES = 69.09  # one degree of latitude


def test_haversine_one_degree_of_latitude():
    assert haversine_miles((0.0, 0.0), (1.0, 0.0)) == pytest.approx(MERIDIAN_DEGREE_MILES, abs=0.05)


def test_haversine_same_point_is_zero():
    assert haversine_miles((32.78, -96.8), (32.78, -96.8)) == 0


def test_haversine_dallas_to_oklahoma_city():
    distance = haversine_miles((32.7767, -96.7970), (35.4676, -97.5164))
    assert distance == pytest.approx(190.4, abs=1.0)


def test_point_at_distance_returns_midpoint():
    line = [(0.0, 0.0), (1.0, 0.0)]
    cumulative = cumulative_miles(line)

    lat, lon = point_at_distance(line, cumulative, cumulative[-1] / 2)

    assert lat == pytest.approx(0.5)
    assert lon == pytest.approx(0.0)


def test_resample_includes_start_interval_stops_and_end():
    line = [(0.0, 0.0), (1.0, 0.0)]  # about 69.09 miles

    miles = [m for _, _, m in resample_polyline(line, 25)]

    assert miles == pytest.approx([0, 25, 50, 69.09], abs=0.05)


def test_resample_merges_tiny_final_gap_into_previous_stop():
    line = [(0.0, 0.0), (0.88, 0.0)]  # about 60.8 miles, step 10 leaves a 0.8 mi tail

    miles = [m for _, _, m in resample_polyline(line, 10)]

    assert miles[-2:] == pytest.approx([50, 60.8], abs=0.05)
    assert not any(m == pytest.approx(60, abs=0.05) for m in miles)


def test_resample_rejects_invalid_input():
    with pytest.raises(ValueError):
        resample_polyline([(0.0, 0.0)], 10)
    with pytest.raises(ValueError):
        resample_polyline([(0.0, 0.0), (1.0, 0.0)], 0)


def test_decimate_keeps_endpoints_and_limits_size():
    points = [(float(i), 0.0) for i in range(10_000)]

    reduced = decimate(points, 1000)

    assert reduced[0] == points[0]
    assert reduced[-1] == points[-1]
    assert len(reduced) <= 1001


def test_decimate_leaves_short_lines_untouched():
    points = [(0.0, 0.0), (1.0, 1.0), (2.0, 2.0)]
    assert decimate(points, 1000) == points


def test_bearing_north_and_east():
    assert bearing_degrees((0.0, 0.0), (1.0, 0.0)) == pytest.approx(0.0, abs=0.01)
    assert bearing_degrees((0.0, 0.0), (0.0, 1.0)) == pytest.approx(90.0, abs=0.01)


def test_destination_point_travelling_east_on_the_equator():
    lat, lon = destination_point((0.0, 0.0), 90.0, MERIDIAN_DEGREE_MILES)

    assert lat == pytest.approx(0.0, abs=0.01)
    assert lon == pytest.approx(1.0, abs=0.01)