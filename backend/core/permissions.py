from rest_framework.permissions import BasePermission
from .models import Member


def get_active_member(user):
    """Return the active Member row matching this Django user's email, or None."""
    if not user or not user.is_authenticated or not user.email:
        return None
    return Member.objects.filter(email__iexact=user.email, active=True).first()


class IsAdminRole(BasePermission):
    """Only members with role='admin' can access."""
    def has_permission(self, request, view):
        member = get_active_member(request.user)
        return bool(member and member.role == 'admin')


class IsServantOrAdmin(BasePermission):
    """Servants and admins can access."""
    def has_permission(self, request, view):
        member = get_active_member(request.user)
        return bool(member and member.role in ('admin', 'servant'))
