import uuid

import requests
from django.conf import settings
from django.contrib.auth.models import User
from django.db import connection
from django.db.models import Max
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework import viewsets
from rest_framework.exceptions import ValidationError
from rest_framework.authtoken.models import Token
from rest_framework.decorators import (
    api_view, authentication_classes, permission_classes, action
)
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from .models import (
    Area, Street, Building, Family, Person,
    FamilyPhone, FamilyInternalNote, Visit, LookupValue, Member
)
from .serializers import (
    AreaSerializer, StreetSerializer, BuildingSerializer,
    FamilySerializer, PersonSerializer, FamilyPhoneSerializer, FamilyInternalNoteSerializer,
    VisitSerializer, LookupValueSerializer
)
from .permissions import IsAdminRole, IsServantOrAdmin, get_active_member


def _user_payload(user, member):
    """The profile the frontend caches on the device for offline use."""
    return {
        'email': user.email,
        'name': user.first_name or user.username,
        'role': member.role,
        'church_id': str(member.church_id) if member.church_id else None,
    }


# ==========================================================
# LOGIN  (Supabase Auth = who you are, members table = what you may do)
# ==========================================================
def _issue_session(email, full_name):
    """
    Authorization step shared by every login method:
    the email must exist in the members table and be active.
    Returns the Django auth token + the profile cached on the device.
    """
    member = Member.objects.filter(email__iexact=email, active=True).first()
    if member is None:
        return Response(
            {'error': 'هذا البريد غير مسجل في الخدمة. تواصل مع المسؤول.'},
            status=403
        )

    # Only now create/update the Django user
    user, created = User.objects.get_or_create(
        username=email,
        defaults={'email': email, 'first_name': full_name}
    )
    if created:
        user.set_unusable_password()
        user.save()
    elif full_name and user.first_name != full_name:
        user.first_name = full_name
        user.save(update_fields=['first_name'])

    # Create the token (or reuse it) and restart its expiry clock
    token, _ = Token.objects.get_or_create(user=user)
    Token.objects.filter(pk=token.pk).update(created=timezone.now())

    return Response({'token': token.key, 'user': _user_payload(user, member)})


@api_view(['POST'])
@authentication_classes([])   # ignore any stale/expired token sent with the login request
@permission_classes([AllowAny])
def supabase_login(request):
    """
    The app signs in with Google through Supabase Auth and sends us the Supabase
    access token. We do NOT trust it by itself: we ask Supabase to confirm it
    (GET /auth/v1/user), read the Google email from the confirmed user, then
    check that email against the members table.
    """
    access_token = request.data.get('access_token')
    if not access_token:
        return Response({'error': 'No access token provided'}, status=400)

    if not settings.SUPABASE_URL or not settings.SUPABASE_ANON_KEY:
        return Response({'error': 'SUPABASE_URL / SUPABASE_ANON_KEY are not configured on the server'}, status=500)

    try:
        resp = requests.get(
            f"{settings.SUPABASE_URL.rstrip('/')}/auth/v1/user",
            headers={'Authorization': f'Bearer {access_token}', 'apikey': settings.SUPABASE_ANON_KEY},
            timeout=10,
        )
    except requests.RequestException:
        return Response({'error': 'تعذّر الاتصال بخدمة تسجيل الدخول. حاول مرة أخرى.'}, status=502)

    if resp.status_code in (401, 403):
        return Response({'error': 'Invalid or expired login. Please try again.'}, status=401)
    if resp.status_code != 200:
        return Response({'error': 'تعذّر التحقق من تسجيل الدخول. حاول مرة أخرى.'}, status=502)

    try:
        sb_user = resp.json()
    except ValueError:
        return Response({'error': 'تعذّر التحقق من تسجيل الدخول. حاول مرة أخرى.'}, status=502)

    # Only a real Google identity counts. Its email is the one Google confirmed, so
    # nobody can sign up in Supabase with someone else's address and get in.
    google = next((i for i in (sb_user.get('identities') or []) if i.get('provider') == 'google'), None)
    if google is None:
        return Response({'error': 'سجّل الدخول بحساب Google.'}, status=403)

    data = google.get('identity_data') or {}
    email = (data.get('email') or '').strip().lower()
    verified = data.get('email_verified')
    if verified is None:  # older responses: fall back to Supabase's own confirmation
        verified = bool(sb_user.get('email_confirmed_at')) and (sb_user.get('email') or '').lower() == email
    if not email or not verified:
        return Response({'error': 'Email not provided or not verified by Google'}, status=400)

    return _issue_session(email, data.get('full_name') or data.get('name') or '')


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def current_user(request):
    """
    Session check used by the app whenever it comes back online.
      200 -> still valid (token is renewed)
      401 -> token invalid/expired  -> app signs out
      403 -> not an active member   -> app signs out
    """
    member = get_active_member(request.user)
    if member is None:
        return Response({'error': 'Not a member'}, status=403)

    # sliding expiry: every successful check renews the token
    if request.auth is not None:
        Token.objects.filter(pk=request.auth.pk).update(created=timezone.now())

    return Response(_user_payload(request.user, member))


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def logout_view(request):
    """Delete the auth token."""
    Token.objects.filter(user=request.user).delete()
    return Response({'message': 'تم تسجيل الخروج'})


