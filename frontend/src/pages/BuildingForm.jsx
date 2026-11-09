import { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Save } from 'lucide-react';
import { useAuth } from '../auth.jsx';
import { createRow, updateRow } from '../db';
import { useTables, newId, inputClass, diffPatch } from '../data.js';
import { PageHeader, Field, ErrorText, Loading, NotFound } from '../components/ui.jsx';

// Add a building (/building/add?street=ID)  or  edit one (/building/:buildingId/edit)
export default function BuildingForm() {
  const { buildingId } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { user, runSync } = useAuth();
  const { data, loading } = useTables(['streets', 'buildings']);

  const editing = Boolean(buildingId);
  const original = data.buildings.find((b) => b.id === buildingId);
  const streetId = editing ? original?.street_id : params.get('street');
  const street = data.streets.find((s) => s.id === streetId);

  const [edits, setEdits] = useState({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const get = (key) => (key in edits ? edits[key] : original?.[key] ?? '');
  const set = (key) => (e) => setEdits((prev) => ({ ...prev, [key]: e.target.value }));

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

    setSaving(true);
    try {
      let id = buildingId;
      if (editing) {
        await updateRow('buildings', buildingId, diffPatch(original, fields));
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
