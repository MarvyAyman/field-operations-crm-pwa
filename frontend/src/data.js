import { useEffect, useState } from 'react';
import { useAuth } from './auth.jsx';
import { getAll, getOutboxCounts, LOCAL_CHANGE_EVENT } from './db';

// ---------------------------------------------------------------
// Which lookup_values lists are used where.
// A lookup is matched by its `list_key`. If your list keys are named differently,
// change these two patterns (e.g. /^visit_status$/i).
// ---------------------------------------------------------------
export const LOOKUP = {
  visitStatus: /visit/i,
  relation: /relation/i,
  contract: /contract/i,                         // نوع العقد: ملاك / إيجار
  marital: /marital/i,                           // الحالة الاجتماعية
  confessor: /confess/i,                         // أب الاعتراف
  personStatus: /^(?!.*(visit|marital)).*status/i, // الحالة: مقيم / مسافر / متنيح  (not the visit status)
};

export const inputClass = 'w-full p-3 border rounded-lg bg-white focus:outline-gold';

// UUID made on the device. crypto.randomUUID only exists on https / localhost,
// so fall back to getRandomValues (e.g. when testing over http on a phone).
export function newId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// YYYY-MM-DD in the phone's own time zone
export const today = () => new Date().toLocaleDateString('en-CA');

// ٠١٢٣ / ۰۱۲۳ -> 0123 (so phone numbers typed with Arabic digits still work and search)
export function toAsciiDigits(text = '') {
  return String(text)
    .replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
    .replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
}

export const PHONE_PATTERN = /^[0-9+\s-]{7,15}$/;

export function lookupsFor(lookups, pattern) {
  return lookups
    .filter((l) => l.active !== false && pattern.test(l.list_key || ''))
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
}

// the person columns that PersonFields edits -> ready for the database
export const OTHER = '__other'; // the "آخر..." choice of a list

// what a person form shows for a field the person row does not store 1:1
export function personFormDefault(person, key) {
  if (key === 'confessor_id') return person?.confessor_id || (person?.extra?.confessor_other ? OTHER : '');
  if (key === 'confessor_other') return person?.extra?.confessor_other ?? '';
  if (key === 'relation_id') return person?.relation_id || (person?.extra?.relation_other ? OTHER : '');
  if (key === 'relation_other') return person?.extra?.relation_other ?? '';
  if (key === 'phone' || key === 'phone2' || key === 'notes') return person?.extra?.[key] ?? '';
  return person?.[key] ?? '';
}

// A confessor / relation that is not in the list ("آخر") is kept as text in
// people.extra.confessor_other / people.extra.relation_other.
// `existingExtra` = the person's current extra (other keys are kept).
export function personFieldsFromForm(get, existingExtra = null) {
  const other = get('confessor_id') === OTHER;
  const relOther = get('relation_id') === OTHER;
  const extra = { ...(existingExtra || {}) };
  delete extra.confessor_other;
  delete extra.relation_other;
  // the person's own phones and notes (only the person form has these inputs; keep what is stored otherwise)
  for (const k of ['phone', 'phone2', 'notes']) {
    const v = get(k);
    if (v === undefined || v === null) continue;
    const t = k === 'notes' ? String(v).trim() : toAsciiDigits(String(v).trim());
    if (t) extra[k] = t; else delete extra[k];
  }
  if (other && get('confessor_other').trim()) extra.confessor_other = get('confessor_other').trim();
  if (relOther && get('relation_other').trim()) extra.relation_other = get('relation_other').trim();
  return {
    gender: get('gender') || null,
    relation_id: relOther ? null : (get('relation_id') || null),
    status_id: get('status_id') || null,
    marital_status_id: get('marital_status_id') || null,
    job: get('job').trim() || null,
    confessor_id: other ? null : (get('confessor_id') || null),
    birth_date: get('birth_date') || null,
    extra: Object.keys(extra).length ? extra : null,
  };
}

// The label of a lookup value (feminine form for a woman, when the list has one)
export const lookupLabel = (l, gender) => (gender === 'female' && l.label_f) || l.label;

// Next person number inside a family: 1, 2, 3 ... (hidden from the user)
export function nextPersonNo(people, familyId) {
  const nums = people
    .filter((p) => p.family_id === familyId)
    .map((p) => parseInt(p.person_no, 10))
    .filter(Number.isFinite);
  return String(Math.max(0, ...nums) + 1);
}

export const buildingLabel = (b) =>
  `مبنى ${b.house_no ?? ''}${b.direction ? ` — ${b.direction}` : ''}`.trim();

// family id -> date of its newest visit (computed from the local visits)
export function lastVisitByFamily(visits) {
  const map = new Map();
  for (const v of visits) {
    if (!v.visited_on) continue;
    const current = map.get(v.family_id);
    if (!current || v.visited_on > current) map.set(v.family_id, v.visited_on);
  }
  return map;
}

// only the fields that really changed (so an edit sends the smallest possible update)
export function diffPatch(original, fields) {
  const patch = {};
  for (const [key, value] of Object.entries(fields)) {
    const before = original?.[key] ?? null;
    const same = value && typeof value === 'object' ? JSON.stringify(before) === JSON.stringify(value) : before === value;
    if (!same) patch[key] = value;
  }
  return patch;
}

// ---------------------------------------------------------------
// React hooks that read the local database
// ---------------------------------------------------------------

// Re-runs `callback` whenever the server was synced OR something changed on this device
function useLocalRefresh() {
  const { syncVersion } = useAuth();
  const [localVersion, setLocalVersion] = useState(0);

  useEffect(() => {
    const bump = () => setLocalVersion((v) => v + 1);
    window.addEventListener(LOCAL_CHANGE_EVENT, bump);
    return () => window.removeEventListener(LOCAL_CHANGE_EVENT, bump);
  }, []);

  return `${syncVersion}:${localVersion}`;
}

// const { data, loading } = useTables(['families', 'visits'])  ->  data.families, data.visits
export function useTables(names) {
  const version = useLocalRefresh();
  const key = names.join(',');
  const [state, setState] = useState(() => ({
    data: Object.fromEntries(names.map((n) => [n, []])),
    loading: true,
  }));

  useEffect(() => {
    let cancelled = false;
    const list = key.split(',');
    Promise.all(list.map(getAll))
      .then((rows) => {
        if (cancelled) return;
        setState({ data: Object.fromEntries(list.map((n, i) => [n, rows[i]])), loading: false });
      })
      .catch(console.error);
    return () => { cancelled = true; };
  }, [key, version]);

  return state;
}

// { pending, failed } = changes waiting to be sent / rejected by the server
export function useOutboxCounts() {
  const version = useLocalRefresh();
  const [counts, setCounts] = useState({ pending: 0, failed: 0 });

  useEffect(() => {
    let cancelled = false;
    getOutboxCounts()
      .then((c) => { if (!cancelled) setCounts(c); })
      .catch(console.error);
    return () => { cancelled = true; };
  }, [version]);

  return counts;
}
