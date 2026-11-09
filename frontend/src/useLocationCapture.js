import { useCallback, useSyncExternalStore } from 'react';
import { useAuth } from './auth.jsx';
import { updateRow } from './db';
import {
  getPosition, locationErrorMessage, hasLocation, mapsLink, isAutoMapsLink, WEAK_ACCURACY_M,
} from './location.js';

// Messages live OUTSIDE the components (one per building id), so they survive the list
// re-rendering after a sync.
const messages = new Map();
const timers = new Map();
const listeners = new Set();
const notify = () => listeners.forEach((l) => l());
const subscribe = (l) => { listeners.add(l); return () => listeners.delete(l); };

function setMessage(id, status) {
  clearTimeout(timers.get(id));
  timers.delete(id);
  if (status) messages.set(id, status); else messages.delete(id);
  // a success message disappears by itself; problems stay until dismissed
  if (status?.kind === 'success') timers.set(id, setTimeout(() => setMessage(id, null), 8000));
  notify();
}

// "Add location" for one building.
//   status = null | { kind: 'working' | 'success' | 'warning' | 'error', text }
export function useLocationCapture(building) {
  const { runSync } = useAuth();
  const status = useSyncExternalStore(subscribe, () => messages.get(building.id) ?? null);
  const busy = status?.kind === 'working';
  const setStatus = (v) => setMessage(building.id, v);

  const dismiss = useCallback(() => setMessage(building.id, null), [building.id]);

  const capture = useCallback(async () => {
    if (busy) return; // ignore double taps while a position is being found

    if (hasLocation(building)
      && !window.confirm('يوجد موقع محفوظ لهذا المبنى. هل تريد استبداله بموقعك الحالي؟')) {
      return;
    }

    setStatus({
      kind: 'working',
      text: 'جاري تحديد موقعك... اسمح للتطبيق بالوصول إلى الموقع إذا ظهر طلب الإذن.',
    });

    let coords;
    try {
      ({ coords } = await getPosition());
    } catch (err) {
      setStatus({ kind: 'error', text: locationErrorMessage(err) });
      return;
    }

    const lat = Number(coords.latitude.toFixed(6));
    const lng = Number(coords.longitude.toFixed(6));
    const accuracy = Math.round(coords.accuracy);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      setStatus({ kind: 'error', text: 'وصل موقع غير صالح من الجهاز. حاول مرة أخرى.' });
      return;
    }

    const patch = { lat, lng, location_accuracy: Number.isFinite(accuracy) ? accuracy : null };
    if (isAutoMapsLink(building.maps_url)) patch.maps_url = mapsLink(lat, lng);

    try {
      await updateRow('buildings', building.id, patch); // saved on the phone first
    } catch (err) {
      console.error(err);
      setStatus({ kind: 'error', text: 'تم تحديد موقعك لكن تعذّر حفظه على الجهاز. حاول مرة أخرى.' });
      return;
    }
    runSync(); // sent now if online, otherwise when the connection returns

    const offlineNote = navigator.onLine ? '' : ' سيُرسل للخادم عند توفر الاتصال.';
    if (coords.accuracy > WEAK_ACCURACY_M) {
      setStatus({
        kind: 'warning',
        text: `تم حفظ الموقع لكن الدقة ضعيفة (±${accuracy} متر). يُفضَّل إعادة المحاولة في مكان مفتوح مع تشغيل GPS.${offlineNote}`,
      });
    } else {
      setStatus({ kind: 'success', text: `تم حفظ موقع المبنى بدقة ±${accuracy} متر.${offlineNote}` });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [building, busy, runSync]);

  return { status, busy, capture, dismiss };
}
