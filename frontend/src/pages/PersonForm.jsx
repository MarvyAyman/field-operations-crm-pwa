import { useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Save, Trash2, UserPlus, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../auth.jsx';
import { createRow, updateRow, deleteRow } from '../db';
import { useTables, newId, diffPatch, nextPersonNo, personFieldsFromForm, personFormDefault } from '../data.js';
import { PageHeader, ErrorText, Loading, NotFound } from '../components/ui.jsx';
import PersonFields from '../components/PersonFields.jsx';

// Add a person to a family (/family/:familyId/person/add)  or  edit one (/person/:personId/edit)
export default function PersonForm() {
  const { familyId: familyParam, personId } = useParams();
  const navigate = useNavigate();
  const { user, runSync } = useAuth();
  const { data, loading } = useTables(['families', 'people', 'lookup_values']);

  const editing = Boolean(personId);
  const original = data.people.find((p) => p.id === personId);
  const familyId = editing ? original?.family_id : familyParam;
  const family = data.families.find((f) => f.id === familyId);

  const [edits, setEdits] = useState({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const nameRef = useRef(null);

  const get = (key) => (key in edits ? edits[key] : personFormDefault(original, key));
  const set = (key) => (e) => setEdits((prev) => ({ ...prev, [key]: e.target.value }));

  const members = data.people.filter((p) => p.family_id === familyId);

  if (loading) return <Loading />;
  if (!family || (editing && !original)) return <NotFound back="/" />;

  const back = `/family/${familyId}`;

  // after = 'close' -> back to the family | 'more' -> keep the form open for the next person
  const save = async (after) => {
    setError('');
    setNotice('');

    const fields = { full_name: get('full_name').trim(), ...personFieldsFromForm(get, original?.extra) };

    // "save and close" with an empty form just closes (nothing to save)
    if (!fields.full_name && after === 'close' && !editing && Object.keys(edits).every((k) => !String(edits[k] ?? '').trim())) {
      navigate(back, { replace: true });
      return;
    }
    if (!fields.full_name) return setError('اكتب اسم الفرد');

    setSaving(true);
    try {
      if (editing) {
        await updateRow('people', personId, diffPatch(original, fields));
      } else {
        const now = new Date().toISOString();
        await createRow('people', {
          id: newId(), church_id: user?.church_id ?? null, family_id: familyId, person_no: nextPersonNo(data.people, familyId), ...fields, created_at: now, updated_at: now,
        });
      }
      runSync();
      if (after === 'more') {
        // stored -> empty form for the next person (same family, nothing else to choose)
        setEdits({});
        setNotice(`تم حفظ «${fields.full_name}». أضف الفرد التالي.`);
        setSaving(false);
        nameRef.current?.focus();
        return;
      }
      navigate(back, { replace: true });
    } catch (err) {
      console.error(err);
      setError('تعذّر الحفظ على الجهاز. حاول مرة أخرى.');
      setSaving(false);
    }
  };

  const handleSave = (e) => { e.preventDefault(); save('close'); };

  const handleDelete = async () => {
    if (!window.confirm(`حذف ${original.full_name}؟`)) return;
    await deleteRow('people', personId);
    runSync();
    navigate(back, { replace: true });
  };

  return (
    <div className="pb-20">
      <PageHeader title={editing ? 'تعديل فرد' : 'إضافة فرد'} subtitle={family.family_name} back={back} />

      <form className="p-4 space-y-4" onSubmit={handleSave} noValidate>
        {!editing && members.length > 0 && (
          <div className="rounded-xl bg-white shadow-sm p-3">
            <p className="text-sm text-gray-500 mb-2">أفراد الأسرة المضافون ({members.length})</p>
            <div className="flex flex-wrap gap-2">
              {members.map((m) => (
                <span key={m.id} className="bg-navy/10 text-navy rounded-full px-3 py-1 text-sm font-bold">{m.full_name}</span>
              ))}
            </div>
          </div>
        )}

        {notice && (
          <p role="status" className="p-3 rounded-lg bg-green-50 text-green-800 text-sm font-bold flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 shrink-0" /> {notice}
          </p>
        )}

        <PersonFields get={get} set={set} lookups={data.lookup_values} showRelation nameRef={nameRef} />

        <ErrorText>{error}</ErrorText>

        {editing ? (
          <button
            type="submit"
            disabled={saving}
            className="w-full bg-maroon text-white text-lg font-bold p-4 rounded-xl flex items-center justify-center gap-2 disabled:opacity-60"
          >
            <Save className="w-6 h-6" /> حفظ
          </button>
        ) : (
          <div className="space-y-3">
            <button
              type="button"
              disabled={saving}
              onClick={() => save('more')}
              className="w-full bg-maroon text-white text-lg font-bold p-4 rounded-xl flex items-center justify-center gap-2 disabled:opacity-60"
            >
              <UserPlus className="w-6 h-6" /> حفظ وإضافة فرد آخر
            </button>
            <button
              type="submit"
              disabled={saving}
              className="w-full bg-white text-maroon border-2 border-maroon text-lg font-bold p-4 rounded-xl flex items-center justify-center gap-2 disabled:opacity-60"
            >
              <Save className="w-6 h-6" /> حفظ وإغلاق
            </button>
          </div>
        )}

        {editing && (
          <button type="button" onClick={handleDelete} className="w-full text-red-600 font-bold p-3 flex items-center justify-center gap-2">
            <Trash2 className="w-5 h-5" /> حذف الفرد
          </button>
        )}
      </form>
    </div>
  );
}
