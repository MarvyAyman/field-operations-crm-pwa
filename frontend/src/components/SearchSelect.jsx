import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ChevronDown, Plus, X } from 'lucide-react';
import { inputClass, searchKey } from '../data.js';

const MAX_SHOWN = 60;

// A dropdown you can type in.
//   options   : [{ value, label, hint? }]            value : the chosen option's value ('' = nothing)
//   onChange(value)                                   onCreate(text) : adds a new item with the typed text (optional)
//   valueLabel: label to show for a value that is not in `options` (e.g. a new item not saved yet)
// Typing ignores hamza / ي-ى / ة-ه / tashkeel, finds names that START with the text first, then words, then anywhere.
// Keyboard: ↑ ↓ move, Enter picks the marked row, Ctrl+Enter always ADDS the typed text as new, Esc closes.
// When nothing matches, the "add" row is the marked one, so Enter adds it straight away.
export default function SearchSelect({
  options, value, onChange, onCreate, createLabel = 'جديد', placeholder = '— اختر —', disabled = false,
  valueLabel = '', allowClear = true, autoFocus = false,
}) {
  const uid = useId();
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [active, setActive] = useState(0);

  // normalised once per options change -> typing stays instant even with hundreds of rows
  const indexed = useMemo(() => options.map((o) => ({ ...o, key: searchKey(o.label) })), [options]);
  const selected = indexed.find((o) => o.value === value);
  const shownLabel = selected?.label || valueLabel || '';

  const q = searchKey(text);
  const { rows, exact } = useMemo(() => {
    if (!q) return { rows: indexed.slice(0, MAX_SHOWN), exact: false };
    const tokens = q.split(' ');
    const scored = [];
    let exactHit = false;
    for (let i = 0; i < indexed.length; i += 1) {
      const o = indexed[i];
      if (o.key === q) exactHit = true;
      let score = 0;
      let ok = true;
      for (const t of tokens) {
        const at = o.key.indexOf(t);
        if (at < 0) { ok = false; break; }
        score += at === 0 ? 0 : o.key.includes(` ${t}`) ? 1 : 2;
      }
      if (ok) scored.push({ o, score, i });
    }
    scored.sort((a, b) => a.score - b.score || a.o.key.length - b.o.key.length || a.i - b.i);
    return { rows: scored.slice(0, MAX_SHOWN).map((x) => x.o), exact: exactHit };
  }, [indexed, q]);

  const canCreate = Boolean(onCreate) && q.length > 0 && !exact;
  const total = rows.length + (canCreate ? 1 : 0);

  useEffect(() => {
    if (!open || !listRef.current) return;
    listRef.current.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);
  useEffect(() => { if (autoFocus) inputRef.current?.focus(); }, [autoFocus]);

  const close = () => { setOpen(false); setText(''); setActive(0); };
  const pick = (v) => { onChange(v); close(); };
  const create = () => { if (canCreate) { onCreate(text.trim()); close(); } };
  const choose = (i) => { if (i < rows.length) pick(rows[i].value); else create(); };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); if (!open) setOpen(true); else setActive((i) => Math.min(i + 1, Math.max(total - 1, 0))); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') {
      if (!open) return; // let the form submit
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) create();
      else if (total > 0) choose(rows.length === 0 ? 0 : active);
    } else if (e.key === 'Escape') { if (open) { e.preventDefault(); close(); } }
    else if (e.key === 'Tab') close();
  };

  // with no match the "add" row is the only row; with matches it is the last row
  const rowId = (i) => `${uid}-opt-${i}`;
  const createIndex = rows.length;

  return (
    <div className="relative">
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={`${uid}-list`}
          aria-activedescendant={open && total ? rowId(active) : undefined}
          aria-autocomplete="list"
          autoComplete="off"
          disabled={disabled}
          value={open ? text : shownLabel}
          placeholder={open && shownLabel ? shownLabel : placeholder}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onChange={(e) => { setText(e.target.value); setActive(0); setOpen(true); }}
          onKeyDown={onKeyDown}
          onBlur={close}
          className={`${inputClass} pl-16 disabled:opacity-60`}
        />
        <div className="absolute left-2 top-1/2 -translate-y-1/2 flex items-center gap-1 text-gray-400">
          {allowClear && value && !disabled && (
            <button type="button" aria-label="مسح الاختيار" onMouseDown={(e) => { e.preventDefault(); pick(''); }} className="p-1">
              <X className="w-4 h-4" />
            </button>
          )}
          <ChevronDown className="w-4 h-4 pointer-events-none" />
        </div>
      </div>

      {open && (
        <ul
          id={`${uid}-list`}
          ref={listRef}
          role="listbox"
          className="absolute z-30 mt-1 w-full max-h-64 overflow-auto bg-white border rounded-xl shadow-lg"
        >
          {rows.map((o, i) => (
            <li
              key={o.value}
              id={rowId(i)}
              role="option"
              aria-selected={o.value === value}
              data-active={i === active}
              onMouseDown={(e) => { e.preventDefault(); pick(o.value); }}
              onMouseEnter={() => setActive(i)}
              className={`px-3 py-3 cursor-pointer flex items-center justify-between gap-2 ${i === active ? 'bg-gold/20' : ''} ${o.value === value ? 'font-bold text-maroon' : ''}`}
            >
              <span>{o.label}</span>
              {o.hint && <span className="text-xs text-gray-500">{o.hint}</span>}
            </li>
          ))}
          {rows.length === 0 && !canCreate && <li className="px-3 py-3 text-gray-500 text-sm">لا توجد نتائج</li>}
          {canCreate && (
            <li
              id={rowId(createIndex)}
              role="option"
              aria-selected={false}
              data-active={createIndex === active}
              onMouseDown={(e) => { e.preventDefault(); create(); }}
              onMouseEnter={() => setActive(createIndex)}
              className={`px-3 py-3 cursor-pointer flex items-center gap-2 border-t text-maroon font-bold ${createIndex === active ? 'bg-gold/20' : ''}`}
            >
              <Plus className="w-4 h-4 shrink-0" />
              <span>إضافة «{text.trim()}» {createLabel}</span>
            </li>
          )}
          {canCreate && rows.length > 0 && (
            <li className="hidden md:block px-3 py-1 text-xs text-gray-400 border-t">Enter للاختيار · Ctrl+Enter لإضافة «{text.trim()}» كجديد</li>
          )}
        </ul>
      )}
    </div>
  );
}