# ==========================================================
# API VIEWSETS
# ==========================================================
class AreaViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Area.objects.filter(deleted_at__isnull=True)
    serializer_class = AreaSerializer
    permission_classes = [IsServantOrAdmin]


class StreetViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Street.objects.filter(deleted_at__isnull=True)
    serializer_class = StreetSerializer
    permission_classes = [IsServantOrAdmin]

    @action(detail=False, methods=['get'], url_path='by-area/(?P<area_id>[^/.]+)')
    def by_area(self, request, area_id=None):
        streets = self.queryset.filter(area_id=area_id)
        return Response(self.get_serializer(streets, many=True).data)


class LookupValueViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = LookupValue.objects.filter(active=True)
    serializer_class = LookupValueSerializer
    permission_classes = [IsAuthenticated]


class OfflineWritableMixin:
    """
    Behaviour every writable table needs for the offline app:

      * a member only sees/edits rows of their own church
      * create is IDEMPOTENT: the device creates the UUID, and if the same id is
        sent again (response lost, retry) the existing row is returned, not duplicated
      * church_id / created_at / updated_at / updated_by are set by the SERVER
      * parent ids (building_id, family_id ...) must belong to the same church
      * delete is a soft delete that bumps updated_at, so other devices get it
    """
    parent_fields = {}   # {'building_id': Building}

    def get_queryset(self):
        member = get_active_member(self.request.user)
        return super().get_queryset().filter(church_id=member.church_id)

    def _check_parents(self, serializer, member):
        errors = {}
        for field, model in self.parent_fields.items():
            value = serializer.validated_data.get(field)
            if value and not model.objects.filter(
                pk=value, church_id=member.church_id, deleted_at__isnull=True
            ).exists():
                errors[field] = ['Not found']
        if errors:
            raise ValidationError(errors)

    def create(self, request, *args, **kwargs):
        client_id = request.data.get('id')
        if client_id:
            try:
                client_id = uuid.UUID(str(client_id))
            except ValueError:
                return Response({'id': ['Invalid UUID']}, status=400)

            existing = self.queryset.model.objects.filter(pk=client_id).first()
            if existing is not None:
                member = get_active_member(request.user)
                if existing.church_id != member.church_id:
                    return Response({'error': 'Forbidden'}, status=403)
                return Response(self.get_serializer(existing).data, status=200)

        return super().create(request, *args, **kwargs)

    def perform_create(self, serializer):
        member = get_active_member(self.request.user)
        self._check_parents(serializer, member)
        now = timezone.now()
        serializer.save(
            id=serializer.validated_data.get('id') or uuid.uuid4(),
            church_id=member.church_id,   # never trust church_id from the client
            created_at=now,
            updated_at=now,
            updated_by=member.id,
        )

    def perform_update(self, serializer):
        member = get_active_member(self.request.user)
        self._check_parents(serializer, member)
        serializer.save(
            id=serializer.instance.id,                  # the id can never change
            church_id=member.church_id,
            created_at=serializer.instance.created_at,
            updated_at=timezone.now(),
            updated_by=member.id,
        )

    def destroy(self, request, *args, **kwargs):
        """Soft delete (also bumps updated_at so devices pick the change up)."""
        instance = self.get_object()
        now = timezone.now()
        instance.deleted_at = now
        instance.updated_at = now
        instance.save()
        return Response(status=204)


