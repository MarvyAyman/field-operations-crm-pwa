import { openDB } from 'idb';

// Local (offline) copy of the server data, stored in the browser's IndexedDB.
export const TABLES = [
  'lookup_values',
  'areas',
  'streets',
  'buildings',
  'families',
  'people',
  'family_phones',
  'family_internal_notes',
  'visits',
];

// Strictly increasing timestamps, so changes made in the same millisecond keep their
// order (a building must be sent before the family inside it)
let lastStamp = 0;
function stamp() {
  lastStamp = Math.max(Date.now(), lastStamp + 1);
  return new Date(lastStamp).toISOString();
}

// Fired after every change made on this device, so open screens can refresh
export const LOCAL_CHANGE_EVENT = 'local-db-change';
const notifyChange = () => window.dispatchEvent(new Event(LOCAL_CHANGE_EVENT));

let dbPromise = null;

export function getDB() {
  if (!dbPromise) {
    // v4 adds family_internal_notes. Existing stores (and the outbox) are kept as they are.
    dbPromise = openDB('visitation-db', 4, {
      upgrade(db) {
        for (const table of TABLES) {
          if (!db.objectStoreNames.contains(table)) {
            db.createObjectStore(table, { keyPath: 'id' });
          }
        }
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta'); // last_sync, owner
        if (!db.objectStoreNames.contains('outbox')) db.createObjectStore('outbox', { keyPath: 'id' });
      },
    });
  }
  return dbPromise;
}

export async function getAll(table) {
  const db = await getDB();
  return db.getAll(table);
}

export async function getRow(table, id) {
  const db = await getDB();
  return db.get(table, id);
}

export async function getMeta(key) {
  const db = await getDB();
  return db.get('meta', key);
}

export async function setMeta(key, value) {
  const db = await getDB();
  return db.put('meta', value, key);
}

// ---------------------------------------------------------------
// Applying a server response (/api/sync/)
// ---------------------------------------------------------------
// One transaction (all or nothing). Rows that still have a change waiting in the
// outbox are never overwritten by the server copy, and rows created offline
// (_pending) are never wiped by a full download.
export async function applySync({ tables = {}, deleted = {}, full = false }) {
  const db = await getDB();
  const tx = db.transaction([...TABLES, 'outbox'], 'readwrite');
  const queued = new Set(await tx.objectStore('outbox').getAllKeys());

  for (const table of TABLES) {
    const store = tx.objectStore(table);

    if (full) {
      let cursor = await store.openCursor();
      while (cursor) {
        if (!cursor.value._pending) await cursor.delete();
        cursor = await cursor.continue();
      }
    }

    for (const row of tables[table] || []) {
      if (!queued.has(row.id)) store.put(row);
    }
    for (const id of deleted[table] || []) store.delete(id);
  }

  await tx.done;
}

// ---------------------------------------------------------------
// Local-first writes. Every write:
//   1) changes the local copy immediately (screens update, works offline)
//   2) records the change in the "outbox" so it is sent to the server later
//
// The outbox holds ONE entry per row (keyed by the row id), so several offline
// edits of the same row are merged:   create+edit = create,  create+delete = nothing,
// edit+edit = one edit,  edit+delete = delete.
//   entry = { id, table, op: 'create'|'update'|'delete', payload, createdAt, rev, error?, attempts? }
// ---------------------------------------------------------------

export async function createRow(table, row) {
  const db = await getDB();
  const tx = db.transaction([table, 'outbox'], 'readwrite');
  tx.objectStore(table).put({ ...row, _pending: true });
  tx.objectStore('outbox').put({
    id: row.id,
    table,
    op: 'create',
    payload: row,
    createdAt: stamp(),
    rev: 1,
  });
  await tx.done;
  notifyChange();
}

export async function updateRow(table, id, patch) {
  if (!patch || Object.keys(patch).length === 0) return;
  const db = await getDB();
  const tx = db.transaction([table, 'outbox'], 'readwrite');
  const store = tx.objectStore(table);
  const outbox = tx.objectStore('outbox');

  const row = await store.get(id);
  if (!row) {
    await tx.done;
    return;
  }

  const now = stamp();
  store.put({ ...row, ...patch, updated_at: now, _pending: true });

  const existing = await outbox.get(id);
  if (existing) {
    // eslint-disable-next-line no-unused-vars
    const { error, attempts, ...rest } = existing; // an edit gives a failed entry another chance
    outbox.put({ ...rest, payload: { ...existing.payload, ...patch }, rev: (existing.rev || 0) + 1 });
  } else {
    outbox.put({ id, table, op: 'update', payload: patch, createdAt: now, rev: 1 });
  }

  await tx.done;
  notifyChange();
}

