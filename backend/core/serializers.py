from rest_framework import serializers
from .models import (
    Area, Street, Building, Family, Person,
    FamilyPhone, Visit, LookupValue, FamilyInternalNote
)


class AreaSerializer(serializers.ModelSerializer):
    class Meta:
        model = Area
        fields = '__all__'


class StreetSerializer(serializers.ModelSerializer):
    class Meta:
        model = Street
        fields = '__all__'


class BuildingSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(required=False)  # created on the device

    class Meta:
        model = Building
        fields = '__all__'

    def validate(self, attrs):
        """
        The GPS position sent by the app: real ranges, and latitude/longitude always
        come together (also when only one of them is sent in an edit).
        """
        inst = self.instance
        lat = attrs['lat'] if 'lat' in attrs else getattr(inst, 'lat', None)
        lng = attrs['lng'] if 'lng' in attrs else getattr(inst, 'lng', None)
        acc = attrs['location_accuracy'] if 'location_accuracy' in attrs else getattr(inst, 'location_accuracy', None)

        errors = {}
        # written as "not (a <= x <= b)" so NaN / infinity are rejected too
        if lat is not None and not (-90 <= lat <= 90):
            errors['lat'] = ['Latitude must be between -90 and 90']
        if lng is not None and not (-180 <= lng <= 180):
            errors['lng'] = ['Longitude must be between -180 and 180']
        if (lat is None) != (lng is None):
            errors['lat'] = errors.get('lat', ['Latitude and longitude must be sent together'])
        if acc is not None and not (0 <= acc <= 1_000_000):
            errors['location_accuracy'] = ['Accuracy must be between 0 and 1,000,000 metres']
        if errors:
            raise serializers.ValidationError(errors)

        if lat is None and lng is None and ('lat' in attrs or 'lng' in attrs):
            attrs['location_accuracy'] = None   # position removed -> its accuracy goes too
        return attrs


class LookupValueSerializer(serializers.ModelSerializer):
    class Meta:
        model = LookupValue
        fields = '__all__'


class FamilySerializer(serializers.ModelSerializer):
    # The app creates the UUID on the device (so a family can be saved offline
    # and re-sent safely). If it is not sent, the server generates one.
    id = serializers.UUIDField(required=False)

    class Meta:
        model = Family
        fields = '__all__'


class PersonSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(required=False)  # created on the device

    class Meta:
        model = Person
        fields = '__all__'


class FamilyPhoneSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(required=False)  # created on the device

    class Meta:
        model = FamilyPhone
        fields = '__all__'


class VisitSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(required=False)  # created on the device

    class Meta:
        model = Visit
        fields = '__all__'


class FamilyInternalNoteSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(required=False)  # created on the device

    class Meta:
        model = FamilyInternalNote
        fields = '__all__'