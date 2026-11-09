import API, { getToken, isNetworkError } from './api';
import {
  applySync, getMeta, setMeta,
  getOutbox, markSynced, markFailed, markAttempt,
} from './db';

let pulling = null;
let pushing = null;

// ---------------------------------------------------------------
// PULL: download what changed on the server into IndexedDB
// First run (no last_sync) downloads everything. Safe to call many times at once.
// ---------------------------------------------------------------
export function syncNow() {
  if (pulling) return pulling;

  pulling = (async () => {
    const since = await getMeta('last_sync');
    const res = await API.get('/sync/', { params: since ? { since } : {} });

    // the user may have logged out while the request was in flight
    if (!getToken()) return null;

    await applySync(res.data);
    await setMeta('last_sync', res.data.server_time);
    return res.data;
  })().finally(() => {
    pulling = null;
  });

  return pulling;
}

// table name -> REST endpoint
const ENDPOINTS = {
  families: '/families/',
  buildings: '/buildings/',
  people: '/people/',
  family_phones: '/family-phones/',
  family_internal_notes: '/family-internal-notes/',
  visits: '/visits/',
};

function errorMessage(err) {
  const data = err.response?.data;
  if (!data) return 'تعذّر الإرسال';
  if (typeof data === 'string') return data;
  if (data.error || data.detail) return data.error || data.detail;
  return Object.entries(data)
    .map(([field, msgs]) => `${field}: ${[].concat(msgs).join(', ')}`)
    .join(' | ');
}

// ---------------------------------------------------------------
// PUSH: send everything changed offline, oldest first (a building is created
// before the families inside it). Safe to retry: creates carry the id made on
// the device and the server ignores an id it already has.
// Returns how many changes were sent.
// ---------------------------------------------------------------
export function pushOutbox() {
  if (pushing) return pushing;

  pushing = (async () => {
    let sent = 0;
    const items = await getOutbox();

    for (const item of items) {
      if (item.error) continue; // rejected before; needs a human, don't loop forever
      if (!getToken()) break;

      const base = ENDPOINTS[item.table];
      if (!base) {
        await markFailed(item.id, `جدول غير معروف: ${item.table}`);
        continue;
      }

      try {
        let res = null;
        if (item.op === 'create') res = await API.post(base, item.payload);
        else if (item.op === 'update') res = await API.patch(`${base}${item.id}/`, item.payload);
        else await API.delete(`${base}${item.id}/`);

        await markSynced(item, res?.data);
        sent += 1;
      } catch (err) {
        const status = err.response?.status;

        if (isNetworkError(err) || status === 401) break; // offline / session problem -> later

        if (item.op === 'delete' && status === 404) {
          await markSynced(item); // already gone on the server = done
          continue;
        }
        if (item.op === 'update' && status === 404) {
          await markFailed(item.id, 'لم يعد موجوداً على الخادم (ربما حذفه أحد)');
          continue;
        }
        if (status >= 500) {
          await markAttempt(item.id); // temporary server problem: try again next time
          continue;
        }
        await markFailed(item.id, errorMessage(err)); // 400, 403 ... -> permanent
      }
    }
    return sent;
  })().finally(() => {
    pushing = null;
  });

  return pushing;
}
