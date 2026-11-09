import axios from 'axios';

// Dev: '/api' goes through the Vite proxy (see vite.config.js) -> Django on :8000
// Production (API on another domain): set VITE_API_URL=https://your-api.example.com/api
const API = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 15000,
});

// ---------------------------------------------------------------
// Session stored on the device (this is what makes login work offline)
// ---------------------------------------------------------------
const TOKEN_KEY = 'auth_token';
const USER_KEY = 'auth_user';
const PENDING_LOGOUT_KEY = 'pending_logout_token';

export function getToken() {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}

export function getCachedUser() {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw && getToken() ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveSession(token, user) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  // logging in again with the same token cancels an unfinished logout
  if (localStorage.getItem(PENDING_LOGOUT_KEY) === token) {
    localStorage.removeItem(PENDING_LOGOUT_KEY);
  }
}

export function saveUser(user) {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

// Logout while offline: remember the token and revoke it on the server later
export function setPendingLogout(token) {
  localStorage.setItem(PENDING_LOGOUT_KEY, token);
}

export async function flushPendingLogout() {
  const token = localStorage.getItem(PENDING_LOGOUT_KEY);
  if (!token || getToken()) return; // nothing to do, or the user logged in again
  try {
    await API.post('/auth/logout/', null, {
      headers: { Authorization: `Token ${token}` },
      skipAuth: true,
    });
    localStorage.removeItem(PENDING_LOGOUT_KEY);
  } catch (err) {
    // 401 = token already dead on the server, so we are done; otherwise retry later
    if (err.response?.status === 401) localStorage.removeItem(PENDING_LOGOUT_KEY);
  }
}

// true when the request never reached the server (offline, timeout, server down)
export const isNetworkError = (err) => !err.response;

// ---------------------------------------------------------------
// Interceptors
// ---------------------------------------------------------------
// Add the token to every request (except login/logout calls that pass skipAuth)
API.interceptors.request.use((config) => {
  const token = getToken();
  if (token && !config.skipAuth) {
    config.headers.Authorization = `Token ${token}`;
  }
  return config;
});

// A 401 from the server means the token is dead -> sign out.
// A network error is NOT a 401, so being offline never logs anyone out.
let unauthorizedHandler = null;
export const setUnauthorizedHandler = (fn) => { unauthorizedHandler = fn; };

API.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && !err.config?.skipAuth && getToken() && unauthorizedHandler) {
      unauthorizedHandler();
    }
    return Promise.reject(err);
  }
);

export default API;
