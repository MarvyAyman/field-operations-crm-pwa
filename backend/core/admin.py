from django.contrib import admin
from .models import (
    Church, Member, Area, Street, Building, LookupValue,
    Family, Person, FamilyPhone, Visit, FamilyInternalNote
)


@admin.register(Church)
class ChurchAdmin(admin.ModelAdmin):
    list_display = ('id', 'name')


@admin.register(Member)
class MemberAdmin(admin.ModelAdmin):
    list_display = ('email', 'role', 'active', 'church_id')
    list_filter = ('role', 'active')
    search_fields = ('email',)


@admin.register(Area)
class AreaAdmin(admin.ModelAdmin):
    list_display = ('area_no', 'church_id')


@admin.register(Street)
class StreetAdmin(admin.ModelAdmin):
    list_display = ('name', 'area_id')


@admin.register(Building)
class BuildingAdmin(admin.ModelAdmin):
    list_display = ('house_no', 'direction', 'street_id')
    search_fields = ('house_no',)


@admin.register(LookupValue)
class LookupValueAdmin(admin.ModelAdmin):
    list_display = ('label', 'list_key', 'code', 'active')
    list_filter = ('list_key', 'active')


@admin.register(Family)
class FamilyAdmin(admin.ModelAdmin):
    list_display = ('family_name', 'apartment_no', 'primary_phone', 'last_visit_on')
    search_fields = ('family_name', 'primary_phone')


@admin.register(Person)
class PersonAdmin(admin.ModelAdmin):
    list_display = ('full_name', 'gender', 'job', 'family_id')
    search_fields = ('full_name',)


@admin.register(Visit)
class VisitAdmin(admin.ModelAdmin):
    list_display = ('family_id', 'visited_on', 'status_id')
    list_filter = ('visited_on',)


@admin.register(FamilyPhone)
class FamilyPhoneAdmin(admin.ModelAdmin):
    list_display = ('phone', 'family_id')


@admin.register(FamilyInternalNote)
class FamilyInternalNoteAdmin(admin.ModelAdmin):
    list_display = ('family_id', 'note')