class BuildingViewSet(OfflineWritableMixin, viewsets.ModelViewSet):
    queryset = Building.objects.filter(deleted_at__isnull=True)
    serializer_class = BuildingSerializer
    permission_classes = [IsServantOrAdmin]
    parent_fields = {'street_id': Street}

    @action(detail=False, methods=['get'], url_path='by-street/(?P<street_id>[^/.]+)')
    def by_street(self, request, street_id=None):
        buildings = self.get_queryset().filter(street_id=street_id)
        return Response(self.get_serializer(buildings, many=True).data)


class FamilyViewSet(OfflineWritableMixin, viewsets.ModelViewSet):
    queryset = Family.objects.filter(deleted_at__isnull=True)
    serializer_class = FamilySerializer
    permission_classes = [IsServantOrAdmin]
    parent_fields = {'building_id': Building}

    @action(detail=False, methods=['get'], url_path='by-building/(?P<building_id>[^/.]+)')
    def by_building(self, request, building_id=None):
        families = self.get_queryset().filter(building_id=building_id)
        return Response(self.get_serializer(families, many=True).data)


class PersonViewSet(OfflineWritableMixin, viewsets.ModelViewSet):
    queryset = Person.objects.filter(deleted_at__isnull=True)
    serializer_class = PersonSerializer
    permission_classes = [IsServantOrAdmin]
    parent_fields = {'family_id': Family}

    @action(detail=False, methods=['get'], url_path='by-family/(?P<family_id>[^/.]+)')
    def by_family(self, request, family_id=None):
        people = self.get_queryset().filter(family_id=family_id)
        return Response(self.get_serializer(people, many=True).data)


class FamilyPhoneViewSet(OfflineWritableMixin, viewsets.ModelViewSet):
    """"Other mobile" numbers of a family."""
    queryset = FamilyPhone.objects.filter(deleted_at__isnull=True)
    serializer_class = FamilyPhoneSerializer
    permission_classes = [IsServantOrAdmin]
    parent_fields = {'family_id': Family}


class FamilyInternalNoteViewSet(OfflineWritableMixin, viewsets.ModelViewSet):
    """
    Internal note about the family (e.g. what the old paper file said).
    The table has no deleted_at column, so a note is never deleted:
    to clear it the app saves an empty note.
    """
    queryset = FamilyInternalNote.objects.all()
    serializer_class = FamilyInternalNoteSerializer
    permission_classes = [IsServantOrAdmin]
    parent_fields = {'family_id': Family}
    http_method_names = ['get', 'post', 'patch', 'head', 'options']


