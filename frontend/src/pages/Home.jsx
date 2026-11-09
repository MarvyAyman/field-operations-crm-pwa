import { useMemo, useState } from 'react';
import { Search, LogOut, RefreshCw, AlertTriangle } from 'lucide-react';
import { useAuth } from '../auth.jsx';
import { discardFailed } from '../db';
import { useTables, useOutboxCounts, toAsciiDigits } from '../data.js';
import { ListLink, PendingBadge, AddFamilyFab } from '../components/ui.jsx';

export default function Home() {
  const { logout, runSync, syncing, syncError } = useAuth();
  const { data, loading } = useTables(['areas', 'streets', 'buildings', 'families']);
  const counts = useOutboxCounts();
  const [query, setQuery] = useState('');

  // families per area  (family -> building -> street -> area)
  const areas = useMemo(() => {
    const streetArea = new Map(data.streets.map((s) => [s.id, s.area_id]));
    const buildingArea = new Map(data.buildings.map((b) => [b.id, streetArea.get(b.street_id)]));
    const perArea = new Map();
    for (const f of data.families) {
      const areaId = buildingArea.get(f.building_id);
      if (areaId) perArea.set(areaId, (perArea.get(areaId) || 0) + 1);
    }
    return [...data.areas]
      .sort((a, b) => (a.area_no || '').localeCompare(b.area_no || '', 'ar', { numeric: true }))
      .map((a) => ({ ...a, familyCount: perArea.get(a.id) || 0 }));
  }, [data]);

  // search by name / phone / apartment, across ALL regions, works offline
  const results = useMemo(() => {
    const q = toAsciiDigits(query.trim()).toLowerCase();
    if (!q) return null;
    return data.families
      .filter((f) =>
        [f.family_name, f.primary_phone, f.landline, f.apartment_no, f.membership_no]
          .filter(Boolean)
          .some((v) => toAsciiDigits(String(v)).toLowerCase().includes(q))
      )
      .slice(0, 30);
  }, [data.families, query]);

  const handleLogout = () => {
    // logging out wipes this device, so warn if something was not sent yet
    const unsent = counts.pending + counts.failed;
    if (unsent > 0) {
      const ok = window.confirm(
        `يوجد ${unsent} تعديل لم يتم إرساله للخادم بعد. إذا سجلت الخروج الآن سيضيع. هل تريد الخروج؟`
      );
      if (!ok) return;
    }
    logout();
  };

  const handleDiscard = async () => {
    if (!window.confirm('سيتم تجاهل التعديلات المرفوضة وإعادة تحميل البيانات من الخادم. متابعة؟')) return;
    await discardFailed();
    runSync();
  };

  return (
    <div className="pb-28">
      {/* Header */}
      <header className="bg-navy text-white p-6 rounded-b-3xl relative overflow-hidden text-center shadow-md">
        <button
          type="button"
          onClick={handleLogout}
          className="absolute left-4 top-4 p-2 rounded-full bg-white/10"
          aria-label="تسجيل الخروج"
        >
          <LogOut className="w-5 h-5" />
        </button>

        <div className="mb-2">
          <img
            src="/church-visitation-logo.svg"
            alt="Church visitation"
            width={48}
            height={48}
            className="mx-auto block object-contain"
          />
        </div>
        <h1 className="text-2xl font-bold">الافتقاد الميداني</h1>
        <div className="mt-4 relative max-w-md mx-auto">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ابحث بالاسم أو رقم الهاتف"
            className="w-full p-3 pr-10 rounded-xl text-navy bg-white focus:outline-none"
          />
          <Search className="absolute right-3 top-3 text-gray-400 w-5 h-5" />
        </div>
        {syncing && (
          <p className="mt-3 text-sm flex items-center justify-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin" /> جاري المزامنة...
          </p>
        )}
      </header>

      <div className="p-4 mt-4">
        {counts.pending > 0 && (
          <p className="mb-4 p-3 rounded-lg bg-gold/20 text-navy font-bold text-center">
            {counts.pending} تعديل محفوظ على الجهاز بانتظار الإرسال
          </p>
        )}
        {counts.failed > 0 && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-700 font-bold text-center">
            <p className="flex items-center justify-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              {counts.failed} تعديل رفضه الخادم
            </p>
            <button type="button" onClick={handleDiscard} className="mt-2 underline">
              تجاهل وإعادة التحميل من الخادم
            </button>
          </div>
        )}

        {results ? (
          // ---------- search results ----------
          <div className="space-y-3">
            <h2 className="text-lg font-bold text-navy text-center mb-2">نتائج البحث ({results.length})</h2>
            {results.length === 0 && <p className="text-center text-gray-500">لا توجد نتائج</p>}
            {results.map((f) => (
              <ListLink key={f.id} to={`/family/${f.id}`}>
                <span className="font-bold text-lg">
                  {f.family_name}
                  <PendingBadge row={f} />
                </span>
                <span className="text-sm text-gray-500" dir="ltr">{f.primary_phone}</span>
              </ListLink>
            ))}
          </div>
        ) : (
          // ---------- regions ----------
          <>
            <h2 className="text-xl font-bold text-navy text-center mb-6">اختيار المنطقة</h2>

            <div className="space-y-4">
              {loading || areas.length === 0 ? (
                <p className="text-center text-gray-500">
                  {syncing
                    ? 'جاري تحميل البيانات...'
                    : syncError
                      ? 'تعذّرت المزامنة. سنحاول مرة أخرى عند توفر الاتصال.'
                      : loading
                        ? 'جاري التحميل...'
                        : 'لا توجد مناطق مسجلة حتى الآن.'}
                </p>
              ) : (
                areas.map((area, index) => (
                  <ListLink key={area.id} to={`/area/${area.id}`} highlight={index === 0}>
                    <span>
                      <span className="text-2xl font-bold block">منطقة {area.area_no}</span>
                      <span className="text-sm opacity-80">{area.familyCount} أسرة</span>
                    </span>
                    <span className="text-3xl">📍</span>
                  </ListLink>
                ))
              )}
            </div>
          </>
        )}
      </div>
      <AddFamilyFab />
    </div>
  );
}
