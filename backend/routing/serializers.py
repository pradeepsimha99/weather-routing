"""Request validation for the API."""

from datetime import timedelta

from django.utils import timezone
from rest_framework import serializers

MAX_LOAD_LB = 80_000  # US federal gross vehicle weight limit
MAX_DEPARTURE_DAYS_AHEAD = 7  # the free forecast only reaches so far
PAST_GRACE = timedelta(hours=1)  # allows for the time it takes to submit the form


class AnalyzeRequestSerializer(serializers.Serializer):
    origin = serializers.CharField(max_length=200)
    destination = serializers.CharField(max_length=200)
    departure_time = serializers.DateTimeField()
    load_weight_lb = serializers.IntegerField(min_value=1, max_value=MAX_LOAD_LB)

    def validate_departure_time(self, value):
        now = timezone.now()
        if value < now - PAST_GRACE:
            raise serializers.ValidationError("Departure time cannot be in the past.")
        if value > now + timedelta(days=MAX_DEPARTURE_DAYS_AHEAD):
            raise serializers.ValidationError(
                f"Weather forecasts only reach {MAX_DEPARTURE_DAYS_AHEAD} days ahead."
            )
        return value