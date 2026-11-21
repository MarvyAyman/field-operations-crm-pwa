import { useMemo, useState } from 'react';
import { Home, Users, UserRound, ChevronDown } from 'lucide-react';
import { useAuth } from '../auth.jsx';
import { useTables, areaLabel } from '../data.js';

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const ar = (n) => Number(n).toLocaleString('ar-EG', { useGrouping: false });
const hasConfessor = (p) => !!(p.confessor_id || p.extra?.confessor_other || (p.extra?.confessor_more || []).length);

// the period as [from, to] dates (YYYY-MM-DD) + the card label; the week starts on Saturday
function periodRange(kind, now) {
  if (kind === 'week') {
    const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 1) % 7));
    const to = new Date(from.getFullYear(), from.getMonth(), from.getDate() + 6);
    return { from: iso(from), to: iso(to), label: 'زيارات هذا الأسبوع' };
  }
  if (kind === 'year') return { from: `${now.getFullYear()}-01-01`, to: `${now.getFullYear()}-12-31`, label: `زيارات ${ar(now.getFullYear())}` };
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { from: iso(from), to: iso(to), label: `زيارات ${now.toLocaleDateString('ar-EG', { month: 'long' })}` };
}

function Stat({ icon: Icon, label, value, unit, wide }) {
  return (
    <div className={`${wide ? 'col-span-2 bg-gold/15' : 'bg-white'} rounded-2xl border border-gold/40 p-4 shadow-sm`}>
      <div className="flex items-start justify-between gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gold/20 text-maroon"><Icon className="w-5 h-5" /></span>
        <span className="text-gray-600 text-sm text-right">{label}</span>
      </div>
      <p className="mt-5 flex items-baseline gap-2 font-bold text-maroon">
        <span className="text-3xl">{ar(value)}</span>
        <span className="text-sm text-gray-500">{unit}</span>
      </p>
    </div>
  );
}

// Statistics: my visited families (by period) + general numbers of families / confessors (filter by area)
export default function Dashboard() {
  const { user } = useAuth();
  const { data } = useTables(['areas', 'streets', 'buildings', 'families', 'people', 'visits']);
  const [kind, setKind] = useState('month');
  const [areaId, setAreaId] = useState('');
  const now = new Date();
  const range = periodRange(kind, now);

  // families I visited in the period (a visit not synced yet was made on this phone, so it is mine too)
  const visited = useMemo(() => {
    const set = new Set();
    for (const v of data.visits) {
      if (v.deleted_at || !v.visited_on || v.visited_on < range.from || v.visited_on > range.to) continue;
      if (v.created_by ? v.created_by === user?.id : v._pending) set.add(v.family_id);
    }
    return set.size;
  }, [data.visits, user?.id, range.from, range.to]);

  const ownAreas = useMemo(
    () => data.areas.filter((a) => a.kind !== 'other_church' && !a.deleted_at)
      .sort((a, b) => String(a.area_no || '').localeCompare(String(b.area_no || ''), 'ar', { numeric: true })),
    [data.areas],
  );

  const stats = useMemo(() => {
    const streetArea = new Map(data.streets.map((s) => [s.id, s.area_id]));
    const buildingArea = new Map(data.buildings.map((b) => [b.id, streetArea.get(b.street_id)]));
    const families = data.families.filter((f) => !f.deleted_at && !f.moved && (!areaId || buildingArea.get(f.building_id) === areaId));
    const ids = new Set(families.map((f) => f.id));
    const withConf = new Set();
    let peopleWithConf = 0;
    for (const p of data.people) {
      if (p.deleted_at || !ids.has(p.family_id) || !hasConfessor(p)) continue;
      peopleWithConf += 1;
      withConf.add(p.family_id);
    }
    return { families: families.length, familiesConf: withConf.size, peopleConf: peopleWithConf };
  }, [data.streets, data.buildings, data.families, data.people, areaId]);

  const tabs = [['week', 'هذا الأسبوع'], ['month', 'هذا الشهر'], ['year', 'هذا العام']];

  return (
    <div className="pb-32">
      <header className="bg-navy text-white p-4 pb-5 rounded-b-2xl shadow-md border-b-4 border-gold">
        <p className="text-sm text-white/80 text-right">ملخص الخدمة</p>
        <h1 className="mt-6 text-3xl font-bold">الإحصائيات</h1>
        <p className="mt-3 text-sm text-white/80">نظرة عامة على الأسر والزيارات</p>
      </header>

      <main className="p-4 space-y-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-navy">الأسر التي تمت زيارتها</h2>
          <div role="tablist" className="flex rounded-2xl bg-gray-200/60 p-1 text-sm">
            {tabs.map(([k, l]) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={kind === k}
                onClick={() => setKind(k)}
                className={`rounded-xl px-3 py-2 font-bold ${kind === k ? 'bg-maroon text-white' : 'text-gray-500'}`}
              >
                {l}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-gold bg-maroon p-5 text-white shadow-md">
          <p className="text-white/80 text-sm">{range.label}</p>
          <p className="mt-1">أسر تمت زيارتها</p>
          <p className="mt-3 flex items-baseline gap-2 text-white"><span data-visited className="text-4xl font-bold">{ar(visited)}</span><span className="text-sm text-white/80">أسرة</span></p>
        </div>

        <hr className="border-gray-200" />

        <h2 className="text-lg font-bold text-navy">بيانات الأسر وأب الاعتراف</h2>
        <label className="block">
          <span className="block text-gray-500 text-sm mb-2">تصفية حسب المنطقة</span>
          <span className="relative block">
            <select
              value={areaId}
              onChange={(e) => setAreaId(e.target.value)}
              className="w-full appearance-none rounded-2xl border border-gray-200 bg-white p-4 pl-10 font-bold text-navy"
            >
              <option value="">كل المناطق</option>
              {ownAreas.map((a) => <option key={a.id} value={a.id}>{areaLabel(a)}</option>)}
            </select>
            <ChevronDown className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
          </span>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <Stat icon={Home} label="إجمالي عدد الأسر" value={stats.families} unit="أسرة" />
          <Stat icon={Users} label="أسر لها أب اعتراف" value={stats.familiesConf} unit="أسرة" />
          <Stat wide icon={UserRound} label="أفراد لهم أب اعتراف" value={stats.peopleConf} unit="فرد" />
        </div>
      </main>
    </div>
  );
}
