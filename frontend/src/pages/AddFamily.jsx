import { useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Save, UserPlus, MapPin, Loader2 } from 'lucide-react';
import { useAuth } from '../auth.jsx';
import { createRow, updateRow, deleteRow } from '../db';
import {
  useTables, newId, inputClass, PHONE_PATTERN, toAsciiDigits, buildingLabel, diffPatch, searchKey, areaLabel,
  lookupsFor, lookupLabel, nextPersonNo, personFieldsFromForm, LOOKUP,
} from '../data.js';
import { PageHeader, Field, ErrorText, Loading, NotFound } from '../components/ui.jsx';
import PersonFields from '../components/PersonFields.jsx';
import SearchSelect from '../components/SearchSelect.jsx';
import { getPosition, locationErrorMessage, hasLocation, mapsLink, isAutoMapsLink, WEAK_ACCURACY_M } from '../location.js';

// the lookup value that means "head of the family" (if the list has one)
const HEAD_RELATION = /رب\s*(ال)?[أاإ]سرة/;
const NEW = '__new';        // a new area / church / street / building typed in the form, created when the family is saved
const NO_BUILDING = '__none'; // "no building": a hidden placeholder building keeps the family visible under its street
const PLACEHOLDER_BUILDING = 'بدون رقم';
const PLACEHOLDER_STREET = 'بدون شارع';
const isPlaceholder = (b) => Boolean(b) && searchKey(b.house_no) === searchKey(PLACEHOLDER_BUILDING);

// like Field, but a <div>: a <label> would send clicks inside the dropdown list back to the input
function SField({ label, children }) {
  return (
    <div>
      <span className="block text-navy font-bold mb-1">{label}</span>
      {children}
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section className="space-y-4">
      <h2 className="text-lg font-bold text-maroon border-b-2 border-gold/60 pb-1 pt-2">{title}</h2>
      {children}
    </section>
  );
}

