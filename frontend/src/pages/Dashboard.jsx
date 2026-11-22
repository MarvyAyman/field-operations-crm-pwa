import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Home, Users, UserRound, ChevronDown, ChevronRight } from 'lucide-react';
import { useTables, areaLabel } from '../data.js';

const ar = (n) => Number(n).toLocaleString('ar-EG', { useGrouping: false });
const hasConfessor = (p) => !!(p.confessor_id || p.extra?.confessor_other || (p.extra?.confessor_more || []).length);

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

// Statistics: general numbers of families / confessors (filter by area)
export default function Dashboard() {
  const { data } = useTables(['areas', 'streets', 'buildings', 'families', 'people']);
  const [areaId, setAreaId] = useState('');

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

  return (
    <div className="pb-32">
      <header className="bg-navy text-white p-4 pb-5 rounded-b-2xl shadow-md border-b-4 border-gold">
        <div className="flex items-center justify-between text-sm text-white/80">
          <Link to="/" className="flex items-center gap-1 rounded-full bg-white/10 py-1.5 pl-3 pr-2"><ChevronRight className="w-4 h-4" /> رجوع</Link>
          <span>ملخص الخدمة</span>
        </div>
        <h1 className="mt-6 text-3xl font-bold">الإحصائيات</h1>
        <p className="mt-3 text-sm text-white/80">نظرة عامة على الأسر وأب الاعتراف</p>
      </header>

      <main className="p-4 space-y-5">
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
