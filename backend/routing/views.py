"""HTTP views. They validate input, call the service layer and shape the response."""

from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.request import Request
from rest_framework.response import Response

from .presenters import plan_to_dict
from .serializers import AnalyzeRequestSerializer
from .services.exceptions import RoutingError
from .services.trip_planner import plan_trip


@api_view(["GET"])
def health(request: Request) -> Response:
    """Lightweight endpoint used to verify the API is up (and by hosting platforms)."""
    return Response({"status": "ok"})


@api_view(["POST"])
def analyze(request: Request) -> Response:
    """Compare up to three routes for weather risk and recommend the best one."""
    serializer = AnalyzeRequestSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(
            {"error": "Invalid input.", "fields": serializer.errors},
            status=status.HTTP_400_BAD_REQUEST,
        )

    data = serializer.validated_data
    try:
        plan = plan_trip(
            origin_query=data["origin"],
            destination_query=data["destination"],
            departure=data["departure_time"],
            load_lb=data["load_weight_lb"],
        )
    except RoutingError as exc:
        return Response({"error": exc.message}, status=exc.status_code)

    return Response(plan_to_dict(plan))