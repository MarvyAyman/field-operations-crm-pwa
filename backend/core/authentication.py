from datetime import timedelta

from django.conf import settings
from django.utils import timezone
from rest_framework.authentication import TokenAuthentication
from rest_framework.exceptions import AuthenticationFailed


class ExpiringTokenAuthentication(TokenAuthentication):
    """
    Same as DRF TokenAuthentication (header: "Authorization: Token <key>"),
    but a token expires TOKEN_TTL_DAYS after it was issued/renewed.

    The token is renewed every time the app verifies the session through
    /api/auth/me/, so a servant who opens the app at least once per TTL
    stays signed in, and a phone that is never used again gets locked out.
    """

    def authenticate_credentials(self, key):
        user, token = super().authenticate_credentials(key)
        ttl = timedelta(days=getattr(settings, 'TOKEN_TTL_DAYS', 30))
        if token.created + ttl < timezone.now():
            token.delete()
            raise AuthenticationFailed('انتهت صلاحية الجلسة. سجّل الدخول مرة أخرى.')
        return user, token
