import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Check, Users } from 'lucide-react';
import BottomSheet from '../components/BottomSheet.jsx';
import { useAuth } from '../auth.jsx';
import { useTables } from '../data.js';

const WEEK = ['السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة']; // the week starts on Saturday
const pad = (n) => String(n).padStart(2, '0');
const iso = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
const ar = (n) => Number(n).toLocaleString('ar-EG', { useGrouping: false });
const monthName = (y, m) => new Date(y, m, 1).toLocaleDateString('ar-EG', { month: 'long', year: 'numeric' });
const dayTitle = (y, m, d) => new Date(y, m, d, 12).toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long' });

// "Visit tracking": a month calendar of the visits registered by the logged-in member
export default function FollowUp() {
  const { user, syncing, syncError } = useAuth();
  const { data } = useTables(['visits', 'families', 'buildings', 'streets', 'lookup_values']);
  const now = new Date();
  const todayIso = iso(now.getFullYear(), now.getMonth(), now.getDate());
  const [cursor, setCursor] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const [picked, setPicked] = useState(null); // 'YYYY-MM-DD'

  // my visits by day (a visit not yet synced was made on this phone, so it is mine too)
  const byDay = useMemo(() => {
    const map = new Map();
    for (const v of data.visits) {
      if (v.deleted_at || !v.visited_on) continue;
      const mine = v.created_by ? v.created_by === user?.id : !!v._pending;
      if (!mine) continue;
      if (!map.has(v.visited_on)) map.set(v.visited_on, []);
      map.get(v.visited_on).push(v);
    }
    return map;
  }, [data.visits, user?.id]);

  const { y, m } = cursor;
  const offset = (new Date(y, m, 1).getDay() + 1) % 7; // Saturday = 0
  const days = new Date(y, m + 1, 0).getDate();
  const cells = [...Array(offset).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const rows = cells.length / 7;
  const move = (delta) => setCursor(({ y: cy, m: cm }) => { const d = new Date(cy, cm + delta, 1); return { y: d.getFullYear(), m: d.getMonth() }; });

  const familyById = useMemo(() => new Map(data.families.map((f) => [f.id, f])), [data.families]);
  const buildingById = useMemo(() => new Map(data.buildings.map((b) => [b.id, b])), [data.buildings]);
  const streetById = useMemo(() => new Map(data.streets.map((s) => [s.id, s])), [data.streets]);
  const lookupLabel = (id) => data.lookup_values.find((l) => l.id === id)?.label;
  const where = (f) => {
    const b = buildingById.get(f?.building_id);
    const s = streetById.get(b?.street_id);
    return [s?.name, b?.house_no && `مبنى ${b.house_no}`].filter(Boolean).join(' · ');
  };

  const pickedVisits = picked ? byDay.get(picked) || [] : [];
  const [py, pm, pd] = picked ? picked.split('-').map(Number) : [];

  return (
    <div className="flex flex-col min-h-dvh pb-28">
      <header className="bg-navy text-white p-4 pb-5 rounded-b-2xl shadow-md border-b-4 border-gold">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-2xl font-bold">تتبع الزيارات</h1>
          {/* <span className="flex items-center gap-2 rounded-full border border-white/30 px-3 py-1.5 text-xs">
            <span className={`h-2 w-2 rounded-full ${syncError ? 'bg-red-400' : syncing ? 'bg-amber-300' : 'bg-green-400'}`} />
            {syncError ? 'غير متزامن' : syncing ? 'جارٍ المزامنة' : 'متزامن'}
          </span> */}
        </div>
        <p className="mt-2 text-sm text-white/80">اختر يومًا لعرض الزيارات</p>
      </header>

      <main className="flex flex-1 flex-col p-4 gap-3">
        <div className="flex items-center justify-between">
          <button type="button" onClick={() => move(-1)} aria-label="الشهر السابق" className="flex h-10 w-10 items-center justify-center rounded-xl bg-white shadow-sm border border-gray-200">
            <ChevronRight className="w-5 h-5" />
          </button>
          <h2 className="text-xl font-bold text-navy">{monthName(y, m)}</h2>
          <button type="button" onClick={() => move(1)} aria-label="الشهر التالي" className="flex h-10 w-10 items-center justify-center rounded-xl bg-white shadow-sm border border-gray-200">
            <ChevronLeft className="w-5 h-5" />
          </button>
        </div>

        <div className="flex flex-1 flex-col rounded-2xl border border-gray-200 bg-white p-3 shadow-sm">
          <div className="grid grid-cols-7 pb-2 text-center text-[11px] text-gray-500 border-b border-gray-100">
            {WEEK.map((w) => <span key={w}>{w}</span>)}
          </div>
          <div className="grid flex-1 grid-cols-7 pt-1" style={{ gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))` }}>
            {cells.map((d, i) => {
              if (!d) return <span key={`e${i}`} />;
              const key = iso(y, m, d);
              const has = byDay.has(key);
              const selected = picked === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setPicked(key)}
                  aria-label={`${dayTitle(y, m, d)}${has ? ' — فيه زيارات' : ''}`}
                  className={`m-0.5 flex flex-col items-center justify-center gap-1 rounded-xl text-base font-bold ${
                    selected ? 'bg-maroon text-white ring-2 ring-gold' : key === todayIso ? 'text-maroon ring-1 ring-maroon/40' : 'text-navy'
                  }`}
                >
                  <span>{ar(d)}</span>
                  <span className={`flex h-4 w-4 items-center justify-center rounded-full ${has ? (selected ? 'bg-white/30' : 'bg-gold/30') : ''}`}>
                    {has && <Check data-tick className="h-2.5 w-2.5" strokeWidth={3.5} />}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs text-gray-500">
          <span className="flex items-center gap-1.5"><span className="flex h-4 w-4 items-center justify-center rounded-full bg-gold/30"><Check className="h-2.5 w-2.5" strokeWidth={3.5} /></span>يوم تمت فيه زيارة</span>
          <span className="flex items-center gap-1.5"><span className="h-4 w-4 rounded-full bg-maroon" />اليوم المحدد</span>
        </div>
      </main>

      {picked && (
        <BottomSheet
          label={`زيارات ${dayTitle(py, pm - 1, pd)}`}
          title={
            <div className="flex items-center justify-between gap-3 text-right">
              <span className="text-lg">زيارات {dayTitle(py, pm - 1, pd)}</span>
              <span className="flex items-center gap-1 rounded-full bg-maroon/10 px-3 py-1.5 text-sm text-maroon"><Users className="w-4 h-4" />{ar(new Set(pickedVisits.map((v) => v.family_id)).size)} أسر</span>
            </div>
          }
          onClose={() => setPicked(null)}
        >
          {(close) => (pickedVisits.length === 0 ? (
            <p className="py-8 text-center text-gray-500">لا توجد زيارات مسجلة في هذا اليوم</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {pickedVisits.map((v) => {
                const f = familyById.get(v.family_id);
                return (
                  <li key={v.id}>
                    <Link to={`/family/${v.family_id}`} onClick={close} className="flex items-center gap-3 py-3">
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gold/15 text-navy"><Users className="w-5 h-5" /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-bold text-navy truncate">أسرة {f?.family_name || '—'}</span>
                        <span className="block text-xs text-gray-500 truncate">{[where(f), v.notes].filter(Boolean).join(' · ') || '—'}</span>
                      </span>
                      <span className="shrink-0 text-xs text-green-700">✓ {lookupLabel(v.status_id) || 'تمت الزيارة'}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ))}
        </BottomSheet>
      )}
    </div>
  );
}
