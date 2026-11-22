import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Search, X, MapPin, Building2, Route } from 'lucide-react';
import { useAuth } from '../auth.jsx';
import { useTables } from '../data.js';
import { cachedIndex, INDEX_TABLES, runSearch, highlightParts, OPEN_SEARCH_EVENT } from '../searchIndex.js';

function Hl({ text, tokens, max }) {
  return highlightParts(text, tokens, max).map((p, i) =>
    p.hit ? <mark key={i} className="bg-gold/40 text-inherit rounded px-0.5">{p.text}</mark> : <span key={i}>{p.text}</span>);
}

const FILTERS = [
  ['all', 'الكل'], ['families', 'الأسر'], ['people', 'الأفراد'], ['streets', 'الشوارع'],
  ['buildings', 'المباني'], ['areas', 'المناطق'], ['notes', 'الملاحظات'], ['phones', 'التليفونات'],
];
const HINTS = {
  all: 'اكتب أي جزء من اسم أسرة أو فرد (الزوجة، الأبناء…) أو شارع أو مبنى أو رقم تليفون أو ملاحظة.',
  families: 'ابحث في أسماء الأسر فقط.', people: 'ابحث في أسماء الأفراد (الزوجة والأبناء وغيرهم) ووظائفهم.',
  streets: 'ابحث عن شارع.', buildings: 'ابحث عن رقم مبنى أو اتجاهه.', areas: 'ابحث عن منطقة أو كنيسة.',
  notes: 'ابحث في ملاحظات الأسر والعمارات والأفراد والزيارات.', phones: 'ابحث برقم تليفون (بأي شكل كتابة).',
};

