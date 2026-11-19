// Search across EVERYTHING in the local database: families, every member, phones, notes, visits, streets, buildings, areas.
// Built once per data version (a few ms for thousands of rows); a query is a plain substring scan over pre-normalised keys.
import { searchKey, areaLabel, buildingLabel, confessorNames } from './data.js';

const digitsOf = (t) => String(t ?? '').replace(/\D/g, '');
// normalised text; long digit strings (phones) also get a digits-only copy so "010 1234-5678" matches "01012345678"
const keyOf = (t) => {
  const k = searchKey(t);
  const d = digitsOf(k);
  return d.length >= 6 && d !== k ? `${k} ${d}` : k;
};

// segment kinds: weight = how strong a hit in it is (lower = shown first)
//   name 0 · person 0 · address 2 · phone 1 · detail 3 · notes 3
export function buildIndex(data) {
  const by = (rows, k = 'id') => new Map(rows.filter((r) => !r.deleted_at).map((r) => [r[k], r]));
  const areas = by(data.areas), streets = by(data.streets), buildings = by(data.buildings);
  const group = (rows, k) => {
    const m = new Map();
    for (const r of rows) {
      if (r.deleted_at) continue;
      if (!m.has(r[k])) m.set(r[k], []);
      m.get(r[k]).push(r);
    }
    return m;
  };
  const peopleOf = group(data.people, 'family_id');
  const phonesOf = group(data.family_phones, 'family_id');
  const notesOf = group(data.family_internal_notes, 'family_id');
  const visitsOf = group(data.visits, 'family_id');

  const seg = (kind, weight, label, text) => {
    const t = String(text ?? '').trim();
    return t ? { kind, weight, label, text: t, key: keyOf(t) } : null;
  };

  const families = [];
  for (const f of data.families) {
    if (f.deleted_at) continue;
    const b = buildings.get(f.building_id);
    const s = b ? streets.get(b.street_id) : null;
    const a = s ? areas.get(s.area_id) : null;
    const address = [a && areaLabel(a), s?.name, b && buildingLabel(b), f.floor_no && `الدور ${f.floor_no}`, f.apartment_no && `شقة ${f.apartment_no}`].filter(Boolean).join(' › ');
    const segs = [
      seg('name', 0, null, f.family_name),
      seg('address', 2, null, address),
      seg('phone', 1, 'تليفون', [f.primary_phone, f.landline, f.membership_no && `عضوية ${f.membership_no}`].filter(Boolean).join(' ')),
      seg('notes', 3, 'ملاحظات الأسرة', f.notes),
      seg('notes', 3, 'ملاحظات العمارة', b?.notes),
      seg('notes', 3, 'ملاحظة داخلية', (notesOf.get(f.id) || []).map((n) => n.note).join(' ')),
    ];
    for (const p of phonesOf.get(f.id) || []) segs.push(seg('phone', 1, 'تليفون', p.phone));
    for (const p of peopleOf.get(f.id) || []) {
      segs.push(seg('person', 0, 'فرد', p.full_name));
      segs.push(seg('detail', 3, p.full_name, [
        p.job, p.extra?.phone, p.extra?.phone2, p.extra?.notes, ...confessorNames(p, data.lookup_values || []),
      ].filter(Boolean).join(' · ')));
    }
    for (const v of visitsOf.get(f.id) || []) segs.push(seg('notes', 3, 'زيارة', v.notes));
    const list = segs.filter(Boolean);
    families.push({ id: f.id, name: f.family_name || '', address, pending: Boolean(f._pending), segs: list, all: list.map((x) => x.key).join('\n') });
  }

  const places = [];
  for (const a of areas.values()) places.push({ type: 'area', id: a.id, title: areaLabel(a), sub: a.kind === 'other_church' ? 'كنيسة أخرى' : 'منطقة', key: keyOf(areaLabel(a)) });
  for (const s of streets.values()) {
    const a = areas.get(s.area_id);
    places.push({ type: 'street', id: s.id, title: s.name || '', sub: a ? areaLabel(a) : '', key: keyOf(`${s.name} ${a ? areaLabel(a) : ''}`) });
  }
  for (const b of buildings.values()) {
    const s = streets.get(b.street_id);
    places.push({
      type: 'building', id: b.id, title: buildingLabel(b), sub: [s?.name, areas.get(s?.area_id) && areaLabel(areas.get(s.area_id))].filter(Boolean).join(' › '),
      key: keyOf(`${b.house_no} ${b.direction || ''} ${b.notes || ''} ${s?.name || ''}`),
    });
  }
  return { families, places };
}

