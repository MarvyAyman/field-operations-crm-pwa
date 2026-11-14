from django.db import models


class Church(models.Model):
    id = models.UUIDField(primary_key=True)
    name = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(blank=True, null=True)
    updated_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'churches'


class Member(models.Model):
    id = models.UUIDField(primary_key=True)
    church_id = models.UUIDField(blank=True, null=True)
    email = models.TextField(blank=True, null=True)
    full_name = models.TextField(blank=True, null=True)  # shown as "visited by"
    role = models.TextField(blank=True, null=True)  # admin, servant, viewer
    active = models.BooleanField(blank=True, null=True)
    created_at = models.DateTimeField(blank=True, null=True)
    updated_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'members'


class Area(models.Model):
    id = models.UUIDField(primary_key=True)
    church_id = models.UUIDField(blank=True, null=True)
    area_no = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(blank=True, null=True)
    updated_at = models.DateTimeField(blank=True, null=True)
    updated_by = models.UUIDField(blank=True, null=True)
    deleted_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'areas'


class Street(models.Model):
    id = models.UUIDField(primary_key=True)
    church_id = models.UUIDField(blank=True, null=True)
    area_id = models.UUIDField(blank=True, null=True)
    name = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(blank=True, null=True)
    updated_at = models.DateTimeField(blank=True, null=True)
    updated_by = models.UUIDField(blank=True, null=True)
    deleted_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'streets'


class Building(models.Model):
    id = models.UUIDField(primary_key=True)
    church_id = models.UUIDField(blank=True, null=True)
    street_id = models.UUIDField(blank=True, null=True)
    house_no = models.TextField(blank=True, null=True)
    direction = models.TextField(blank=True, null=True)
    notes = models.TextField(blank=True, null=True)
    lat = models.FloatField(blank=True, null=True)
    lng = models.FloatField(blank=True, null=True)
    location_accuracy = models.FloatField(blank=True, null=True)
    maps_url = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(blank=True, null=True)
    updated_at = models.DateTimeField(blank=True, null=True)
    updated_by = models.UUIDField(blank=True, null=True)
    deleted_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'buildings'


class LookupValue(models.Model):
    id = models.UUIDField(primary_key=True)
    church_id = models.UUIDField(blank=True, null=True)
    list_key = models.TextField(blank=True, null=True)
    code = models.TextField(blank=True, null=True)
    label = models.TextField(blank=True, null=True)
    label_f = models.TextField(blank=True, null=True)
    active = models.BooleanField(blank=True, null=True)
    sort_order = models.IntegerField(blank=True, null=True)
    created_at = models.DateTimeField(blank=True, null=True)
    updated_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'lookup_values'


class Family(models.Model):
    id = models.UUIDField(primary_key=True)
    church_id = models.UUIDField(blank=True, null=True)
    building_id = models.UUIDField(blank=True, null=True)
    family_name = models.TextField(blank=True, null=True)
    floor_no = models.TextField(blank=True, null=True)
    apartment_no = models.TextField(blank=True, null=True)
    primary_phone = models.TextField(blank=True, null=True)
    landline = models.TextField(blank=True, null=True)
    membership_no = models.TextField(blank=True, null=True)
    contract_type_id = models.UUIDField(blank=True, null=True)
    notes = models.TextField(blank=True, null=True)
    last_visit_on = models.DateField(blank=True, null=True)
    extra = models.JSONField(blank=True, null=True)
    import_key = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(blank=True, null=True)
    updated_at = models.DateTimeField(blank=True, null=True)
    updated_by = models.UUIDField(blank=True, null=True)
    deleted_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'families'


class Person(models.Model):
    id = models.UUIDField(primary_key=True)
    church_id = models.UUIDField(blank=True, null=True)
    family_id = models.UUIDField(blank=True, null=True)
    person_no = models.TextField(blank=True, null=True)
    full_name = models.TextField(blank=True, null=True)
    gender = models.TextField(blank=True, null=True)  # male / female
    relation_id = models.UUIDField(blank=True, null=True)
    status_id = models.UUIDField(blank=True, null=True)
    marital_status_id = models.UUIDField(blank=True, null=True)
    job = models.TextField(blank=True, null=True)
    confessor_id = models.UUIDField(blank=True, null=True)
    birth_date = models.DateField(blank=True, null=True)
    extra = models.JSONField(blank=True, null=True)
    import_key = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(blank=True, null=True)
    updated_at = models.DateTimeField(blank=True, null=True)
    updated_by = models.UUIDField(blank=True, null=True)
    deleted_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'people'


class FamilyPhone(models.Model):
    id = models.UUIDField(primary_key=True)
    church_id = models.UUIDField(blank=True, null=True)
    family_id = models.UUIDField(blank=True, null=True)
    person_id = models.UUIDField(blank=True, null=True)
    phone = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(blank=True, null=True)
    updated_at = models.DateTimeField(blank=True, null=True)
    updated_by = models.UUIDField(blank=True, null=True)
    deleted_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'family_phones'


class Visit(models.Model):
    id = models.UUIDField(primary_key=True)
    church_id = models.UUIDField(blank=True, null=True)
    family_id = models.UUIDField(blank=True, null=True)
    status_id = models.UUIDField(blank=True, null=True)
    visited_on = models.DateField(blank=True, null=True)
    notes = models.TextField(blank=True, null=True)
    created_by = models.UUIDField(blank=True, null=True)  # the member who registered the visit
    created_at = models.DateTimeField(blank=True, null=True)
    updated_at = models.DateTimeField(blank=True, null=True)
    updated_by = models.UUIDField(blank=True, null=True)
    deleted_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'visits'


class FamilyInternalNote(models.Model):
    id = models.UUIDField(primary_key=True)
    church_id = models.UUIDField(blank=True, null=True)
    family_id = models.UUIDField(blank=True, null=True)
    note = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(blank=True, null=True)
    updated_at = models.DateTimeField(blank=True, null=True)
    updated_by = models.UUIDField(blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'family_internal_notes'