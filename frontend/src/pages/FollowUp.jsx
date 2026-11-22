import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Check, Users, X } from 'lucide-react';
import BottomSheet from '../components/BottomSheet.jsx';
import { useAuth } from '../auth.jsx';
import { useTables } from '../data.js';

const WEEK = ['السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة']; // the week starts on Saturday
const pad = (n) => String(n).padStart(2, '0');
const iso = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
const ar = (n) => Number(n).toLocaleString('ar-EG', { useGrouping: false });
const monthName = (y, m) => new Date(y, m, 1).toLocaleDateString('ar-EG', { month: 'long', year: 'numeric' });
const dayTitle = (y, m, d) => new Date(y, m, d, 12).toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long' });

// the period as [from, to] dates + the card label; the week starts on Saturday
function periodRange(kind, now) {
  if (kind === 'week') {
    const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 1) % 7));
    const to = new Date(from.getFullYear(), from.getMonth(), from.getDate() + 6);
    return { from: iso(from.getFullYear(), from.getMonth(), from.getDate()), to: iso(to.getFullYear(), to.getMonth(), to.getDate()), label: 'زيارات هذا الأسبوع' };
  }
  if (kind === 'year') return { from: `${now.getFullYear()}-01-01`, to: `${now.getFullYear()}-12-31`, label: `زيارات ${ar(now.getFullYear())}` };
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return { from: iso(now.getFullYear(), now.getMonth(), 1), to: iso(now.getFullYear(), now.getMonth(), last), label: `زيارات ${now.toLocaleDateString('ar-EG', { month: 'long' })}` };
}
// a free "from … to" range (either end can stay empty)
function customRange(from, to) {
  const [a, b] = from && to && from > to ? [to, from] : [from, to];
  const fmt = (d) => new Date(...d.split('-').map((n, i) => (i === 1 ? n - 1 : +n)), 12).toLocaleDateString('ar-EG', { day: 'numeric', month: 'long', year: 'numeric' });
  const label = a && b ? `زيارات من ${fmt(a)} إلى ${fmt(b)}` : a ? `زيارات من ${fmt(a)}` : `زيارات حتى ${fmt(b)}`;
  return { from: a || '0000-01-01', to: b || '9999-12-31', label };
}
const TABS = [['week', 'هذا الأسبوع'], ['month', 'هذا الشهر'], ['year', 'هذا العام']];

// "Visit tracking": a month calendar of the visits registered by the logged-in member
export default function FollowUp() {
  const { user, syncing, syncError } = useAuth();
  const { data } = useTables(['visits', 'families', 'buildings', 'streets', 'lookup_values']);
  const now = new Date();
  const todayIso = iso(now.getFullYear(), now.getMonth(), now.getDate());
  const [cursor, setCursor] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const [picked, setPicked] = useState(null); // 'YYYY-MM-DD'
  const [kind, setKind] = useState('month');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const custom = !!(from || to);
  const range = custom ? customRange(from, to) : periodRange(kind, now);

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

  // my visits in the chosen period: distinct families + total visits
  const totals = useMemo(() => {
    const fams = new Set();
    let visits = 0;
    for (const [day, list] of byDay) {
      if (day < range.from || day > range.to) continue;
      visits += list.length;
      list.forEach((v) => fams.add(v.family_id));
    }
    return { families: fams.size, visits };
  }, [byDay, range.from, range.to]);

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
        <div role="tablist" className="flex rounded-2xl bg-gray-200/60 p-1 text-sm">
          {TABS.map(([k, l]) => (
            <button key={k} type="button" role="tab" aria-selected={!custom && kind === k} onClick={() => { setKind(k); setFrom(''); setTo(''); }} className={`flex-1 rounded-xl px-3 py-2 font-bold ${!custom && kind === k ? 'bg-maroon text-white' : 'text-gray-500'}`}>{l}</button>
          ))}
        </div>

        <div className="flex items-center gap-2 text-sm">
          <label className="flex flex-1 items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2">
            <span className="text-gray-500">من</span>
            <input type="date" aria-label="من تاريخ" value={from} onChange={(e) => setFrom(e.target.value)} className="min-w-0 flex-1 bg-transparent font-bold text-navy" />
          </label>
          <label className="flex flex-1 items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2">
            <span className="text-gray-500">إلى</span>
            <input type="date" aria-label="إلى تاريخ" value={to} onChange={(e) => setTo(e.target.value)} className="min-w-0 flex-1 bg-transparent font-bold text-navy" />
          </label>
          {custom && (
            <button type="button" onClick={() => { setFrom(''); setTo(''); }} aria-label="مسح المدة" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white border border-gray-200 text-gray-500"><X className="w-5 h-5" /></button>
          )}
        </div>

        <div className="rounded-2xl border border-gold bg-maroon p-4 text-white shadow-md">
          <p className="text-white/80 text-sm">{range.label}</p>
          <div className="mt-1 flex items-end justify-between gap-3">
            <p className="flex items-baseline gap-2"><span data-visited className="text-4xl font-bold">{ar(totals.families)}</span><span className="text-sm text-white/80">أسرة تمت زيارتها</span></p>
            <p data-visits className="text-sm text-white/80">إجمالي الزيارات: <span className="font-bold text-white">{ar(totals.visits)}</span></p>
          </div>
        </div>

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