export const tokensOf = (query) => searchKey(query).split(' ').filter(Boolean);

const hasWordStart = (key, tok) => key.startsWith(tok) || key.includes(` ${tok}`);

export function runSearch(index, query, { maxFamilies = 40, maxPlaces = 6 } = {}) {
  const tokens = tokensOf(query);
  if (!tokens.length) return null;
  const out = [];
  for (const f of index.families) {
    if (!tokens.every((t) => f.all.includes(t))) continue;
    let score = 0;
    for (const t of tokens) {
      let best = 9;
      for (const sg of f.segs) {
        if (!sg.key.includes(t)) continue;
        const w = sg.weight + (hasWordStart(sg.key, t) ? 0 : 0.5);
        if (w < best) best = w;
      }
      score += best;
    }
    out.push({ f, score });
  }
  out.sort((a, b) => a.score - b.score || a.f.name.localeCompare(b.f.name, 'ar'));
  const families = out.slice(0, maxFamilies).map(({ f }) => {
    // why did it match? the segments (other than name / address, which the row shows anyway) holding the words
    const snippets = [];
    const need = tokens.filter((t) => !searchKey(f.name).includes(t));
    for (const t of need) {
      const sg = f.segs.find((x) => x.kind !== 'name' && x.kind !== 'address' && x.key.includes(t));
      if (sg && !snippets.includes(sg)) snippets.push(sg);
    }
    const shown = snippets.filter((x) => !(x.kind === 'person' && snippets.some((y) => y.kind === 'detail' && y.label === x.text)));
    return { id: f.id, name: f.name, address: f.address, pending: f.pending, snippets: shown.slice(0, 3) };
  });
  const placeHits = { area: [], street: [], building: [] };
  for (const p of index.places) {
    if (placeHits[p.type].length < maxPlaces && tokens.every((t) => p.key.includes(t))) placeHits[p.type].push(p);
  }
  return { tokens, total: out.length, families, areas: placeHits.area, streets: placeHits.street, buildings: placeHits.building };
}

// normalised text with a map back to the original characters (to highlight the matched words)
function normaliseWithMap(text) {
  let key = '';
  const map = [];
  let lastSpace = true;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (/\s/.test(c)) {
      if (!lastSpace) { key += ' '; map.push(i); lastSpace = true; }
      continue;
    }
    const k = searchKey(c);
    for (const ch of k) { key += ch; map.push(i); }
    if (k) lastSpace = false;
  }
  return { key, map };
}

// -> [{ text, hit }]  pieces of `text`, `hit` marks the parts that match the search words; shortened around the first hit
export function highlightParts(text, tokens, max = 90) {
  text = String(text ?? '');
  const { key, map } = normaliseWithMap(text);
  const marks = [];
  for (const t of tokens) {
    let from = 0;
    for (;;) {
      const at = key.indexOf(t, from);
      if (at < 0) break;
      marks.push([map[at], map[at + t.length - 1] + 1]);
      from = at + t.length;
    }
  }
  marks.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const m of marks) {
    const last = merged[merged.length - 1];
    if (last && m[0] <= last[1]) last[1] = Math.max(last[1], m[1]);
    else merged.push([...m]);
  }
  let start = 0, end = text.length;
  if (text.length > max && merged.length) {
    start = Math.max(0, merged[0][0] - 25);
    end = Math.min(text.length, start + max);
  }
  const parts = [];
  if (start > 0) parts.push({ text: '… ', hit: false });
  let pos = start;
  for (const [a, b] of merged) {
    if (b <= start || a >= end) continue;
    const s = Math.max(a, start), e = Math.min(b, end);
    if (s > pos) parts.push({ text: text.slice(pos, s), hit: false });
    parts.push({ text: text.slice(s, e), hit: true });
    pos = e;
  }
  if (pos < end) parts.push({ text: text.slice(pos, end), hit: false });
  if (end < text.length) parts.push({ text: ' …', hit: false });
  return parts;
}

export const OPEN_SEARCH_EVENT = 'open-global-search';
export const openGlobalSearch = () => window.dispatchEvent(new Event(OPEN_SEARCH_EVENT));
