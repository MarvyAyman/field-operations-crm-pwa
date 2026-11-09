import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Plus, MapPin, Navigation, Loader2, X } from 'lucide-react';
import { useTables, buildingLabel } from '../data.js';
import { PageHeader, ListLink, Loading, NotFound, PendingBadge, AddFamilyFab } from '../components/ui.jsx';
import { useLocationCapture } from '../useLocationCapture.js';
import { hasLocation, mapsLink } from '../location.js';

const STATUS_STYLE = {
  working: 'bg-gray-100 text-gray-700',
  success: 'bg-green-50 text-green-800',
  warning: 'bg-amber-50 text-amber-800',
  error: 'bg-red-50 text-red-700',
};

// One building: the link to its page + the "add location" pin beside it + the result message
function BuildingRow({ b }) {
  const { status, busy, capture, dismiss } = useLocationCapture(b);
  const located = hasLocation(b);

  return (
    <div>
      <div className="flex items-stretch gap-2">
        <div className="flex-1 min-w-0">
          <ListLink to={`/building/${b.id}`}>
            <span className="font-bold text-lg">
              {buildingLabel(b)}
              <PendingBadge row={b} />
            </span>
            <span className="text-sm text-gray-500">{b.familyCount} أسرة</span>
          </ListLink>
        </div>

        {located && (
          <a
            href={mapsLink(b.lat, b.lng)}
            target="_blank"
            rel="noopener noreferrer"
            title="فتح الموقع في الخرائط (يحتاج إنترنت)"
            aria-label="فتح موقع المبنى في الخرائط"
            className="w-12 rounded-xl bg-white shadow-sm flex items-center justify-center text-navy"
          >
            <Navigation className="w-5 h-5" />
          </a>
        )}

        <button
          type="button"
          onClick={capture}
          disabled={busy}
          title={located ? 'تحديث موقع المبنى' : 'إضافة موقع المبنى'}
          aria-label={located ? 'تحديث موقع المبنى' : 'إضافة موقع المبنى'}
          className={`w-14 rounded-xl border-2 bg-white shadow-sm flex items-center justify-center disabled:opacity-60 ${
            located ? 'border-green-600/40 text-green-700' : 'border-transparent text-maroon'
          }`}
        >
          {busy ? <Loader2 className="w-6 h-6 animate-spin" /> : <MapPin className="w-6 h-6" fill={located ? 'currentColor' : 'none'} />}
        </button>
      </div>

      {status && (
        <p role="status" className={`mt-1 p-3 rounded-lg text-sm flex items-start justify-between gap-2 ${STATUS_STYLE[status.kind]}`}>
          <span>{status.text}</span>
          {status.kind !== 'working' && (
            <button type="button" onClick={dismiss} aria-label="إغلاق الرسالة" className="shrink-0 p-0.5">
              <X className="w-4 h-4" />
            </button>
          )}
        </p>
      )}
    </div>
  );
}

// Buildings of one street
export default function Street() {
  const { streetId } = useParams();
  const { data, loading } = useTables(['streets', 'buildings', 'families']);

  const street = data.streets.find((s) => s.id === streetId);

  const buildings = useMemo(() => {
    const per = new Map();
    for (const f of data.families) per.set(f.building_id, (per.get(f.building_id) || 0) + 1);
    return data.buildings
      .filter((b) => b.street_id === streetId)
      .sort((a, b) => String(a.house_no ?? '').localeCompare(String(b.house_no ?? ''), 'ar', { numeric: true }))
      .map((b) => ({ ...b, familyCount: per.get(b.id) || 0 }));
  }, [data, streetId]);

  if (loading) return <Loading />;
  if (!street) return <NotFound back="/" />;

  return (
    <div className="pb-28">
      <PageHeader title={street.name} subtitle={`${buildings.length} مبنى`} back={`/area/${street.area_id}`} />
      <div className="p-4 space-y-3">
        <Link
          to={`/building/add?street=${streetId}`}
          className="w-full bg-maroon text-white font-bold p-4 rounded-xl flex items-center justify-center gap-2"
        >
          <Plus className="w-5 h-5" /> إضافة مبنى
        </Link>

        {buildings.length === 0 && <p className="text-center text-gray-500 pt-4">لا توجد مبانٍ في هذا الشارع</p>}
        {buildings.map((b) => (
          <BuildingRow key={b.id} b={b} />
        ))}
      </div>
      <AddFamilyFab to={`/family/add?street=${streetId}`} />
    </div>
  );
}