// Add a family  (/family/add — optionally ?area=ID | ?street=ID | ?building=ID, the place the user came from)
// or edit one   (/family/:familyId/edit)
export default function AddFamily() {
  const { familyId } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { user, runSync } = useAuth();
  const { data, loading } = useTables([
    'areas', 'streets', 'buildings', 'families', 'people', 'family_phones', 'family_internal_notes', 'lookup_values',
  ]);

  const editing = Boolean(familyId);
  const original = data.families.find((f) => f.id === familyId);
  const otherPhoneRow = data.family_phones.find((p) => p.family_id === familyId);
  const noteRow = data.family_internal_notes.find((n) => n.family_id === familyId);

  const [edits, setEdits] = useState({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [loc, setLoc] = useState(null);          // position found now: { lat, lng, accuracy }
  const [locStatus, setLocStatus] = useState(null); // { kind: 'working'|'success'|'warning'|'error', text }

  const byId = (rows, id) => rows.find((r) => r.id === id);

  // area / street / building start from the page the user came from (or the family being edited)
  const defaults = useMemo(() => {
    const buildingId = original?.building_id || params.get('building') || '';
    const building = byId(data.buildings, buildingId);
    const streetId = building?.street_id || params.get('street') || '';
    const street = byId(data.streets, streetId);
    const areaId = street?.area_id || params.get('area') || '';
    const area = byId(data.areas, areaId);
    return {
      building_id: building ? (isPlaceholder(building) ? NO_BUILDING : buildingId) : '',
      street_id: street ? streetId : '',
      area_id: area ? areaId : '',
      moved: original ? Boolean(original.moved) : area?.kind === 'other_church',
    };
  }, [data.areas, data.streets, data.buildings, original, params]);

  const moved = 'moved' in edits ? edits.moved : defaults.moved;   // the family moved to another church
  const areaId = 'area_id' in edits ? edits.area_id : defaults.area_id;
  const streetId = 'street_id' in edits ? edits.street_id : defaults.street_id;
  const buildingChoice = 'building_id' in edits ? edits.building_id : defaults.building_id;
  const isNewArea = areaId === NEW;
  const isNewStreet = streetId === NEW;
  const isNewBuilding = buildingChoice === NEW;
  const building = isNewBuilding ? null : byId(data.buildings, buildingChoice);

  // value shown in a field: what the user typed, else the saved value, else the default
  const get = (key) => {
    if (key === 'area_id') return areaId;
    if (key === 'street_id') return streetId;
    if (key === 'building_id') return buildingChoice;
    if (key === 'moved') return moved;
    if (key in edits) return edits[key];
    if (key === 'bnotes') return building?.notes ?? '';
    if (key === 'other_phone') return otherPhoneRow?.phone ?? '';
    if (key === 'internal_note') return noteRow?.note ?? '';
    return original?.[key] ?? '';
  };
  const set = (key) => (e) => setEdits((prev) => ({ ...prev, [key]: e.target.value }));

  // Choosing a bigger place clears the smaller ones under it, and the text typed for the old building
  // (its notes / new house number) is dropped: it belongs to that building, not the new one.
  const setPlace = (patch) => {
    setEdits((prev) => {
      const next = { ...prev };
      for (const k of ['bnotes', 'new_house_no', 'new_direction']) delete next[k];
      if ('area_id' in patch || 'moved' in patch) delete next.new_area_name;
      if ('area_id' in patch || 'street_id' in patch || 'moved' in patch) delete next.new_street_name;
      return { ...next, ...patch };
    });
    setLoc(null);
    setLocStatus(null);
  };
  const chooseMoved = (e) => setPlace({ moved: e.target.checked, area_id: '', street_id: '', building_id: '' });
  const chooseArea = (v) => setPlace({ area_id: v, street_id: '', building_id: '' });
  const createArea = (text) => setPlace({ area_id: NEW, new_area_name: text, street_id: '', building_id: '' });
  const chooseStreet = (v) => setPlace({ street_id: v, building_id: '' });
  const createStreet = (text) => setPlace({ street_id: NEW, new_street_name: text, building_id: '' });
  const chooseBuilding = (v) => setPlace({ building_id: v });
  const createBuilding = (text) => setPlace({ building_id: NEW, new_house_no: text });

  const byLabel = (a, b) => String(a.label).localeCompare(String(b.label), 'ar', { numeric: true });
  const areaOptions = useMemo(
    () => data.areas
      .filter((a) => (moved ? a.kind === 'other_church' : a.kind !== 'other_church'))
      .map((a) => ({ value: a.id, label: areaLabel(a) }))
      .sort(byLabel),
    [data.areas, moved],
  );
  const streetOptions = useMemo(
    () => data.streets.filter((s) => s.area_id === areaId && searchKey(s.name) !== searchKey(PLACEHOLDER_STREET)).map((s) => ({ value: s.id, label: s.name || '' })).sort(byLabel),
    [data.streets, areaId],
  );
  const buildingOptions = useMemo(
    () => [
      { value: NO_BUILDING, label: 'بدون مبنى' },
      ...data.buildings
        .filter((b) => b.street_id === streetId && !isPlaceholder(b))
        .map((b) => ({ value: b.id, label: buildingLabel(b) }))
        .sort(byLabel),
    ],
    [data.buildings, streetId],
  );
  const contracts = lookupsFor(data.lookup_values, LOOKUP.contract);

  // the place as the user sees it now, and whether it differs from the saved one
  const chosenArea = byId(data.areas, areaId);
  const chosenStreet = byId(data.streets, streetId);
  const areaName = isNewArea ? get('new_area_name') : chosenArea ? areaLabel(chosenArea) : '';
  const streetName = isNewStreet ? get('new_street_name') : chosenStreet?.name;
  const placeText = [
    areaName,
    streetName,
    moved ? null : isNewBuilding ? `مبنى ${get('new_house_no') || 'جديد'}` : building ? buildingLabel(building) : (buildingChoice === NO_BUILDING ? 'بدون مبنى' : null),
  ].filter(Boolean).join(' › ') || '—';
  const placeTouched = ['area_id', 'street_id', 'building_id', 'moved'].some((k) => k in edits);

  if (loading) return <Loading />;
  if (editing && !original) return <NotFound back="/" />;

  const fromBuilding = params.get('building');
  const fromStreet = params.get('street');
  const fromArea = params.get('area');
  const back = editing
    ? `/family/${familyId}`
    : fromBuilding ? `/building/${fromBuilding}`
      : fromStreet ? `/street/${fromStreet}`
        : fromArea ? `/area/${fromArea}`
          : '/';

  // ---------- building location (same method as the pin in the building list) ----------
  const hasBuilding = !moved && (Boolean(building) || isNewBuilding);
  const savedLocation = hasLocation(building);
  const findLocation = async () => {
    setLocStatus({ kind: 'working', text: 'جاري تحديد موقعك... اسمح للتطبيق بالوصول إلى الموقع إذا ظهر طلب الإذن.' });
    try {
      const { coords } = await getPosition();
      const lat = Number(coords.latitude.toFixed(6));
      const lng = Number(coords.longitude.toFixed(6));
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
        setLocStatus({ kind: 'error', text: 'وصل موقع غير صالح من الجهاز. حاول مرة أخرى.' });
        return;
      }
      const accuracy = Math.round(coords.accuracy);
      setLoc({ lat, lng, accuracy });
      setLocStatus(accuracy > WEAK_ACCURACY_M
        ? { kind: 'warning', text: `تم تحديد الموقع لكن الدقة ضعيفة (±${accuracy} متر). يُفضَّل إعادة المحاولة في مكان مفتوح مع تشغيل GPS. سيُحفظ مع الأسرة.` }
        : { kind: 'success', text: `تم تحديد الموقع بدقة ±${accuracy} متر. سيُحفظ عند الضغط على حفظ.` });
    } catch (err) {
      setLocStatus({ kind: 'error', text: locationErrorMessage(err) });
    }
  };
  const STATUS_STYLE = {
    working: 'bg-gray-100 text-gray-700', success: 'bg-green-50 text-green-800',
    warning: 'bg-amber-50 text-amber-800', error: 'bg-red-50 text-red-700',
  };

  // after = 'close' -> family page | 'members' -> add the other people of the family
  const save = async (after) => {
    setError('');

    const fields = {
      family_name: get('family_name').trim(), // the head of the family's name
      floor_no: get('floor_no').trim() || null,
      apartment_no: get('apartment_no').trim() || null,
      contract_type_id: get('contract_type_id') || null,
      primary_phone: toAsciiDigits(get('primary_phone').trim()) || null,
      landline: toAsciiDigits(get('landline').trim()) || null,
      membership_no: get('membership_no').trim() || null,
      last_visit_on: get('last_visit_on') || null,
      notes: get('notes').trim() || null,
      moved,
    };
    const otherPhone = toAsciiDigits(get('other_phone').trim());
    const internalNote = get('internal_note').trim();

    if (!fields.family_name) return setError('اكتب اسم رب الأسرة');
    for (const phone of [fields.primary_phone, fields.landline, otherPhone]) {
      if (phone && !PHONE_PATTERN.test(phone)) return setError('رقم الهاتف غير صحيح');
    }
    const newHouseNo = get('new_house_no').trim();
    const newAreaName = get('new_area_name').trim();
    const newStreetName = get('new_street_name').trim();
    if (moved) {
      if (!areaId) return setError('اختر الكنيسة التي انتقلت إليها الأسرة، أو اكتب اسمها لإضافتها');
    } else if (areaId || streetId || buildingChoice || (editing && original.building_id)) {
      // the whole place (area > street > building) is saved together, so it must be complete
      if (!areaId) return setError('اختر المنطقة');
      if (!streetId) return setError('اختر الشارع، أو اكتب اسمه لإضافته');
      if (!buildingChoice) return setError('اختر المبنى، أو "بدون مبنى"، أو اكتب رقم مبنى جديد');
      if (isNewBuilding && !newHouseNo) return setError('اكتب رقم المنزل للمبنى الجديد');
    }

    setSaving(true);
    try {
      const now = new Date().toISOString();
      const church_id = user?.church_id ?? null;

      // 0) the place, from the top down. Anything new is created first, so the outbox sends it before the family.
      let aId = areaId || null;
      let sId = streetId || null;
      const findArea = (name) => data.areas.find((x) => (x.kind === 'other_church') === moved && searchKey(areaLabel(x)) === searchKey(name));
      if (isNewArea) {
        const same = findArea(newAreaName);   // typed twice / already there -> reuse, never a duplicate
        if (same) aId = same.id;
        else {
          aId = newId();
          await createRow('areas', {
            id: aId, church_id, kind: moved ? 'other_church' : 'own',
            ...(moved ? { name: newAreaName } : { area_no: newAreaName }), created_at: now, updated_at: now,
          });
        }
      }
      const ensureStreet = async (name) => {
        const same = isNewArea ? null : data.streets.find((x) => x.area_id === aId && searchKey(x.name) === searchKey(name));
        if (same) return same.id;
        const sid = newId();
        await createRow('streets', { id: sid, church_id, area_id: aId, name, created_at: now, updated_at: now });
        return sid;
      };
      if (isNewStreet) sId = await ensureStreet(newStreetName);
      else if (moved && aId && !sId) sId = await ensureStreet(PLACEHOLDER_STREET); // moved, street unknown
      const ensurePlaceholderBuilding = async () => {
        const same = data.buildings.find((x) => x.street_id === sId && isPlaceholder(x));
        if (same) return same.id;
        const bid = newId();
        await createRow('buildings', { id: bid, church_id, street_id: sId, house_no: PLACEHOLDER_BUILDING, created_at: now, updated_at: now });
        return bid;
      };

      // 1) the building: a new one, the hidden "no building" one, or the notes / location of the chosen one
      let buildingId = null;
      const buildingNotes = get('bnotes').trim() || null;
      const locFields = loc ? { lat: loc.lat, lng: loc.lng, location_accuracy: loc.accuracy } : {};
      if (moved) {
        if (sId) buildingId = await ensurePlaceholderBuilding();
      } else if (isNewBuilding) {
        buildingId = newId();
        await createRow('buildings', {
          id: buildingId, church_id, street_id: sId, house_no: newHouseNo,
          direction: get('new_direction').trim() || null, notes: buildingNotes, ...locFields,
          ...(loc ? { maps_url: mapsLink(loc.lat, loc.lng) } : {}), created_at: now, updated_at: now,
        });
      } else if (buildingChoice === NO_BUILDING) {
        buildingId = await ensurePlaceholderBuilding();
      } else if (building) {
        buildingId = building.id;
        const patch = diffPatch(building, { notes: buildingNotes, ...locFields });
        if (loc && isAutoMapsLink(building.maps_url)) patch.maps_url = mapsLink(loc.lat, loc.lng);
        if (Object.keys(patch).length) await updateRow('buildings', building.id, patch);
      }
      fields.building_id = buildingId;

      // 2) the family
      let id = familyId;
      if (editing) {
        const patch = diffPatch(original, fields);
        if (Object.keys(patch).length) await updateRow('families', familyId, patch);
      } else {
        id = newId(); // created on the device -> works offline, never duplicated
        await createRow('families', { id, church_id, ...fields, created_at: now, updated_at: now });
      }

      // 3) the other mobile (one extra number)
      if (otherPhone) {
        if (otherPhoneRow) {
          if (otherPhoneRow.phone !== otherPhone) await updateRow('family_phones', otherPhoneRow.id, { phone: otherPhone });
        } else {
          await createRow('family_phones', { id: newId(), church_id, family_id: id, person_id: null, phone: otherPhone, created_at: now, updated_at: now });
        }
      } else if (otherPhoneRow) {
        await deleteRow('family_phones', otherPhoneRow.id);
      }

      // 4) internal note (old paper file). Cleared by saving an empty note.
      if (noteRow) {
        if ((noteRow.note || '') !== internalNote) await updateRow('family_internal_notes', noteRow.id, { note: internalNote });
      } else if (internalNote) {
        await createRow('family_internal_notes', { id: newId(), church_id, family_id: id, note: internalNote, created_at: now, updated_at: now });
      }

      // 5) a new family starts with its head as the first person
      if (!editing) {
        const headRelation = data.lookup_values.find((l) => LOOKUP.relation.test(l.list_key || '') && HEAD_RELATION.test(l.label || ''));
        await createRow('people', {
          id: newId(), church_id, family_id: id, person_no: nextPersonNo([], id),
          full_name: fields.family_name, ...personFieldsFromForm(get), relation_id: headRelation?.id ?? null,
          created_at: now, updated_at: now,
        });
      }

      runSync(); // sent now if online, otherwise when the connection returns
      navigate(after === 'members' ? `/family/${id}/person/add?new=1` : `/family/${id}`, { replace: true });
    } catch (err) {
      console.error(err);
      setError('تعذّر الحفظ على الجهاز. حاول مرة أخرى.');
      setSaving(false);
    }
  };

  const submit = (e) => { e.preventDefault(); save('close'); };

  const primaryBtn = 'w-full bg-maroon text-white text-lg font-bold p-4 rounded-xl flex items-center justify-center gap-2 disabled:opacity-60';
  const secondaryBtn = 'w-full bg-white text-maroon border-2 border-maroon text-lg font-bold p-4 rounded-xl flex items-center justify-center gap-2 disabled:opacity-60';

  // PersonFields edits "full_name": for the head that is the family name
  const headGet = (k) => (k === 'full_name' ? get('family_name') : ['phone', 'phone2', 'notes'].includes(k) ? undefined : get(k)); // family phones/notes have their own fields above
  const headSet = (k) => (k === 'full_name' ? set('family_name') : set(k));

  return (
    <div className="pb-20">
      <PageHeader title={editing ? 'تعديل بيانات الأسرة' : 'إضافة أسرة جديدة'} back={back} />

      <form className="p-4 space-y-6" onSubmit={submit} noValidate>
        {/* ================= حالة الأسرة (أول سؤال: يحدد باقي الأسئلة) ================= */}
        <label className="flex items-center gap-3 p-4 rounded-xl bg-white shadow-sm border-2 border-gold/40 cursor-pointer">
          <input type="checkbox" checked={moved} onChange={chooseMoved} className="w-6 h-6 accent-maroon" />
          <span className="font-bold text-navy">الأسرة انتقلت إلى كنيسة أخرى</span>
        </label>

        {/* ================= العنوان والموقع ================= */}
        <Section title={moved ? 'الكنيسة التي انتقلت إليها' : 'العنوان والموقع'}>
          <SField label={moved ? 'اسم الكنيسة' : 'رقم المنطقة'}>
            <SearchSelect
              options={areaOptions}
              value={areaId}
              valueLabel={isNewArea ? get('new_area_name') : ''}
              onChange={chooseArea}
              onCreate={createArea}
              createLabel={moved ? 'ككنيسة جديدة' : 'كمنطقة جديدة'}
              placeholder={moved ? '— ابحث عن الكنيسة أو اكتب اسمها —' : '— اختر المنطقة —'}
            />
          </SField>

          <SField label={moved ? 'الشارع (اختياري)' : 'اسم الشارع'}>
            <SearchSelect
              options={streetOptions}
              value={streetId}
              valueLabel={isNewStreet ? get('new_street_name') : ''}
              onChange={chooseStreet}
              onCreate={createStreet}
              createLabel="كشارع جديد"
              disabled={!areaId}
              placeholder={areaId ? '— ابحث عن الشارع أو اكتب اسمه —' : (moved ? '— اختر الكنيسة أولاً —' : '— اختر المنطقة أولاً —')}
            />
          </SField>

          {!moved && (
            <SField label="المبنى (رقم المنزل / الاتجاه)">
              <SearchSelect
                options={buildingOptions}
                value={buildingChoice}
                valueLabel={isNewBuilding ? `مبنى ${get('new_house_no')}` : ''}
                onChange={chooseBuilding}
                onCreate={createBuilding}
                createLabel="كمبنى جديد"
                allowClear={false}
                disabled={!streetId}
                placeholder={streetId ? '— اختر المبنى أو اكتب رقمه —' : '— اختر الشارع أولاً —'}
              />
            </SField>
          )}

          {editing && placeTouched && areaId && (
            <p className="p-3 rounded-lg bg-amber-50 text-amber-800 text-sm">
              ستُنقل الأسرة إلى: {placeText}
            </p>
          )}

          {isNewBuilding && !moved && (
            <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-gold/10">
              <Field label="رقم المنزل *">
                <input type="text" value={get('new_house_no')} onChange={set('new_house_no')} className={inputClass} />
              </Field>
              <Field label="الاتجاه">
                <input type="text" value={get('new_direction')} onChange={set('new_direction')} className={inputClass} placeholder="مثال: بجوار الصيدلية" />
              </Field>
            </div>
          )}

          {!moved && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="رقم الدور">
                <input type="text" value={get('floor_no')} onChange={set('floor_no')} className={inputClass} />
              </Field>
              <Field label="رقم الشقة">
                <input type="text" value={get('apartment_no')} onChange={set('apartment_no')} className={inputClass} />
              </Field>
            </div>
          )}

          {hasBuilding && (
            <>
              <Field label="ملاحظات على العمارة">
                <textarea rows={2} value={get('bnotes')} onChange={set('bnotes')} className={inputClass} />
              </Field>

              <div>
                <span className="block text-navy font-bold mb-1">الموقع (اللوكيشن)</span>
                <button
                  type="button"
                  onClick={findLocation}
                  disabled={locStatus?.kind === 'working'}
                  className="w-full bg-white border-2 border-navy/30 text-navy font-bold p-3 rounded-xl flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  {locStatus?.kind === 'working' ? <Loader2 className="w-5 h-5 animate-spin" /> : <MapPin className="w-5 h-5" />}
                  {loc || savedLocation ? 'تحديث موقع العمارة' : 'تحديد موقع العمارة'}
                </button>
                {!locStatus && savedLocation && !loc && (
                  <p className="mt-1 text-sm text-green-700">للعمارة موقع محفوظ بالفعل.</p>
                )}
                {locStatus && (
                  <p role="status" className={`mt-1 p-3 rounded-lg text-sm ${STATUS_STYLE[locStatus.kind]}`}>{locStatus.text}</p>
                )}
              </div>
            </>
          )}

          {contracts.length > 0 && (
            <Field label="نوع العقد">
              <select value={get('contract_type_id')} onChange={set('contract_type_id')} className={inputClass}>
                <option value="">—</option>
                {contracts.map((c) => <option key={c.id} value={c.id}>{lookupLabel(c)}</option>)}
              </select>
            </Field>
          )}
        </Section>

        {/* ================= بيانات رب الأسرة ================= */}
        <Section title={editing ? 'اسم رب الأسرة' : 'بيانات رب الأسرة'}>
          {editing ? (
            <Field label="اسم رب الأسرة *">
              <input type="text" value={get('family_name')} onChange={set('family_name')} className={inputClass} />
            </Field>
          ) : (
            <PersonFields
              get={headGet}
              set={headSet}
              lookups={data.lookup_values}
              nameLabel="اسم رب الأسرة *"
              namePlaceholder="اكتب اسم رب الأسرة"
            />
          )}
        </Section>

        {/* ================= التواصل والبيانات الإدارية ================= */}
        <Section title="التواصل والبيانات الإدارية">
          <Field label="رقم الموبايل">
            <input type="tel" inputMode="tel" dir="ltr" value={get('primary_phone')} onChange={set('primary_phone')} className={inputClass} placeholder="01xxxxxxxxx" />
          </Field>
          <Field label="موبايل آخر">
            <input type="tel" inputMode="tel" dir="ltr" value={get('other_phone')} onChange={set('other_phone')} className={inputClass} />
          </Field>
          <Field label="تليفون أرضي">
            <input type="tel" inputMode="tel" dir="ltr" value={get('landline')} onChange={set('landline')} className={inputClass} />
          </Field>
          <Field label="رقم العضوية الكنسية">
            <input type="text" value={get('membership_no')} onChange={set('membership_no')} className={inputClass} />
          </Field>
          <Field label="تاريخ آخر زيارة">
            <input type="date" value={get('last_visit_on')} onChange={set('last_visit_on')} className={inputClass} />
          </Field>
        </Section>

        {/* ================= ملاحظات ================= */}
        <Section title="ملاحظات">
          <Field label="ملاحظات بخصوص الأسرة">
            <textarea rows={3} value={get('notes')} onChange={set('notes')} className={inputClass} />
          </Field>
          <Field label="ملاحظات على الورق القديم (داخلية)">
            <textarea rows={3} value={get('internal_note')} onChange={set('internal_note')} className={inputClass} />
          </Field>
        </Section>

        <ErrorText>{error}</ErrorText>

        {editing ? (
          <button type="submit" disabled={saving} className={primaryBtn}>
            <Save className="w-6 h-6" /> حفظ
          </button>
        ) : (
          <div className="space-y-3">
            <button type="button" disabled={saving} onClick={() => save('members')} className={primaryBtn}>
              <UserPlus className="w-6 h-6" /> حفظ وإضافة باقي أفراد الأسرة
            </button>
            <button type="submit" disabled={saving} className={secondaryBtn}>
              <Save className="w-6 h-6" /> حفظ وإغلاق
            </button>
          </div>
        )}
      </form>
    </div>
  );
}
