import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Save, Trash2 } from 'lucide-react';
import { useAuth } from '../auth.jsx';
import { createRow, updateRow, deleteRow } from '../db';
import { useTables, newId, inputClass, diffPatch, lookupsFor, LOOKUP, today } from '../data.js';
import { PageHeader, Field, ErrorText, Loading, NotFound } from '../components/ui.jsx';

// Record a visit (/family/:familyId/visit/add)  or  edit one (/visit/:visitId/edit)
export default function VisitForm() {
  const { familyId: familyParam, visitId } = useParams();
  const navigate = useNavigate();
  const { user, runSync } = useAuth();
  const { data, loading } = useTables(['families', 'visits', 'lookup_values']);

  const editing = Boolean(visitId);
  const original = data.visits.find((v) => v.id === visitId);
  const familyId = editing ? original?.family_id : familyParam;
  const family = data.families.find((f) => f.id === familyId);
  const statuses = lookupsFor(data.lookup_values, LOOKUP.visitStatus);

  const [edits, setEdits] = useState({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const defaults = { visited_on: today() };
  const get = (key) => (key in edits ? edits[key] : original?.[key] ?? defaults[key] ?? '');
  const set = (key) => (e) => setEdits((prev) => ({ ...prev, [key]: e.target.value }));

  if (loading) return <Loading />;
  if (!family || (editing && !original)) return <NotFound back="/" />;

  const back = `/family/${familyId}`;

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
      }
      runSync();
      navigate(back, { replace: true });
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
    navigate(back, { replace: true });
  };

  return (
    <div className="pb-20">
      <PageHeader title={editing ? 'تعديل زيارة' : 'تسجيل زيارة'} subtitle={family.family_name} back={back} />

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
