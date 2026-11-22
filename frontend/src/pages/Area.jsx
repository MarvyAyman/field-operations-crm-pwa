import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Pencil, Trash2 } from 'lucide-react';
import { useAuth } from '../auth.jsx';
import BottomSheet from '../components/BottomSheet.jsx';
import { updateRow, deleteRow } from '../db';
import { useTables, areaLabel, searchKey } from '../data.js';
import { PageHeader, ListLink, Loading, NotFound } from '../components/ui.jsx';

const ar = (n) => Number(n).toLocaleString('ar-EG', { useGrouping: false });

// Bottom sheet for one street: the name field opens with the keyboard; save, or delete (only an empty street)
function StreetSheet({ street, siblings, onDone }) {
  const [name, setName] = useState(street.name || '');
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const inputRef = useRef(null);
  const { runSync } = useAuth();
  useEffect(() => { const t = setTimeout(() => inputRef.current?.focus(), 260); return () => clearTimeout(t); }, []);

  const save = async (close) => {
    const clean = name.trim().replace(/\s+/g, ' ');
    if (!clean) { setError('اكتب اسم الشارع'); return; }
    if (siblings.some((x) => x.id !== street.id && searchKey(x.name) === searchKey(clean))) { setError('يوجد شارع بنفس الاسم في هذه المنطقة'); return; }
    if (clean !== street.name) { await updateRow('streets', street.id, { name: clean }); runSync(); }
    close();
  };
  const remove = async (close) => { await deleteRow('streets', street.id); runSync(); close(); };

  return (
    <BottomSheet title={confirming ? `حذف شارع ${street.name}؟` : 'تعديل الشارع'} onClose={onDone}>
      {(close) => confirming ? (
        <div className="space-y-2 pb-1">
          <p className="text-center text-sm text-gray-500">لا يمكن التراجع عن الحذف.</p>
          <button type="button" onClick={() => remove(close)} className="w-full rounded-xl bg-red-600 p-4 font-bold text-white">حذف الشارع</button>
          <button type="button" onClick={() => setConfirming(false)} className="w-full rounded-xl bg-gray-100 p-4 font-bold text-navy">رجوع</button>
        </div>
      ) : (
        <form className="space-y-3 pb-1 text-right" onSubmit={(e) => { e.preventDefault(); save(close); }}>
          <label className="block">
            <span className="block text-sm text-gray-500 mb-1">اسم الشارع</span>
            <input
              ref={inputRef}
              type="text"
              value={name}
              onChange={(e) => { setName(e.target.value); setError(''); }}
              enterKeyHint="done"
              className="w-full rounded-xl border-2 border-gray-200 p-4 text-lg font-bold text-navy focus:border-maroon outline-none"
            />
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button type="submit" className="w-full rounded-xl bg-maroon p-4 font-bold text-white">حفظ</button>
          {street.buildingCount > 0 ? (
            <p className="rounded-xl bg-gray-50 p-3 text-center text-sm text-gray-500">
              لا يمكن حذف الشارع لأن فيه {ar(street.buildingCount)} مبنى. انقلي المباني أو احذفيها أولًا.
            </p>
          ) : (
            <button type="button" onClick={() => setConfirming(true)} className="flex w-full items-center justify-center gap-2 rounded-xl p-3 font-bold text-red-600">
              <Trash2 className="w-5 h-5" /> حذف الشارع
            </button>
          )}
        </form>
      )}
    </BottomSheet>
  );
}

// Streets of one region
export default function Area() {
  const { areaId } = useParams();
  const { data, loading } = useTables(['areas', 'streets', 'buildings', 'families']);

  const area = data.areas.find((a) => a.id === areaId);
  // view-only by default; the pencil switches street editing on (leaving the page switches it off)
  const [editMode, setEditMode] = useState(false);
  const [editing, setEditing] = useState(null);

  const streets = useMemo(() => {
    const buildingStreet = new Map(data.buildings.map((b) => [b.id, b.street_id]));
    const buildingsPer = new Map();
    const familiesPer = new Map();
    for (const b of data.buildings) buildingsPer.set(b.street_id, (buildingsPer.get(b.street_id) || 0) + 1);
    for (const f of data.families) {
      const sid = buildingStreet.get(f.building_id);
      if (sid) familiesPer.set(sid, (familiesPer.get(sid) || 0) + 1);
    }
    return data.streets
      .filter((s) => s.area_id === areaId && !s.deleted_at)
      .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ar', { numeric: true }))
      .map((s) => ({ ...s, buildingCount: buildingsPer.get(s.id) || 0, familyCount: familiesPer.get(s.id) || 0 }));
  }, [data, areaId]);

  if (loading) return <Loading />;
  if (!area) return <NotFound back="/" />;

  return (
    <div className="pb-32">
      <PageHeader title={areaLabel(area)} subtitle={`${streets.length} شارع`} back="/" />
      <div className="p-4 space-y-3">
        {streets.length > 0 && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">{editMode ? 'اضغطي على الشارع لتعديل اسمه أو حذفه' : ''}</p>
            <button
              type="button"
              role="switch"
              aria-checked={editMode}
              aria-label="وضع التعديل"
              onClick={() => setEditMode((v) => !v)}
              className={`flex items-center gap-2 rounded-xl p-3 font-bold shadow-sm ${editMode ? 'bg-gold text-navy' : 'bg-white text-navy'}`}
            >
              <Pencil className="w-5 h-5" />
              {editMode && <span className="text-sm">تعديل</span>}
            </button>
          </div>
        )}
        {streets.length === 0 && <p className="text-center text-gray-500">{area.kind === 'other_church' ? 'لا توجد شوارع مسجلة لهذه الكنيسة' : 'لا توجد شوارع في هذه المنطقة'}</p>}
        {streets.map((s) => editMode ? (
          <button
            key={s.id}
            type="button"
            onClick={() => setEditing(s)}
            className="flex w-full items-center gap-3 rounded-xl border-2 border-gold bg-white p-4 text-right text-navy shadow-sm"
          >
            <span className="min-w-0 flex-1">
              <span className="block font-bold text-lg">{s.name}</span>
              <span className="block text-sm text-gray-500">{s.buildingCount} مبنى · {s.familyCount} أسرة</span>
            </span>
            <Pencil className="w-5 h-5 shrink-0 text-maroon" />
          </button>
        ) : (
          <ListLink key={s.id} to={`/street/${s.id}`}>
            <span className="font-bold text-lg">{s.name}</span>
            <span className="text-sm text-gray-500">
              {s.buildingCount} مبنى · {s.familyCount} أسرة
            </span>
          </ListLink>
        ))}
      </div>
      {editing && <StreetSheet street={editing} siblings={streets} onDone={() => setEditing(null)} />}
    </div>
  );
}