export async function deleteRow(table, id) {
  const db = await getDB();
  const tx = db.transaction([...TABLES, 'outbox'], 'readwrite');
  const outbox = tx.objectStore('outbox');

  const existing = await outbox.get(id);
  tx.objectStore(table).delete(id);

  if (existing && existing.op === 'create') {
    // never reached the server -> just forget it (and anything created under it)
    outbox.delete(id);
    if (table === 'families') {
      for (const child of ['people', 'visits', 'family_phones']) {
        const store = tx.objectStore(child);
        let cursor = await store.openCursor();
        while (cursor) {
          if (cursor.value.family_id === id && cursor.value._pending) {
            outbox.delete(cursor.value.id);
            await cursor.delete();
          }
          cursor = await cursor.continue();
        }
      }
    }
  } else {
    outbox.put({
      id,
      table,
      op: 'delete',
      payload: {},
      createdAt: existing?.createdAt ?? stamp(),
      rev: (existing?.rev || 0) + 1,
    });
  }

  await tx.done;
  notifyChange();
}

// ---------------------------------------------------------------
// Outbox reading / bookkeeping (used by sync.js and the UI)
// ---------------------------------------------------------------
export async function getOutbox() {
  const db = await getDB();
  const items = await db.getAll('outbox');
  // old entries (v2 of this app) only had { id, type:'family', payload, createdAt }
  return items
    .map((item) => ({ table: 'families', op: 'create', rev: 0, ...item }))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function getOutboxCounts() {
  const items = await getOutbox();
  const failed = items.filter((i) => i.error).length;
  return { pending: items.length - failed, failed };
}

// The server accepted `item`: store the server's row and drop it from the outbox,
// unless the user changed the same row again while it was being sent.
export async function markSynced(item, serverRow) {
  const db = await getDB();
  const tx = db.transaction([item.table, 'outbox'], 'readwrite');
  const outbox = tx.objectStore('outbox');
  const current = await outbox.get(item.id);

  if (!current) {
    // the user deleted it while it was in flight, but the server now has it -> delete there too
    if (item.op === 'create') {
      outbox.put({
        id: item.id, table: item.table, op: 'delete', payload: {},
        createdAt: stamp(), rev: 1,
      });
    }
  } else if ((current.rev || 0) !== (item.rev || 0)) {
    // edited again while sending: the server has the row now, so send the rest as an update
    if (item.op === 'create' && current.op === 'create') outbox.put({ ...current, op: 'update' });
  } else {
    outbox.delete(item.id);
    if (serverRow && item.op !== 'delete') tx.objectStore(item.table).put(serverRow);
  }

  await tx.done;
  notifyChange();
}

// The server rejected it for good (validation, permission): keep it, remember why, stop retrying
export async function markFailed(id, message) {
  const db = await getDB();
  const item = await db.get('outbox', id);
  if (item) await db.put('outbox', { ...item, error: message });
  notifyChange();
}

// The server had a temporary problem (5xx): retry later, give up after 5 tries
export async function markAttempt(id) {
  const db = await getDB();
  const item = await db.get('outbox', id);
  if (!item) return;
  const attempts = (item.attempts || 0) + 1;
  await db.put('outbox', {
    ...item,
    attempts,
    ...(attempts >= 5 ? { error: 'الخادم لا يستجيب لهذا الطلب' } : {}),
  });
  if (attempts >= 5) notifyChange();
}

// Throw away every rejected change and download the server's version again
export async function discardFailed() {
  const db = await getDB();
  const tx = db.transaction([...TABLES, 'outbox', 'meta'], 'readwrite');
  const outbox = tx.objectStore('outbox');

  for (const item of await outbox.getAll()) {
    if (!item.error) continue;
    if (item.table) tx.objectStore(item.table).delete(item.id || '');
    else tx.objectStore('families').delete(item.id);
    outbox.delete(item.id);
  }
  tx.objectStore('meta').delete('last_sync'); // next sync is a full download

  await tx.done;
  notifyChange();
}

// Wipe everything (used on logout so the next person on this phone sees nothing)
export async function clearAll() {
  const db = await getDB();
  const names = [...TABLES, 'meta', 'outbox'];
  const tx = db.transaction(names, 'readwrite');
  for (const name of names) tx.objectStore(name).clear();
  await tx.done;
  notifyChange();
}
