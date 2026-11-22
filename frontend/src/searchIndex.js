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
    const joined = (kinds) => list.filter((x) => kinds.includes(x.kind)).map((x) => x.key).join('\n');
    families.push({
      id: f.id, name: f.family_name || '', address, pending: Boolean(f._pending), segs: list,
      all: list.map((x) => x.key).join('\n'),
      // the text each filter looks in
      by: { families: joined(['name']), people: joined(['person', 'detail']), notes: joined(['notes', 'detail']), phones: joined(['phone', 'detail']) },
    });
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
  // every distinct word (3+ letters) in the database: used to find the closest words to a mistyped one
  const vocab = new Set();
  const addWords = (k) => { for (const w of k.split(/\s+/)) if (w.length >= 3 && !/^\d+$/.test(w)) vocab.add(w); };
  for (const f of families) for (const sg of f.segs) addWords(sg.key);
  for (const p of places) addWords(p.key);
  return { families, places, vocab: [...vocab] };
}

// the index is rebuilt only when one of the tables it reads really changed (opening the panel again costs nothing)
const INDEX_TABLES = ['areas', 'streets', 'buildings', 'families', 'people', 'family_phones', 'family_internal_notes', 'visits', 'lookup_values'];
let lastIn = null;
let lastIndex = null;
export function cachedIndex(data) {
  if (lastIn && INDEX_TABLES.every((t) => lastIn[t] === data[t])) return lastIndex;
  lastIndex = buildIndex(data);
  lastIn = Object.fromEntries(INDEX_TABLES.map((t) => [t, data[t]]));
  return lastIndex;
}
export { INDEX_TABLES };

// the search words: normalised, a leading "ال" is dropped ("الامير" finds "امير" and "الأمير")
export const tokensOf = (query) => searchKey(query).split(' ').filter(Boolean).map((t) => (t.startsWith('ال') && t.length > 4 ? t.slice(2) : t));

const hasWordStart = (key, tok) => key.startsWith(tok) || key.includes(` ${tok}`);

// edit distance (a swap of two neighbouring letters counts as one mistake), giving up early once above `max`
function within(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return Infinity;
  let prev2 = null;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (prev2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return Infinity;
    prev2 = prev;
    prev = cur;
  }
  return prev[b.length] <= max ? prev[b.length] : Infinity;
}

// for each search word (5+ letters): the closest words that really exist in the data
function closeWords(vocab, tokens, minLen) {
  const alts = new Map();
  for (const t of tokens) {
    if (t.length < minLen) continue;
    const max = t.length >= 7 ? 2 : 1;
    const found = [];
    for (const w of vocab) {
      if (w === t) continue;
      const d = within(t, w, max);
      if (d <= max) found.push([d, w]);
    }
    found.sort((x, y) => x[0] - y[0]);
    if (found.length) alts.set(t, found.slice(0, 25).map((x) => x[1]));
  }
  return alts;
}

const FILTER_KINDS = {
  all: null, families: ['name'], people: ['person', 'detail'], notes: ['notes', 'detail'], phones: ['phone', 'detail'],
};

function collectFamilies(index, tokens, alts, filter) {
  const kinds = FILTER_KINDS[filter];
  const found = (text, t) => text.includes(t) || (alts?.get(t) || []).some((w) => text.includes(w));
  const out = [];
  for (const f of index.families) {
    const text = kinds ? f.by[filter] : f.all;
    if (!tokens.every((t) => found(text, t))) continue;
    let score = 0;
    for (const t of tokens) {
      let best = 9;
      for (const sg of f.segs) {
        if (kinds && !kinds.includes(sg.kind)) continue;
        const words = [t, ...(alts?.get(t) || [])];
        words.forEach((w, k) => {
          if (!sg.key.includes(w)) return;
          const v = sg.weight + (hasWordStart(sg.key, w) ? 0 : 0.5) + (k > 0 ? 1 : 0);
          if (v < best) best = v;
        });
      }
      score += best;
    }
    out.push({ f, score });
  }
  out.sort((a, b) => a.score - b.score || a.f.name.localeCompare(b.f.name, 'ar'));
  return out;
}

