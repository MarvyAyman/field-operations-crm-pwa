import { useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Save, UserPlus, MapPin, Loader2 } from 'lucide-react';
import { useAuth } from '../auth.jsx';
import { createRow, updateRow, deleteRow } from '../db';
import {
  useTables, newId, inputClass, PHONE_PATTERN, toAsciiDigits, buildingLabel, diffPatch,
  lookupsFor, lookupLabel, nextPersonNo, personFieldsFromForm, LOOKUP,
} from '../data.js';
import { PageHeader, Field, ErrorText, Loading, NotFound } from '../components/ui.jsx';
import PersonFields from '../components/PersonFields.jsx';
import { getPosition, locationErrorMessage, hasLocation, mapsLink, isAutoMapsLink, WEAK_ACCURACY_M } from '../location.js';

// the lookup value that means "head of the family" (if the list has one)
const HEAD_RELATION = /رب\s*(ال)?[أاإ]سرة/;
const NEW_BUILDING = '__new';

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
    return { building_id: building ? buildingId : '', street_id: street ? streetId : '', area_id: byId(data.areas, areaId) ? areaId : '' };
  }, [data.areas, data.streets, data.buildings, original, params]);

  const areaId = 'area_id' in edits ? edits.area_id : defaults.area_id;
  const streetId = 'street_id' in edits ? edits.street_id : defaults.street_id;
  const buildingChoice = 'building_id' in edits ? edits.building_id : defaults.building_id;
  const isNewBuilding = buildingChoice === NEW_BUILDING;
  const building = isNewBuilding ? null : byId(data.buildings, buildingChoice);

  // value shown in a field: what the user typed, else the saved value, else the default
  const get = (key) => {
    if (key === 'area_id') return areaId;
    if (key === 'street_id') return streetId;
    if (key === 'building_id') return buildingChoice;
    if (key in edits) return edits[key];
    if (key === 'bnotes') return building?.notes ?? '';
    if (key === 'other_phone') return otherPhoneRow?.phone ?? '';
    if (key === 'internal_note') return noteRow?.note ?? '';
    return original?.[key] ?? '';
  };
  const set = (key) => (e) => setEdits((prev) => ({ ...prev, [key]: e.target.value }));

  // choosing a bigger place clears the smaller ones under it
  const chooseArea = (e) => { setEdits((p) => ({ ...p, area_id: e.target.value, street_id: '', building_id: '' })); setLoc(null); setLocStatus(null); };
  const chooseStreet = (e) => { setEdits((p) => ({ ...p, street_id: e.target.value, building_id: '' })); setLoc(null); setLocStatus(null); };
  const chooseBuilding = (e) => { setEdits((p) => ({ ...p, building_id: e.target.value })); setLoc(null); setLocStatus(null); };

  const areaOptions = useMemo(
    () => [...data.areas].sort((a, b) => String(a.area_no ?? '').localeCompare(String(b.area_no ?? ''), 'ar', { numeric: true })),
    [data.areas],
  );
  const streetOptions = useMemo(
    () => data.streets.filter((s) => s.area_id === areaId).sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ar', { numeric: true })),
    [data.streets, areaId],
  );
  const buildingOptions = useMemo(
    () => data.buildings
      .filter((b) => b.street_id === streetId)
      .sort((a, b) => String(a.house_no ?? '').localeCompare(String(b.house_no ?? ''), 'ar', { numeric: true })),
    [data.buildings, streetId],
  );
  const contracts = lookupsFor(data.lookup_values, LOOKUP.contract);

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
  const hasBuilding = Boolean(building) || isNewBuilding;
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
    };
    const otherPhone = toAsciiDigits(get('other_phone').trim());
    const internalNote = get('internal_note').trim();

    if (!fields.family_name) return setError('اكتب اسم رب الأسرة');
    for (const phone of [fields.primary_phone, fields.landline, otherPhone]) {
      if (phone && !PHONE_PATTERN.test(phone)) return setError('رقم الهاتف غير صحيح');
    }
    const newHouseNo = get('new_house_no').trim();
    if (isNewBuilding) {
      if (!streetId) return setError('اختر الشارع قبل إضافة مبنى جديد');
      if (!newHouseNo) return setError('اكتب رقم المنزل للمبنى الجديد');
    }

    setSaving(true);
    try {
      const now = new Date().toISOString();
      const church_id = user?.church_id ?? null;

      // 1) the building: a new one, or the notes / location of the chosen one
      let buildingId = building?.id ?? null;
      const buildingNotes = get('bnotes').trim() || null;
      const locFields = loc ? { lat: loc.lat, lng: loc.lng, location_accuracy: loc.accuracy } : {};
      if (isNewBuilding) {
        buildingId = newId();
        await createRow('buildings', {
          id: buildingId, church_id, street_id: streetId, house_no: newHouseNo,
          direction: get('new_direction').trim() || null, notes: buildingNotes, ...locFields,
          ...(loc ? { maps_url: mapsLink(loc.lat, loc.lng) } : {}), created_at: now, updated_at: now,
        });
      } else if (building) {
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
        {/* ================= العنوان والموقع ================= */}
        <Section title="العنوان والموقع">
          <Field label="رقم المنطقة">
            <select value={areaId} onChange={chooseArea} className={inputClass}>
              <option value="">— اختر المنطقة —</option>
              {areaOptions.map((a) => <option key={a.id} value={a.id}>منطقة {a.area_no}</option>)}
            </select>
          </Field>

          <Field label="اسم الشارع">
            <select value={streetId} onChange={chooseStreet} disabled={!areaId} className={`${inputClass} disabled:opacity-60`}>
              <option value="">{areaId ? '— اختر الشارع —' : '— اختر المنطقة أولاً —'}</option>
              {streetOptions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>

          <Field label="المبنى (رقم المنزل / الاتجاه)">
            <select value={buildingChoice} onChange={chooseBuilding} disabled={!streetId} className={`${inputClass} disabled:opacity-60`}>
              <option value="">{streetId ? '— بدون مبنى —' : '— اختر الشارع أولاً —'}</option>
              {buildingOptions.map((b) => <option key={b.id} value={b.id}>{buildingLabel(b)}</option>)}
              {streetId && <option value={NEW_BUILDING}>+ مبنى جديد</option>}
            </select>
          </Field>

          {isNewBuilding && (
            <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-gold/10">
              <Field label="رقم المنزل *">
                <input type="text" value={get('new_house_no')} onChange={set('new_house_no')} className={inputClass} />
              </Field>
              <Field label="الاتجاه">
                <input type="text" value={get('new_direction')} onChange={set('new_direction')} className={inputClass} placeholder="مثال: بجوار الصيدلية" />
              </Field>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="رقم الدور">
              <input type="text" value={get('floor_no')} onChange={set('floor_no')} className={inputClass} />
            </Field>
            <Field label="رقم الشقة">
              <input type="text" value={get('apartment_no')} onChange={set('apartment_no')} className={inputClass} />
            </Field>
          </div>

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
