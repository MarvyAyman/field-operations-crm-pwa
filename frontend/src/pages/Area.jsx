import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useTables } from '../data.js';
import { PageHeader, ListLink, Loading, NotFound, AddFamilyFab } from '../components/ui.jsx';

// Streets of one region
export default function Area() {
  const { areaId } = useParams();
  const { data, loading } = useTables(['areas', 'streets', 'buildings', 'families']);

  const area = data.areas.find((a) => a.id === areaId);

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
      .filter((s) => s.area_id === areaId)
      .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ar', { numeric: true }))
      .map((s) => ({ ...s, buildingCount: buildingsPer.get(s.id) || 0, familyCount: familiesPer.get(s.id) || 0 }));
  }, [data, areaId]);

  if (loading) return <Loading />;
  if (!area) return <NotFound back="/" />;

  return (
    <div className="pb-28">
      <PageHeader title={`منطقة ${area.area_no}`} subtitle={`${streets.length} شارع`} back="/" />
      <div className="p-4 space-y-3">
        {streets.length === 0 && <p className="text-center text-gray-500">لا توجد شوارع في هذه المنطقة</p>}
        {streets.map((s) => (
          <ListLink key={s.id} to={`/street/${s.id}`}>
            <span className="font-bold text-lg">{s.name}</span>
            <span className="text-sm text-gray-500">
              {s.buildingCount} مبنى · {s.familyCount} أسرة
            </span>
          </ListLink>
        ))}
      </div>
      <AddFamilyFab to={`/family/add?area=${areaId}`} />
    </div>
  );
}
