import { useEffect, useRef, useState } from 'react';

// Watches the GPS while a screen is open and keeps the BEST reading (smallest error), so the position is already
// found when the user taps save, even if they are indoors and the first readings were poor. GPS needs no internet.
//   phase: 'idle' | 'searching' | 'good' | 'denied' | 'unavailable'
export function useBestPosition(enabled) {
  const best = useRef(null); // { lat, lng, accuracy }
  const [info, setInfo] = useState({ phase: 'idle', accuracy: null });

  useEffect(() => {
    if (!enabled) return undefined;
    if (!window.isSecureContext || !navigator.geolocation) {
      setInfo({ phase: 'unavailable', accuracy: null }); // eslint-disable-line react-hooks/set-state-in-effect
      return undefined;
    }
    setInfo({ phase: 'searching', accuracy: null });
    let id = null;
    const stop = () => { if (id != null) { navigator.geolocation.clearWatch(id); id = null; } };
    id = navigator.geolocation.watchPosition(
      ({ coords }) => {
        const accuracy = Math.round(coords.accuracy);
        if (!Number.isFinite(accuracy)) return;
        if (!best.current || accuracy < best.current.accuracy) {
          best.current = { lat: Number(coords.latitude.toFixed(6)), lng: Number(coords.longitude.toFixed(6)), accuracy };
          setInfo({ phase: 'searching', accuracy, reading: best.current });
        }
        if (accuracy <= 15) { setInfo({ phase: 'good', accuracy, reading: best.current }); stop(); } // as good as a phone gets: stop draining the battery
      },
      (err) => { setInfo((cur) => (cur.accuracy != null ? cur : { phase: err.code === 1 ? 'denied' : 'unavailable', accuracy: null })); },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 },
    );
    const giveUp = setTimeout(stop, 90000); // never keep the GPS on forever
    return () => { clearTimeout(giveUp); stop(); };
  }, [enabled]);

  return { best, info };
}
