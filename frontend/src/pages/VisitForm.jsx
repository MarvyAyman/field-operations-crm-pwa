import { useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Save, Trash2, MapPin } from 'lucide-react';
import { useAuth } from '../auth.jsx';
import { createRow, updateRow, deleteRow } from '../db';
import { useTables, newId, inputClass, diffPatch, lookupsFor, LOOKUP, today } from '../data.js';
import { useBestPosition } from '../useBestPosition.js';
import { mapsLink, isAutoMapsLink, shouldSavePosition } from '../location.js';
import { PageHeader, Field, ErrorText, Loading, NotFound } from '../components/ui.jsx';

// Record a visit (/family/:familyId/visit/add)  or  edit one (/visit/:visitId/edit)
export default function VisitForm() {
  const { familyId: familyParam, visitId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, runSync } = useAuth();
  const { data, loading } = useTables(['families', 'visits', 'lookup_values', 'buildings']);

  const editing = Boolean(visitId);
  const original = data.visits.find((v) => v.id === visitId);
  const familyId = editing ? original?.family_id : familyParam;
  const family = data.families.find((f) => f.id === familyId);
  const statuses = lookupsFor(data.lookup_values, LOOKUP.visitStatus);

  // while a NEW visit is being recorded, the phone looks for the building's GPS position in the background
  const { best, info } = useBestPosition(!editing);
  const building = data.buildings.find((b) => b.id === family?.building_id);

  const [edits, setEdits] = useState({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const defaults = { visited_on: today() };
  const get = (key) => (key in edits ? edits[key] : original?.[key] ?? defaults[key] ?? '');
  const set = (key) => (e) => setEdits((prev) => ({ ...prev, [key]: e.target.value }));

  if (loading) return <Loading />;
  if (!family || (editing && !original)) return <NotFound back="/" />;
  if (editing && !original._pending && original.created_by !== user?.id) return <NotFound back={`/family/${familyId}`} />;

  const back = `/family/${familyId}`;
  const backState = location.state?.edit ? { edit: true } : undefined; // came from the family page in edit mode

  // A visit made TODAY is made at the building: use the best GPS reading as the building's position when the
  // building has none, or when this reading is clearly better. Skipped for back-dated visits (not on site).
  const onSite = !editing && get('visited_on') === today();
  async function saveBuildingPosition() {
    try {
      const reading = best.current;
      if (!onSite || !building || !reading) return;
      const neighbours = data.buildings.filter((b) => b.street_id === building.street_id && b.id !== building.id && !b.deleted_at);
      if (!shouldSavePosition(building, reading, neighbours)) return;
      const patch = { lat: reading.lat, lng: reading.lng, location_accuracy: reading.accuracy };
      if (isAutoMapsLink(building.maps_url)) patch.maps_url = mapsLink(reading.lat, reading.lng);
      await updateRow('buildings', building.id, patch);
    } catch (err) { console.error(err); }
  }

  const handleSave = async (e) => {
    e.preventDefault();
    setError('');

    const fields = {
      visited_on: get('visited_on'),
      status_id: get('status_id') || null,
      notes: get('notes').trim() || null,
    };
    if (!fields.visited_on) return setError('اختر تاريخ الزيارة');

    setSaving(true);
    try {
      if (editing) {
        await updateRow('visits', visitId, diffPatch(original, fields));
      } else {
        const now = new Date().toISOString();
        await createRow('visits', {
          id: newId(), church_id: user?.church_id ?? null, family_id: familyId, ...fields, created_at: now, updated_at: now,
        });
        await saveBuildingPosition(); // never blocks or fails the visit
      }
      runSync();
      navigate(back, { replace: true, state: backState });
    } catch (err) {
      console.error(err);
      setError('تعذّر الحفظ على الجهاز. حاول مرة أخرى.');
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('حذف هذه الزيارة؟')) return;
    await deleteRow('visits', visitId);
    runSync();
    navigate(back, { replace: true, state: backState });
  };

  return (
    <div className="pb-20">
      <PageHeader title={editing ? 'تعديل زيارة' : 'تسجيل زيارة'} subtitle={family.family_name} back={back} backState={backState} />

      <form className="p-4 space-y-4" onSubmit={handleSave} noValidate>
        <Field label="تاريخ الزيارة *">
          <input type="date" value={get('visited_on')} onChange={set('visited_on')} className={inputClass} />
        </Field>

        {statuses.length > 0 && (
          <Field label="حالة الزيارة">
            <select value={get('status_id')} onChange={set('status_id')} className={inputClass}>
              <option value="">—</option>
              {statuses.map((s) => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
          </Field>
        )}

        <Field label="ملاحظات">
          <textarea rows={4} value={get('notes')} onChange={set('notes')} className={inputClass} />
        </Field>

        {/* the position is found silently in the background; a note shows only when it can't work (nothing to wait for) */}
        {!editing && onSite && building && (info.phase === 'denied' || info.phase === 'unavailable') && (
          <p role="status" className="flex items-start gap-2 rounded-xl bg-gray-50 p-3 text-sm text-gray-600">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
            <span>
              {info.phase === 'denied'
                ? 'الموقع غير مفعّل في المتصفح، فلن يُسجَّل موقع العمارة. الزيارة ستُحفظ عادي.'
                : 'تعذّر تحديد الموقع الآن. الزيارة ستُحفظ عادي.'}
            </span>
          </p>
        )}

        <ErrorText>{error}</ErrorText>

        <button
          type="submit"
          disabled={saving}
          className="w-full bg-maroon text-white text-lg font-bold p-4 rounded-xl flex items-center justify-center gap-2 disabled:opacity-60"
        >
          <Save className="w-6 h-6" /> حفظ
        </button>

        {editing && (
          <button type="button" onClick={handleDelete} className="w-full text-red-600 font-bold p-3 flex items-center justify-center gap-2">
            <Trash2 className="w-5 h-5" /> حذف الزيارة
          </button>
        )}
      </form>
    </div>
  );
}
