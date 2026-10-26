"""Root URL configuration. All API endpoints live under /api/."""

from django.urls import include, path

urlpatterns = [
    path("api/", include("routing.urls")),
]