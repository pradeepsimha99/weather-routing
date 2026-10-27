"""
Django settings for the Weather-Aware Truck Routing project.

All environment-specific values are read from environment variables (or a local
.env file during development) so that no secrets are stored in source control.
"""

from pathlib import Path

from decouple import Csv, config

BASE_DIR = Path(__file__).resolve().parent.parent

# --- Core security / environment -------------------------------------------
SECRET_KEY = config("DJANGO_SECRET_KEY")
DEBUG = config("DJANGO_DEBUG", default=False, cast=bool)
ALLOWED_HOSTS = config("DJANGO_ALLOWED_HOSTS", default="localhost", cast=Csv())

# Render sets this to the public hostname of the service, so it is always allowed.
_render_hostname = config("RENDER_EXTERNAL_HOSTNAME", default="")
if _render_hostname:
    ALLOWED_HOSTS.append(_render_hostname)

# --- Applications ------------------------------------------------------------
# Only what we need: this app is a stateless API (no admin, no sessions).
INSTALLED_APPS = [
    "django.contrib.contenttypes",
    "django.contrib.auth",
    "django.contrib.staticfiles",
    "corsheaders",
    "rest_framework",
    "routing",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.middleware.gzip.GZipMiddleware",  # route data is large; JSON compresses well
    "corsheaders.middleware.CorsMiddleware",  # must be above CommonMiddleware
    "django.middleware.common.CommonMiddleware",
]

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"

# --- Database ------------------------------------------------------------------
# The app stores no data. SQLite is only here so Django's tooling works.
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": BASE_DIR / "db.sqlite3",
    }
}

# --- Cache -----------------------------------------------------------------------
# In-memory cache used to avoid repeating identical geocoding/weather calls.
CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
        "LOCATION": "weather-routing-cache",
    }
}

# --- Django REST Framework -------------------------------------------------------
REST_FRAMEWORK = {
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "DEFAULT_PARSER_CLASSES": ["rest_framework.parsers.JSONParser"],
    "DEFAULT_AUTHENTICATION_CLASSES": [],
    "DEFAULT_PERMISSION_CLASSES": [],
    "UNAUTHENTICATED_USER": None,
}

# --- CORS ----------------------------------------------------------------------------
# Exact origins of the frontend, e.g. https://my-app.vercel.app (no trailing slash).
CORS_ALLOWED_ORIGINS = config("CORS_ALLOWED_ORIGINS", default="", cast=Csv())

# --- External services -----------------------------------------------------------
NOMINATIM_USER_AGENT = config(
    "NOMINATIM_USER_AGENT", default="weather-routing-assessment"
)
EXTERNAL_API_TIMEOUT_SECONDS = 20

# --- Logging -----------------------------------------------------------------------
# Send warnings and errors to the console so the hosting platform's log viewer shows them.
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {"console": {"class": "logging.StreamHandler"}},
    "root": {"handlers": ["console"], "level": "WARNING"},
    "loggers": {
        "django.request": {"handlers": ["console"], "level": "ERROR", "propagate": False},
    },
}

# --- Internationalisation ----------------------------------------------------------
LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = False
USE_TZ = True

STATIC_URL = "static/"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"