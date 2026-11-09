"""
Django settings for config project.
Configured for: Church Visitation PWA (Django + React + Supabase)
"""

import os
from pathlib import Path
import dj_database_url
from dotenv import load_dotenv

# ---------------------------------------------------------
# 1. BASE DIRECTORIES & ENVIRONMENT VARIABLES
# ---------------------------------------------------------
BASE_DIR = Path(__file__).resolve().parent.parent

# Load .env file (must be at the root of the backend folder)
load_dotenv(os.path.join(BASE_DIR, '.env'))

# ---------------------------------------------------------
# 2. SECURITY SETTINGS
# ---------------------------------------------------------
SECRET_KEY = os.getenv('SECRET_KEY', 'django-insecure-default-key-for-dev-only')

# Parse DEBUG from .env (returns True if 'True', False otherwise)
DEBUG = os.getenv('DEBUG', 'False').lower() in ('true', '1', 'yes')

# Parse ALLOWED_HOSTS from comma-separated string in .env
ALLOWED_HOSTS = [host.strip() for host in os.getenv('ALLOWED_HOSTS', 'localhost,127.0.0.1').split(',')]

# ---------------------------------------------------------
# 3. APPLICATIONS
# ---------------------------------------------------------
INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',

    # Third Party
    'rest_framework',
    'rest_framework.authtoken',  # needed for the login token (run: python manage.py migrate)
    'corsheaders',

    # Local Apps
    'core',  # Our visitation app
]

# ---------------------------------------------------------
# 4. MIDDLEWARE
# ---------------------------------------------------------
MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',  # MUST be at the top
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'config.urls'

# ---------------------------------------------------------
# 5. TEMPLATES (Admin only, React handles the frontend)
# ---------------------------------------------------------
TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'config.wsgi.application'

# ---------------------------------------------------------
# 6. DATABASE (Supabase / PostgreSQL)
# ---------------------------------------------------------
# dj_database_url automatically parses the DATABASE_URL from .env
DATABASES = {
    'default': dj_database_url.config(
        default=os.getenv('DATABASE_URL'),
        conn_max_age=600,  # Connection pooling for performance
        conn_health_checks=True,
    )
}

# ---------------------------------------------------------
# 7. PASSWORD VALIDATION
# ---------------------------------------------------------
AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

# ---------------------------------------------------------
# 8. INTERNATIONALIZATION (Arabic Support)
# ---------------------------------------------------------
LANGUAGE_CODE = 'ar'
TIME_ZONE = 'Africa/Cairo'
USE_I18N = True
USE_TZ = True

# ---------------------------------------------------------
# 9. STATIC & MEDIA FILES
# ---------------------------------------------------------
STATIC_URL = 'static/'
STATIC_ROOT = os.path.join(BASE_DIR, 'staticfiles')

MEDIA_URL = 'media/'
MEDIA_ROOT = os.path.join(BASE_DIR, 'media')

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# ---------------------------------------------------------
# 10. DJANGO REST FRAMEWORK (DRF)
# ---------------------------------------------------------
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        # "Authorization: Token <key>" header sent by the React app.
        # Tokens expire after TOKEN_TTL_DAYS (renewed on every /auth/me/ check).
        'core.authentication.ExpiringTokenAuthentication',
    ],
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.IsAuthenticated',
    ],
    'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.PageNumberPagination',
    'PAGE_SIZE': 50,
}

# ---------------------------------------------------------
# 10b. LOGIN (Supabase Auth with Google) + OFFLINE SESSION
# ---------------------------------------------------------
# Supabase project (Project Settings -> API). Same values as the frontend .env:
#   SUPABASE_URL      = VITE_SUPABASE_URL       e.g. https://abcdxyz.supabase.co
#   SUPABASE_ANON_KEY = VITE_SUPABASE_ANON_KEY  the public "anon" / "publishable" key
SUPABASE_URL = os.getenv('SUPABASE_URL', '')
SUPABASE_ANON_KEY = os.getenv('SUPABASE_ANON_KEY', '')

# How long a login stays valid. The app renews it whenever it is opened
# online, so this is effectively "how long a phone can stay unused".
TOKEN_TTL_DAYS = int(os.getenv('TOKEN_TTL_DAYS', '30'))

# ---------------------------------------------------------
# 11. CORS (Cross-Origin Resource Sharing)
# ---------------------------------------------------------
# Allow requests from React (Vite runs on port 5173)
CORS_ALLOWED_ORIGINS = [
    host.strip()
    for host in os.getenv('CORS_ALLOWED_ORIGINS', 'http://localhost:5173,http://127.0.0.1:5173').split(',')
]

# Allow credentials (cookies, auth headers)
CORS_ALLOW_CREDENTIALS = True

# ---------------------------------------------------------
# 12. CSRF TRUSTED ORIGINS (For Vite dev server)
# ---------------------------------------------------------
CSRF_TRUSTED_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        'CSRF_TRUSTED_ORIGINS', 'http://localhost:5173,http://127.0.0.1:5173'
    ).split(',')
]
