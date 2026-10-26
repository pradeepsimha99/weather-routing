"""HTTP views for the routing app. Business logic lives in services/."""

from rest_framework.decorators import api_view
from rest_framework.request import Request
from rest_framework.response import Response


@api_view(["GET"])
def health(request: Request) -> Response:
    """Lightweight endpoint used to verify the API is up (and by hosting platforms)."""
    return Response({"status": "ok"})