function Panel({ onClose }) {
  const { data, loading } = useTables(INDEX_TABLES);
  const index = useMemo(() => (loading ? null : cachedIndex(data)), [data, loading]);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const deferred = useDeferredValue(query);
  const result = useMemo(() => (index ? runSearch(index, deferred, { filter }) : null), [index, deferred, filter]);
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const navigate = useNavigate();

  // one flat list, so the arrow keys walk through everything
  const items = useMemo(() => {
    if (!result) return [];
    return [
      ...result.families.map((f) => ({ ...f, kind: 'family', to: `/family/${f.id}` })),
      ...result.similar.map((f) => ({ ...f, kind: 'family', to: `/family/${f.id}` })),
      ...result.areas.map((p) => ({ ...p, kind: 'place', to: `/area/${p.id}` })),
      ...result.streets.map((p) => ({ ...p, kind: 'place', to: `/street/${p.id}` })),
      ...result.buildings.map((p) => ({ ...p, kind: 'place', to: `/building/${p.id}` })),
    ];
  }, [result]);

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);
  useEffect(() => { listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' }); }, [active]);

  const onInputKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, items.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter' && items[active]) { e.preventDefault(); navigate(items[active].to); onClose(); }
  };

  const tokens = result?.tokens || [];
  const row = (it, i) => (
    <Link
      key={`${it.kind}${it.id}${it.to}`}
      to={it.to}
      onClick={onClose}
      data-active={i === active}
      onMouseEnter={() => setActive(i)}
      className={`block p-3 rounded-xl border-2 ${i === active ? 'border-gold bg-gold/10' : 'border-transparent bg-white shadow-sm'}`}
    >
      {it.kind === 'family' ? (
        <>
          <span className="font-bold text-navy text-lg block"><Hl text={it.name} tokens={tokens} />{it.pending && <span className="text-xs bg-gold/30 rounded-full px-2 py-0.5 mr-2">لم يُرسل بعد</span>}</span>
          {it.address && <span className="block text-sm text-gray-500"><Hl text={it.address} tokens={tokens} /></span>}
          {it.snippets.map((sg, k) => (
            <span key={k} className="block text-sm text-gray-700 mt-1">
              {sg.label && <span className="text-maroon font-bold">{sg.label}: </span>}
              <Hl text={sg.text} tokens={tokens} />
            </span>
          ))}
        </>
      ) : (
        <span className="flex items-center gap-2 text-navy">
          {it.type === 'area' ? <MapPin className="w-5 h-5 shrink-0" /> : it.type === 'street' ? <Route className="w-5 h-5 shrink-0" /> : <Building2 className="w-5 h-5 shrink-0" />}
          <span>
            <span className="font-bold block"><Hl text={it.title} tokens={tokens} /></span>
            {it.sub && <span className="text-sm text-gray-500">{it.sub}</span>}
          </span>
        </span>
      )}
    </Link>
  );

  let n = 0;
  const section = (title, list) => list.length > 0 && (
    <section>
      <h2 className="text-sm font-bold text-gray-500 mb-2">{title}</h2>
      <div className="space-y-2">{list.map((it) => row(it, n++))}</div>
    </section>
  );
  const nExact = result?.families.length ?? 0;
  const fams = items.filter((i) => i.kind === 'family').slice(0, nExact);
  const similar = items.filter((i) => i.kind === 'family').slice(nExact);
  const pick = (type) => items.filter((i) => i.kind === 'place' && i.to.startsWith(`/${type}/`));

  return (
    <div className="fixed inset-0 z-50 bg-gray-50 flex flex-col" role="dialog" aria-modal="true" aria-label="بحث">
      <header className="bg-navy text-white p-4 rounded-b-2xl shadow-md">
        <div className="flex items-center gap-2 max-w-2xl mx-auto">
          <div className="relative flex-1">
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setActive(0); }}
              onKeyDown={onInputKey}
              enterKeyHint="search"
              autoComplete="off"
              placeholder="ابحث في كل شيء: اسم، شارع، مبنى، تليفون، ملاحظة..."
              className="w-full p-3 pr-10 rounded-xl text-navy bg-white focus:outline-none"
            />
            <Search className="absolute right-3 top-3 text-gray-400 w-5 h-5" />
          </div>
          <button type="button" onClick={onClose} className="p-3 rounded-full bg-white/10" aria-label="إغلاق البحث"><X className="w-5 h-5" /></button>
        </div>
        <div role="group" aria-label="نوع البحث" className="max-w-2xl mx-auto mt-3 flex gap-2 overflow-x-auto whitespace-nowrap [scrollbar-width:none]">
          {FILTERS.map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-pressed={filter === id}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { setFilter(id); setActive(0); inputRef.current?.focus(); }}
              className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold ${filter === id ? 'bg-gold text-navy' : 'bg-white/10 text-white/90 active:bg-white/25'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </header>
      <div ref={listRef} className="flex-1 overflow-y-auto p-4">
        <div className="max-w-2xl mx-auto space-y-5">
          {loading && <p className="text-center text-gray-500">جاري التحميل...</p>}
          {!loading && !result && (
            <p className="text-center text-gray-500 mt-8">{HINTS[filter]}<br />يمكن كتابة أكثر من كلمة بأي ترتيب، والبحث يتحمّل أخطاء الكتابة.</p>
          )}
          {result && items.length === 0 && <p className="text-center text-gray-500 mt-8">لا توجد نتائج</p>}
          {result && result.total > fams.length && <p className="text-xs text-gray-500">{result.total} أسرة مطابقة، أول {fams.length} فقط — أضف كلمة لتضييق البحث.</p>}
          {section(`الأسر (${result?.total ?? 0})`, fams)}
          {section('نتائج قريبة من كلامك', similar)}
          {section('المناطق والكنائس', pick('area'))}
          {section('الشوارع', pick('street'))}
          {section('المباني', pick('building'))}
        </div>
      </div>
    </div>
  );
}

// the full-screen search; opened from the bottom bar's search tab (or the home page's search box)
// Keeps the in-memory tables and the search index warm while the user is signed in (idle time only), so the search
// panel and every page open instantly instead of reading the whole local database on demand.
function Warmer() {
  const { data, loading } = useTables(INDEX_TABLES);
  useEffect(() => {
    if (loading) return undefined;
    const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 200));
    const cancel = window.cancelIdleCallback || clearTimeout;
    const id = idle(() => cachedIndex(data));
    return () => cancel(id);
  }, [data, loading]);
  return null;
}

export default function GlobalSearch() {
  const { user } = useAuth();
  const location = useLocation();
  // the page the search was opened on: moving to another page (even with the back button) closes it
  const [openedOn, setOpenedOn] = useState(null);
  const open = openedOn === location.pathname;
  const setOpen = (v) => setOpenedOn(v ? location.pathname : null);
  useEffect(() => {
    const show = () => setOpenedOn(window.location.pathname);
    window.addEventListener(OPEN_SEARCH_EVENT, show);
    return () => window.removeEventListener(OPEN_SEARCH_EVENT, show);
  }, []);
  if (!user || location.pathname === '/login') return null;
  return (
    <>
      <Warmer />
      {open && <Panel onClose={() => setOpen(false)} />}
    </>
  );
}
