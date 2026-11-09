from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register(r'areas', views.AreaViewSet, basename='areas')
router.register(r'streets', views.StreetViewSet, basename='streets')
router.register(r'buildings', views.BuildingViewSet, basename='buildings')
router.register(r'families', views.FamilyViewSet, basename='families')
router.register(r'people', views.PersonViewSet, basename='people')
router.register(r'family-phones', views.FamilyPhoneViewSet, basename='family-phones')
router.register(r'family-internal-notes', views.FamilyInternalNoteViewSet, basename='family-internal-notes')
router.register(r'visits', views.VisitViewSet, basename='visits')
router.register(r'lookups', views.LookupValueViewSet, basename='lookups')

urlpatterns = [
    # Auth
    path('auth/supabase/', views.supabase_login, name='supabase_login'),
    path('auth/me/', views.current_user, name='current_user'),
    path('auth/logout/', views.logout_view, name='logout'),

    # Data
    path('sync/', views.sync_data, name='sync_data'),
    path('dashboard/', views.admin_dashboard, name='admin_dashboard'),

    # Router
    path('', include(router.urls)),
]