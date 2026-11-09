import { Navigate } from 'react-router-dom';
import { useState } from 'react';
import { WifiOff, RefreshCw } from 'lucide-react';
import { useAuth } from '../auth.jsx';
import { useOnline } from '../online.js';
import { supabase } from '../supabase';

// Google can send the user back with an error (for example they pressed "Cancel")
function errorFromUrl() {
  const q = new URLSearchParams(window.location.search);
  const h = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  return q.get('error_description') || h.get('error_description') || '';
}

export default function Login() {
  const { user, signingIn, loginError } = useAuth();
  const online = useOnline();
  const [error, setError] = useState(() => (errorFromUrl() ? 'لم يكتمل تسجيل الدخول. حاول مرة أخرى.' : ''));
  const [starting, setStarting] = useState(false);

  // already signed in (the session is saved on the device) -> go straight in
  if (user) return <Navigate to="/" replace />;

  const handleGoogle = async () => {
    setError('');
    setStarting(true);
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/login`,
        queryParams: { prompt: 'select_account' }, // let the servant pick the right Google account
      },
    });
    if (err) {
      console.error(err);
      setError('تعذّر بدء تسجيل الدخول. حاول مرة أخرى.');
      setStarting(false);
    } // otherwise the browser is now moving to Google
  };

  const busy = starting || signingIn;
  const message = loginError || error;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-cream">
      <img
        src="/church-visitation-logo.svg"
        alt="Church visitation"
        width={96}
        height={96}
        className="mb-6 object-contain"
      />
      <h1 className="text-3xl font-bold text-navy mb-2">الافتقاد الميداني</h1>
      <p className="text-gray-600 mb-8">خدمة الأسر</p>

      <div id="logged-out-ui" className="w-full max-w-sm flex justify-center">
        {!online ? (
          <div className="text-center text-navy bg-white rounded-xl p-4 shadow-sm">
            <WifiOff className="w-6 h-6 mx-auto mb-2 text-maroon" />
            <p className="font-bold">تسجيل الدخول لأول مرة يحتاج إنترنت</p>
            <p className="text-sm text-gray-600 mt-1">
              بعد الدخول مرة واحدة يمكنك استخدام التطبيق بدون اتصال.
            </p>
          </div>
        ) : signingIn ? (
          <p className="text-navy font-bold flex items-center gap-2">
            <RefreshCw className="w-5 h-5 animate-spin" /> جاري تسجيل الدخول...
          </p>
        ) : (
          <button
            type="button"
            onClick={handleGoogle}
            disabled={busy}
            className="flex items-center justify-center gap-3 w-full p-3 bg-white border border-gray-300 rounded-full hover:bg-gray-50 transition shadow-sm"
>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="24" height="24">
  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
  <path fill="#4285F4" d="M46.5 24c0-1.55-.15-3.24-.47-4.77H24v9.03h12.75c-.55 2.87-2.16 5.32-4.59 6.95l7.14 5.53C43.46 36.55 46.5 30.95 46.5 24z"/>
  <path fill="#FBBC05" d="M10.54 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.98-6.19z"/>
  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.14-5.53c-2.11 1.41-4.8 2.34-8.75 2.34-6.26 0-11.57-4.22-13.46-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
</svg>
            الدخول بحساب Google
          </button>
        )}
      </div>

      {message && <p className="text-red-600 mt-4 text-center font-bold">{message}</p>}
    </div>
  );
}
