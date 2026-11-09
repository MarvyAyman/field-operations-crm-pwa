import { useState, useEffect, useCallback, useRef, createContext, useContext } from 'react';
import API, {
  getToken,
  getCachedUser,
  saveSession,
  saveUser,
  clearSession,
  setPendingLogout,
  flushPendingLogout,
  setUnauthorizedHandler,
  isNetworkError,
} from './api';
import { clearAll, getMeta, setMeta, getOutboxCounts } from './db';
import { syncNow, pushOutbox } from './sync';
import { supabase } from './supabase';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  // Start from the profile saved on the device: the app opens instantly and
  // works with no internet. The server is checked in the background.
  const [user, setUser] = useState(() => getCachedUser());
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState(false);
  const [syncVersion, setSyncVersion] = useState(0); // bumps after every successful sync
  const [signingIn, setSigningIn] = useState(false);   // finishing the Google sign-in
  const [loginError, setLoginError] = useState('');
  const exchanging = useRef(false);

  // Remove the session (and, unless keepData, the local copy of the data) from this device.
  // keepData is used when the server ends the session while changes were not sent yet:
  // they stay on the phone and are sent after the same person logs in again.
  const logoutLocal = useCallback(async ({ keepData = false } = {}) => {
    clearSession();
    if (!keepData) {
      try { await clearAll(); } catch (e) { console.error(e); }
    }
    setUser(null);
  }, []);

  const logoutKeepingUnsent = useCallback(async () => {
    let unsent = 0;
    try {
      const { pending, failed } = await getOutboxCounts();
      unsent = pending + failed;
    } catch (e) { console.error(e); }
    await logoutLocal({ keepData: unsent > 0 });
  }, [logoutLocal]);

  // 1) send what was saved offline, 2) download what changed on the server
  const runSync = useCallback(async () => {
    if (!getToken()) return;
    setSyncing(true);
    try {
      await pushOutbox();               // never throws on network problems
      setSyncVersion((v) => v + 1);     // pending badge / lists refresh
      const result = await syncNow();
      if (result) {
        setSyncError(false);
        setSyncVersion((v) => v + 1);
      }
    } catch (err) {
      if (err.response?.status !== 401) setSyncError(true); // 401 is handled by logoutLocal
      console.error('sync failed', err);
    } finally {
      setSyncing(false);
    }
  }, []);

  // Ask the server if the saved session is still good, then sync.
  // Offline / server down -> do nothing: the user stays signed in.
  const verifySession = useCallback(async () => {
    if (!getToken()) {
      flushPendingLogout();
      return;
    }
    try {
      const res = await API.get('/auth/me/');
      saveUser(res.data);
      setUser(res.data);
      // remember whose data is on this phone (sessions from before this field existed)
      if (!(await getMeta('owner'))) await setMeta('owner', res.data.email);
    } catch (err) {
      if (isNetworkError(err)) return;
      // 401 is already handled by the interceptor; 403 = removed/disabled in the members table
      if (err.response.status === 403) await logoutLocal(); // removed from the service: wipe
      return;
    }
    runSync();
  }, [logoutLocal, runSync]);

  // 401 from any request -> token is dead -> sign out
  useEffect(() => {
    setUnauthorizedHandler(() => logoutKeepingUnsent());
    return () => setUnauthorizedHandler(null);
  }, [logoutKeepingUnsent]);

  // On app start and every time the connection comes back
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    verifySession();
    window.addEventListener('online', verifySession);
    return () => window.removeEventListener('online', verifySession);
  }, [verifySession]);

  // Swap the Supabase access token for our own app session.
  // The server confirms the token with Supabase and then checks the members table.
  const loginWithSupabase = useCallback(async (accessToken) => {
    // skipAuth: never send an old token while logging in
    const res = await API.post('/auth/supabase/', { access_token: accessToken }, { skipAuth: true });

    // a different person logging in on this phone must never see (or send) the previous person's data
    try {
      const owner = await getMeta('owner');
      if (owner && owner !== res.data.user.email) await clearAll();
      await setMeta('owner', res.data.user.email);
    } catch (e) { console.error(e); }

    saveSession(res.data.token, res.data.user);
    setUser(res.data.user);
    runSync(); // first login downloads all the data in the background
    return res.data.user;
  }, [runSync]);

  // Google -> Supabase sends the browser back to /login?code=...; supabase-js finishes the
  // sign-in and tells us here. We exchange it for the app session and then forget the
  // Supabase session, so only ONE session (ours) exists on the phone.
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session || getToken() || exchanging.current) return;
      if (event !== 'SIGNED_IN' && event !== 'INITIAL_SESSION') return;

      exchanging.current = true;
      setSigningIn(true);
      setLoginError('');

      // run outside this callback: supabase-js must not be awaited from inside it
      setTimeout(async () => {
        try {
          await loginWithSupabase(session.access_token);
        } catch (err) {
          if (isNetworkError(err)) {
            setLoginError('تعذّر الوصول إلى الخادم. تأكد من الاتصال بالإنترنت وحاول مرة أخرى.');
          } else {
            setLoginError(err.response?.data?.error || 'فشل تسجيل الدخول. حاول مرة أخرى.');
          }
        } finally {
          await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
          exchanging.current = false;
          setSigningIn(false);
        }
      }, 0);
    });
    return () => data.subscription.unsubscribe();
  }, [loginWithSupabase]);

  const logout = async () => {
    const token = getToken();
    await logoutLocal();
    supabase.auth.signOut({ scope: 'local' }).catch(() => {}); // make sure no old sign-in lingers
    if (!token) return;
    try {
      await API.post('/auth/logout/', null, {
        headers: { Authorization: `Token ${token}` },
        skipAuth: true,
      });
    } catch (err) {
      // offline: revoke the token on the server next time we are online
      if (isNetworkError(err)) setPendingLogout(token);
    }
  };

  return (
    <AuthContext.Provider
      value={{ user, logout, syncing, syncError, syncVersion, runSync, signingIn, loginError }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext);