class VisitViewSet(OfflineWritableMixin, viewsets.ModelViewSet):
    queryset = Visit.objects.filter(deleted_at__isnull=True)
    serializer_class = VisitSerializer
    permission_classes = [IsServantOrAdmin]
    parent_fields = {'family_id': Family}

    @action(detail=False, methods=['get'], url_path='by-family/(?P<family_id>[^/.]+)')
    def by_family(self, request, family_id=None):
        visits = self.get_queryset().filter(family_id=family_id).order_by('-visited_on')
        return Response(self.get_serializer(visits, many=True).data)

    @staticmethod
    def _refresh_last_visit(family_id):
        """families.last_visit_on = date of the newest live visit (keeps dashboards right)."""
        if not family_id:
            return
        last = (Visit.objects.filter(family_id=family_id, deleted_at__isnull=True)
                .aggregate(m=Max('visited_on'))['m'])
        Family.objects.filter(pk=family_id).update(last_visit_on=last, updated_at=timezone.now())

    def perform_create(self, serializer):
        super().perform_create(serializer)
        self._refresh_last_visit(serializer.instance.family_id)

    def perform_update(self, serializer):
        old_family = serializer.instance.family_id
        super().perform_update(serializer)
        self._refresh_last_visit(old_family)
        self._refresh_last_visit(serializer.instance.family_id)

    def destroy(self, request, *args, **kwargs):
        family_id = self.get_object().family_id
        response = super().destroy(request, *args, **kwargs)
        self._refresh_last_visit(family_id)
        return response


# ==========================================================
# OFFLINE SYNC ENDPOINT
# ==========================================================
# (response key, model, serializer, supports soft delete)
SYNC_TABLES = [
    ('lookup_values', LookupValue, LookupValueSerializer, False),
    ('areas', Area, AreaSerializer, True),
    ('streets', Street, StreetSerializer, True),
    ('buildings', Building, BuildingSerializer, True),
    ('families', Family, FamilySerializer, True),
    ('people', Person, PersonSerializer, True),
    ('family_phones', FamilyPhone, FamilyPhoneSerializer, True),
    ('family_internal_notes', FamilyInternalNote, FamilyInternalNoteSerializer, False),
    ('visits', Visit, VisitSerializer, True),
]


@api_view(['GET'])
@permission_classes([IsServantOrAdmin])
def sync_data(request):
    """
    Pull sync for the offline database on the device.

      GET /api/sync/                      -> full download (first login)
      GET /api/sync/?since=<server_time>  -> only what changed since then

    Response:
      server_time : store it and send it back as ?since= next time
      full        : true when no ?since= was given (device may replace everything)
      tables      : rows created/updated, per table
      deleted     : ids soft-deleted since ?since=, per table
    Only rows of the user's own church are returned.
    """
    member = get_active_member(request.user)

    since = None
    raw_since = request.query_params.get('since')
    if raw_since:
        # a "+" in a query string can arrive as a space
        since = parse_datetime(raw_since.replace(' ', '+'))
        if since is None:
            return Response({'error': 'Invalid "since" value'}, status=400)
        if timezone.is_naive(since):
            since = timezone.make_aware(since)

    # taken BEFORE querying so nothing written during the request is missed next time
    server_time = timezone.now()

    tables, deleted = {}, {}
    for key, model, serializer_class, soft_delete in SYNC_TABLES:
        qs = model.objects.filter(church_id=member.church_id)
        if soft_delete:
            live = qs.filter(deleted_at__isnull=True)
        else:
            live = qs
        if since is not None:
            live = live.filter(updated_at__gte=since)
        tables[key] = serializer_class(live, many=True).data

        if soft_delete and since is not None:
            deleted[key] = [
                str(pk) for pk in qs.filter(deleted_at__isnull=False, deleted_at__gte=since)
                .values_list('id', flat=True)
            ]
        else:
            deleted[key] = []

    return Response({
        'server_time': server_time.isoformat(),
        'full': since is None,
        'tables': tables,
        'deleted': deleted,
    })


# ==========================================================
# ADMIN DASHBOARD (security_invoker)
# ==========================================================
@api_view(['GET'])
@permission_classes([IsAdminRole])
def admin_dashboard(request):
    with connection.cursor() as cursor:
        cursor.execute("SELECT * FROM public.admin_dashboard_stats;")
        row = cursor.fetchone()

    if not row:
        return Response({'error': 'No stats'}, status=404)

    return Response({
        'total_families': row[0],
        'visited_last_30_days': row[1],
        'never_visited': row[2],
    })