import { useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

// Tells the user when
//   - the app has been saved for offline use (first visit), and
//   - a new version of the app is ready (tap to update).
// Nothing is lost on update: the data lives in IndexedDB, not in the app files.
export default function UpdatePrompt() {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      // look for a new version every hour while the app stays open
      if (registration) setInterval(() => registration.update().catch(() => {}), 60 * 60 * 1000);
    },
  });

  useEffect(() => {
    if (!offlineReady) return undefined;
    const t = setTimeout(() => setOfflineReady(false), 5000);
    return () => clearTimeout(t);
  }, [offlineReady, setOfflineReady]);

  if (!offlineReady && !needRefresh) return null;

  return (
    <div
      role="status"
      className="fixed bottom-4 inset-x-4 z-50 bg-navy text-white rounded-xl shadow-lg p-4 flex items-center justify-between gap-3"
    >
      {needRefresh ? (
        <>
          <span className="font-bold">يوجد إصدار جديد من التطبيق</span>
          <span className="flex gap-2">
            <button type="button" onClick={() => setNeedRefresh(false)} className="px-3 py-1 rounded-lg bg-white/10">
              لاحقاً
            </button>
            <button type="button" onClick={() => updateServiceWorker(true)} className="px-3 py-1 rounded-lg bg-gold text-navy font-bold">
              تحديث
            </button>
          </span>
        </>
      ) : (
        <span className="font-bold">✓ التطبيق جاهز للعمل بدون إنترنت</span>
      )}
    </div>
  );
}
