import { useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Save } from 'lucide-react';
import { useAuth } from '../auth.jsx';
import { createRow, updateRow } from '../db';
import { useTables, newId, inputClass, diffPatch, searchKey, areaLabel } from '../data.js';
import SearchSelect from '../components/SearchSelect.jsx';
import { PageHeader, Field, ErrorText, Loading, NotFound } from '../components/ui.jsx';

const NEW = '__new';
const UNKNOWN = 'غير محدد';
const UNKNOWN_NAMES = [UNKNOWN, 'بدون رقم', 'بدون شارع'].map(searchKey);
const byLabel = (a, b) => String(a.label).localeCompare(String(b.label), 'ar', { numeric: true });

function SField({ label, children }) {
  return (
    <div>
      <span className="block text-navy font-bold mb-1">{label}</span>
      {children}
    </div>
  );
}

// Add a building (/building/add?street=ID)  or  edit one (/building/:buildingId/edit)
export default function BuildingForm() {
  const { buildingId } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { user, runSync } = useAuth();
  const { data, loading } = useTables(['areas', 'streets', 'buildings', 'families']);

  const editing = Boolean(buildingId);
  const original = data.buildings.find((b) => b.id === buildingId);
  const streetId = editing ? original?.street_id : params.get('street');
  const street = data.streets.find((s) => s.id === streetId);

  const [edits, setEdits] = useState({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const get = (key) => (key in edits ? edits[key] : original?.[key] ?? '');
  const set = (key) => (e) => setEdits((prev) => ({ ...prev, [key]: e.target.value }));

  // moving the building (edit only): the area / church and street it should be under. Its families go with it.
  const currentArea = data.areas.find((a) => a.id === street?.area_id);
  const areaSel = 'area_id' in edits ? edits.area_id : street?.area_id || '';
  const streetSel = 'street_id' in edits ? edits.street_id : streetId || '';
  const isNewArea = areaSel === NEW;
  const isNewStreet = streetSel === NEW;
  const setPlace = (patch) => setEdits((prev) => ({ ...prev, ...patch }));
  const areaOptions = useMemo(
    () => data.areas.filter((a) => a.kind !== 'other_church').map((a) => ({ value: a.id, label: areaLabel(a) })).sort(byLabel),
    [data.areas],
  );
  const streetOptions = useMemo(
    () => data.streets.filter((x) => x.area_id === areaSel).map((x) => ({ value: x.id, label: x.name || '' })).sort(byLabel),
    [data.streets, areaSel],
  );
  const movedPlace = editing && (isNewArea || isNewStreet || (areaSel && streetSel !== streetId) || (areaSel && !streetSel));
  const familiesHere = editing ? data.families.filter((f) => f.building_id === buildingId && !f.deleted_at).length : 0;

  if (loading) return <Loading />;
  if (!street || (editing && !original)) return <NotFound back="/" />;

  const back = editing ? `/building/${buildingId}` : `/street/${streetId}`;

  const handleSave = async (e) => {
    e.preventDefault();
    setError('');

    const fields = {
      house_no: get('house_no').trim(),
      direction: get('direction').trim() || null,
      notes: get('notes').trim() || null,
      maps_url: get('maps_url').trim() || null,
    };
    if (!fields.house_no) return setError('اكتب رقم المبنى');
    if (fields.maps_url && !/^https?:\/\//i.test(fields.maps_url)) return setError('رابط الخريطة يجب أن يبدأ بـ http');

    if (movedPlace) {
      if (!areaSel) return setError('اختر المنطقة');
      if (isNewArea && !get('new_area_name').trim()) return setError('اكتب رقم المنطقة الجديدة');
    }

    setSaving(true);
    try {
      let id = buildingId;
      if (editing) {
        let patchFields = fields;
        if (movedPlace) {
          const now = new Date().toISOString();
          const church_id = user?.church_id ?? null;
          // the place, top down: new things are created first, so the outbox sends them before the building
          let aId = areaSel;
          let newArea = null;
          if (isNewArea) {
            const name = get('new_area_name').trim();
            const same = data.areas.find((x) => x.kind !== 'other_church' && searchKey(areaLabel(x)) === searchKey(name));
            if (same) aId = same.id;
            else {
              aId = newId();
              newArea = { id: aId, church_id, kind: 'own', area_no: name, created_at: now, updated_at: now };
              await createRow('areas', newArea);
            }
          }
          const areaRow = newArea || data.areas.find((x) => x.id === aId);
          const streetName = isNewStreet ? get('new_street_name').trim() : (streetSel ? '' : UNKNOWN);
          let sId = streetSel;
          if (streetName) {
            const same = newArea ? null : data.streets.find((x) => x.area_id === aId && (streetName === UNKNOWN ? UNKNOWN_NAMES.includes(searchKey(x.name)) : searchKey(x.name) === searchKey(streetName)));
            if (same) sId = same.id;
            else {
              sId = newId();
              await createRow('streets', { id: sId, church_id, area_id: aId, name: streetName, created_at: now, updated_at: now });
            }
          }
          patchFields = { ...fields, street_id: sId };
          // the families of this building follow it: "moved" = they are now under another church
          const isChurch = areaRow?.kind === 'other_church';
          for (const f of data.families.filter((x) => x.building_id === buildingId && !x.deleted_at && Boolean(x.moved) !== isChurch)) {
            await updateRow('families', f.id, { moved: isChurch });
          }
        }
        await updateRow('buildings', buildingId, diffPatch(original, patchFields));
      } else {
        id = newId();
        const now = new Date().toISOString();
        await createRow('buildings', {
          id, church_id: user?.church_id ?? null, street_id: streetId, ...fields, created_at: now, updated_at: now,
        });
      }
      runSync();
      navigate(`/building/${id}`, { replace: true });
    } catch (err) {
      console.error(err);
      setError('تعذّر الحفظ على الجهاز. حاول مرة أخرى.');
      setSaving(false);
    }
  };

  return (
    <div className="pb-20">
      <PageHeader title={editing ? 'تعديل المبنى' : 'إضافة مبنى'} subtitle={street.name} back={back} />

      <form className="p-4 space-y-4" onSubmit={handleSave} noValidate>
        <Field label="رقم المبنى *">
          <input type="text" value={get('house_no')} onChange={set('house_no')} className={inputClass} />
        </Field>
        <Field label="الاتجاه / وصف مختصر">
          <input type="text" value={get('direction')} onChange={set('direction')} className={inputClass} placeholder="مثال: بجوار الصيدلية" />
        </Field>
        <Field label="رابط الخريطة">
          <input type="url" dir="ltr" value={get('maps_url')} onChange={set('maps_url')} className={inputClass} placeholder="https://maps.google.com/..." />
        </Field>
        <Field label="ملاحظات">
          <textarea rows={3} value={get('notes')} onChange={set('notes')} className={inputClass} />
        </Field>

        {editing && (
          <div className="bg-white rounded-xl p-4 shadow-sm space-y-3">
            <h2 className="text-navy font-bold">نقل المبنى إلى منطقة / شارع آخر (اختياري)</h2>
            <SField label="المنطقة">
              <SearchSelect
                options={areaOptions}
                value={areaSel}
                valueLabel={isNewArea ? get('new_area_name') : (currentArea?.kind === 'other_church' && areaSel === currentArea.id ? areaLabel(currentArea) : '')}
                onChange={(v) => setPlace({ area_id: v, street_id: v === street?.area_id ? streetId : '' })}
                onCreate={(text) => setPlace({ area_id: NEW, new_area_name: text, street_id: '' })}
                createLabel="كمنطقة جديدة"
                placeholder="— اختر المنطقة —"
              />
            </SField>
            <SField label="الشارع">
              <SearchSelect
                options={streetOptions}
                value={streetSel}
                valueLabel={isNewStreet ? get('new_street_name') : ''}
                onChange={(v) => setPlace({ street_id: v })}
                onCreate={(text) => setPlace({ street_id: NEW, new_street_name: text })}
                createLabel="كشارع جديد"
                disabled={!areaSel}
                placeholder={areaSel ? '— اختياري: ابحث عن الشارع أو اكتب اسمه —' : '— اختر المنطقة أولاً —'}
              />
            </SField>
            {movedPlace && (
              <p className="p-3 rounded-lg bg-gold/20 text-navy text-sm font-bold">
                عند الحفظ سينتقل المبنى{familiesHere > 0 ? ` مع ${familiesHere} ${familiesHere === 1 ? 'أسرة' : 'أسرة'}` : ''} إلى:{' '}
                {isNewArea ? get('new_area_name') : areaLabel(data.areas.find((a) => a.id === areaSel))} › {isNewStreet ? get('new_street_name') : (streetSel ? data.streets.find((x) => x.id === streetSel)?.name : UNKNOWN)}
              </p>
            )}
          </div>
        )}

        <ErrorText>{error}</ErrorText>

        <button
          type="submit"
          disabled={saving}
          className="w-full bg-maroon text-white text-lg font-bold p-4 rounded-xl flex items-center justify-center gap-2 disabled:opacity-60"
        >
          <Save className="w-6 h-6" /> حفظ
        </button>
      </form>
    </div>
  );
}
