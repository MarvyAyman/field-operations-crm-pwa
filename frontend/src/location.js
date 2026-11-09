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
