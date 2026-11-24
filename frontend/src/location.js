// Saving a building's GPS position.
// Same idea as the reference project: ask the browser for a high-accuracy position,
// turn every failure into a clear Arabic message, and store lat / lng / accuracy.
// GPS works without internet on phones; the result is saved on the device and sent later.

const MAPS_PREFIX = 'https://www.google.com/maps?q=';

// Position is considered "weak" above this many metres
export const WEAK_ACCURACY_M = 100;

export const hasLocation = (b) => Number.isFinite(b?.lat) && Number.isFinite(b?.lng);
export const mapsLink = (lat, lng) => `${MAPS_PREFIX}${lat},${lng}`;

// Keep a link the servant typed by hand; only (re)generate our own
export const isAutoMapsLink = (url) => !url || url.startsWith(MAPS_PREFIX);

// Asks the browser for the position. The browser itself shows the "allow location?" prompt.
export function getPosition() {
  return new Promise((resolve, reject) => {
    if (!window.isSecureContext) return reject({ code: 'INSECURE' });
    if (!navigator.geolocation) return reject({ code: 'UNSUPPORTED' });
    return navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true, // use GPS, not just Wi-Fi / mobile towers
      timeout: 20000,
      maximumAge: 0,            // never reuse an old position
    });
  });
}

// Why it failed, in Arabic, and what to do about it
export function locationErrorMessage(err) {
  switch (err?.code) {
    case 1:
      return 'تم رفض إذن الموقع. اسمح للموقع بالوصول إلى موقعك من إعدادات المتصفح (أيقونة القفل بجانب العنوان، أو إعدادات الموقع في الهاتف) ثم حاول مرة أخرى.';
    case 2:
      return 'تعذّر تحديد موقعك. تأكد من تشغيل خدمة الموقع (GPS) في هاتفك، ويُفضَّل تشغيل الواي فاي أو بيانات الهاتف لتحسين الدقة، ثم حاول مرة أخرى.';
    case 3:
      return 'انتهت مهلة تحديد الموقع. اخرج إلى مكان مفتوح أو اقترب من نافذة، وتأكد من تشغيل GPS، ثم حاول مرة أخرى.';
    case 'INSECURE':
      return 'تحديد الموقع يعمل فقط على اتصال آمن (HTTPS) أو على localhost. افتح التطبيق من الرابط الآمن.';
    case 'UNSUPPORTED':
      return 'هذا المتصفح أو الجهاز لا يدعم تحديد الموقع.';
    default:
      return 'تعذّر تحديد الموقع لسبب غير معروف. حاول مرة أخرى.';
  }
}

// ---- quality + "best reading wins" -------------------------------------------------------------------------------
export const GOOD_ACCURACY_M = 30;   // "دقيق"
export const FAR_FROM_NEIGHBOURS_M = 1500; // a reading this far from every located building on the street is not "on site"

// "دقيق" | "متوسط" | "تقريبي" | null (no position / accuracy unknown)
export function accuracyLabel(b) {
  if (!hasLocation(b)) return null;
  const a = b.location_accuracy;
  if (!Number.isFinite(a)) return null;
  if (a <= GOOD_ACCURACY_M) return 'دقيق';
  if (a <= WEAK_ACCURACY_M) return 'متوسط';
  return 'تقريبي';
}

export function distanceMeters(lat1, lng1, lat2, lng2) {
  const rad = (d) => (d * Math.PI) / 180;
  const a = Math.sin(rad(lat2 - lat1) / 2) ** 2
    + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(a));
}

// Should this reading become the building's saved position?
//  - the building has none  -> yes (even a rough one is better than nothing; a better one replaces it later)
//  - it has one             -> only a clearly better reading (30% tighter and at least 10 m better),
//                              and never one that jumps far away from the saved one (probably not on site)
//  - `neighbours`: other buildings of the same street that have a position (to reject readings taken far from the street)
export function shouldSavePosition(building, reading, neighbours = []) {
  if (!reading || !Number.isFinite(reading.lat) || !Number.isFinite(reading.lng) || !Number.isFinite(reading.accuracy)) return false;
  if (hasLocation(building)) {
    const old = Number.isFinite(building.location_accuracy) ? building.location_accuracy : WEAK_ACCURACY_M;
    const better = reading.accuracy < old * 0.7 && old - reading.accuracy >= 10;
    const jump = distanceMeters(building.lat, building.lng, reading.lat, reading.lng);
    return better && jump <= old + reading.accuracy + 150;
  }
  const located = neighbours.filter(hasLocation);
  if (located.length === 0) return true;
  const nearest = Math.min(...located.map((n) => distanceMeters(n.lat, n.lng, reading.lat, reading.lng)));
  return nearest <= FAR_FROM_NEIGHBOURS_M;
}
