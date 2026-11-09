import { useMemo } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Pencil, MapPin } from 'lucide-react';
import { useAuth } from '../auth.jsx';
import { deleteRow } from '../db';
import { useTables, buildingLabel, lastVisitByFamily } from '../data.js';
import { PageHeader, ListLink, Loading, NotFound, PendingBadge, AddFamilyFab } from '../components/ui.jsx';

// Families living in one building
export default function Building() {
  const { buildingId } = useParams();
  const navigate = useNavigate();
  const { runSync } = useAuth();
  const { data, loading } = useTables(['streets', 'buildings', 'families', 'visits']);

  const building = data.buildings.find((b) => b.id === buildingId);
  const street = data.streets.find((s) => s.id === building?.street_id);

  const families = useMemo(() => {
    const lastVisit = lastVisitByFamily(data.visits);
    return data.families
      .filter((f) => f.building_id === buildingId)
      .sort((a, b) =>
        `${a.floor_no ?? ''}-${a.apartment_no ?? ''}`.localeCompare(`${b.floor_no ?? ''}-${b.apartment_no ?? ''}`, 'ar', { numeric: true })
      )
      .map((f) => ({ ...f, lastVisit: lastVisit.get(f.id) || f.last_visit_on || null }));
  }, [data, buildingId]);

  if (loading) return <Loading />;
  if (!building) return <NotFound back="/" />;

  const handleDelete = async () => {
    if (families.length > 0) {
      window.alert('لا يمكن حذف مبنى به أسر. انقل الأسر أو احذفها أولاً.');
      return;
    }
    if (!window.confirm('حذف هذا المبنى؟')) return;
    await deleteRow('buildings', buildingId);
    runSync();
    navigate(street ? `/street/${street.id}` : '/', { replace: true });
  };

  return (
    <div className="pb-28">
      <PageHeader
        title={buildingLabel(building)}
        subtitle={street?.name}
        back={street ? `/street/${street.id}` : '/'}
      />

      <div className="p-4 space-y-3">
        {building.notes && <p className="p-3 rounded-lg bg-white text-gray-700 shadow-sm">{building.notes}</p>}

        <div className="flex gap-2">
          <Link
            to={`/building/${buildingId}/edit`}
            className="flex-1 bg-white text-navy font-bold p-4 rounded-xl flex items-center justify-center gap-2 shadow-sm"
            aria-label="تعديل المبنى"
          >
            <Pencil className="w-5 h-5" /> تعديل المبنى
          </Link>
          {building.maps_url && (
            <a
              href={building.maps_url}
              target="_blank"
              rel="noreferrer"
              className="bg-white text-navy font-bold p-4 rounded-xl flex items-center justify-center shadow-sm"
              aria-label="الخريطة"
            >
              <MapPin className="w-5 h-5" />
            </a>
          )}
        </div>

        {families.length === 0 && <p className="text-center text-gray-500 pt-4">لا توجد أسر في هذا المبنى</p>}
        {families.map((f) => (
          <ListLink key={f.id} to={`/family/${f.id}`}>
            <span>
              <span className="font-bold text-lg block">
                {f.family_name}
                <PendingBadge row={f} />
              </span>
              <span className="text-sm text-gray-500">
                {[f.floor_no && `الدور ${f.floor_no}`, f.apartment_no && `شقة ${f.apartment_no}`].filter(Boolean).join(' · ')}
              </span>
            </span>
            <span className={`text-sm font-bold ${f.lastVisit ? 'text-green-700' : 'text-red-600'}`}>
              {f.lastVisit ? `آخر زيارة ${f.lastVisit}` : 'لم تتم زيارتها'}
            </span>
          </ListLink>
        ))}

        <button type="button" onClick={handleDelete} className="w-full text-red-600 underline pt-6">
          حذف المبنى
        </button>
      </div>
      <AddFamilyFab to={`/family/add?building=${buildingId}`} />
    </div>
  );
}