// why did it match? the segments (other than name / address, which the row shows anyway) holding the words
function describe(f, tokens, alts, filter) {
  const kinds = FILTER_KINDS[filter];
  const snippets = [];
  for (const t of tokens) {
    const words = [t, ...(alts?.get(t) || [])];
    if (filter !== 'people' && filter !== 'families' && words.some((w) => searchKey(f.name).includes(w))) continue;
    if (filter === 'families') continue;
    const sg = f.segs.find((x) => x.kind !== 'name' && x.kind !== 'address' && (!kinds || kinds.includes(x.kind)) && words.some((w) => x.key.includes(w)));
    if (sg && !snippets.includes(sg)) snippets.push(sg);
  }
  const shown = snippets.filter((x) => !(x.kind === 'person' && snippets.some((y) => y.kind === 'detail' && y.label === x.text)));
  return { id: f.id, name: f.name, address: f.address, pending: f.pending, snippets: shown.slice(0, 3) };
}

// filter: all | families | people | notes | phones | areas | streets | buildings
export function runSearch(index, query, { filter = 'all', maxFamilies = 40, maxPlaces = 6 } = {}) {
  const tokens = tokensOf(query);
  if (!tokens.length) return null;
  const placeType = { areas: 'area', streets: 'street', buildings: 'building' }[filter];
  const wantFamilies = !placeType;
  const wantPlaces = filter === 'all' || Boolean(placeType);
  const limitPlaces = placeType ? 40 : maxPlaces;

  const placesFor = (alts) => {
    const hits = { area: [], street: [], building: [] };
    const found = (text, t) => text.includes(t) || (alts?.get(t) || []).some((w) => text.includes(w));
    for (const p of index.places) {
      if (placeType && p.type !== placeType) continue;
      if (hits[p.type].length < limitPlaces && tokens.every((t) => found(p.key, t))) hits[p.type].push(p);
    }
    return hits;
  };

  const exact = wantFamilies ? collectFamilies(index, tokens, null, filter) : [];
  let hits = wantPlaces ? placesFor(null) : { area: [], street: [], building: [] };
  const placeCount = hits.area.length + hits.street.length + hits.building.length;

  // few exact results: also offer the closest words in the data (typos, different spelling)
  let similar = [];
  let alts = null;
  if (exact.length + placeCount < 8) {
    // short words (4 letters) are only corrected when they come with other words, or when nothing else was found
    const tryAlts = (minLen) => {
      const a = closeWords(index.vocab, tokens, minLen);
      if (!a.size) return null;
      const have = new Set(exact.map((x) => x.f.id));
      const fam = wantFamilies ? collectFamilies(index, tokens, a, filter).filter((x) => !have.has(x.f.id)) : [];
      const more = wantPlaces ? placesFor(a) : null;
      const extraPlaces = more ? Object.keys(more).reduce((n, k) => n + more[k].filter((x) => !hits[k].some((h) => h.id === x.id)).length, 0) : 0;
      return fam.length || extraPlaces ? { a, fam, more } : null;
    };
    const got = tryAlts(tokens.length > 1 ? 4 : 5) || (exact.length + placeCount === 0 ? tryAlts(4) : null);
    if (got) {
      alts = got.a;
      similar = got.fam;
      if (got.more) {
        for (const k of Object.keys(hits)) {
          const ids = new Set(hits[k].map((x) => x.id));
          hits[k] = [...hits[k], ...got.more[k].filter((x) => !ids.has(x.id))];
        }
      }
    }
  }
  const words = [...tokens, ...[...(alts?.values() || [])].flat()];
  return {
    tokens: words,
    total: exact.length,
    families: exact.slice(0, maxFamilies).map(({ f }) => describe(f, tokens, null, filter)),
    similar: similar.slice(0, 15).map(({ f }) => describe(f, tokens, alts, filter)),
    areas: hits.area, streets: hits.street, buildings: hits.building,
  };
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
