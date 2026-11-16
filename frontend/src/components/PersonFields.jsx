import { inputClass, lookupsFor, lookupLabel, LOOKUP, OTHER } from '../data.js';
import { Plus, X } from 'lucide-react';
import { Field } from './ui.jsx';

// The person questions, shared by "head of the family" (add-family form) and "family member" (person form).
//   get(key) / set(key) -> read / change a field.   lookups = all lookup_values.
//   nameLabel : label of the name field.   showRelation : members only (the head is the head).
export default function PersonFields({ get, set, lookups, nameLabel = 'الاسم *', namePlaceholder, showRelation = false, showContact = false, nameRef }) {
  const gender = get('gender');
  const relations = lookupsFor(lookups, LOOKUP.relation);
  const statuses = lookupsFor(lookups, LOOKUP.personStatus);
  const maritals = lookupsFor(lookups, LOOKUP.marital);
  const confessors = lookupsFor(lookups, LOOKUP.confessor);

  const select = (key, label, options, empty = '—') => (
    <Field label={label}>
      <select value={get(key)} onChange={set(key)} className={inputClass}>
        <option value="">{options.length ? empty : '— لا توجد قائمة —'}</option>
        {options.map((o) => <option key={o.id} value={o.id}>{lookupLabel(o, gender)}</option>)}
      </select>
    </Field>
  );

  return (
    <>
      <Field label={nameLabel}>
        <input ref={nameRef} type="text" value={get('full_name')} onChange={set('full_name')} className={inputClass} placeholder={namePlaceholder} />
      </Field>

      <Field label="النوع">
        <select value={gender} onChange={set('gender')} className={inputClass}>
          <option value="">—</option>
          <option value="male">ذكر</option>
          <option value="female">أنثى</option>
        </select>
      </Field>

      {showRelation && (
        <>
          <Field label="صلة القرابة (برب الأسرة)">
            <select value={get('relation_id')} onChange={set('relation_id')} className={inputClass}>
              <option value="">—</option>
              {relations.map((o) => <option key={o.id} value={o.id}>{lookupLabel(o, gender)}</option>)}
              <option value={OTHER}>آخر...</option>
            </select>
          </Field>
          {get('relation_id') === OTHER && (
            <Field label="اكتب صلة القرابة">
              <input type="text" value={get('relation_other')} onChange={set('relation_other')} className={inputClass} placeholder="مثال: زوج الابنة" />
            </Field>
          )}
        </>
      )}
      {statuses.length > 0 && select('status_id', 'الحالة', statuses)}
      {maritals.length > 0 && select('marital_status_id', 'الحالة الاجتماعية', maritals)}

      <Field label="الوظيفة">
        <input type="text" value={get('job')} onChange={set('job')} className={inputClass} />
      </Field>
      <Field label="أب الاعتراف">
        <select value={get('confessor_id')} onChange={set('confessor_id')} className={inputClass}>
          <option value="">—</option>
          {confessors.map((o) => <option key={o.id} value={o.id}>{lookupLabel(o, gender)}</option>)}
          <option value={OTHER}>آخر ...</option>
        </select>
      </Field>
      {get('confessor_id') === OTHER && (
        <Field label="اسم أب الاعتراف">
          <input type="text" value={get('confessor_other')} onChange={set('confessor_other')} className={inputClass} placeholder="اكتب اسم أب الاعتراف" />
        </Field>
      )}
      {/* more than one confessor: each extra one is its own row */}
      {(get('confessor_more') || []).map((c, i) => {
        const rows = get('confessor_more');
        const change = (patch) => set('confessor_more')({ target: { value: rows.map((r, j) => (j === i ? { ...r, ...patch } : r)) } });
        return (
          <div key={i} className="space-y-2">
            <Field label={`أب اعتراف آخر (${i + 2})`}>
              <div className="flex gap-2">
                <select value={c.v} onChange={(e) => change({ v: e.target.value })} className={inputClass}>
                  <option value="">—</option>
                  {confessors.map((o) => <option key={o.id} value={o.id}>{lookupLabel(o, gender)}</option>)}
                  <option value={OTHER}>آخر ...</option>
                </select>
                <button
                  type="button"
                  aria-label="حذف أب الاعتراف"
                  onClick={() => set('confessor_more')({ target: { value: rows.filter((_, j) => j !== i) } })}
                  className="px-3 rounded-lg border bg-white text-red-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </Field>
            {c.v === OTHER && (
              <input type="text" value={c.other} onChange={(e) => change({ other: e.target.value })} className={inputClass} placeholder="اكتب اسم أب الاعتراف" />
            )}
          </div>
        );
      })}
      <button
        type="button"
        onClick={() => set('confessor_more')({ target: { value: [...(get('confessor_more') || []), { v: '', other: '' }] } })}
        className="w-full bg-white border-2 border-dashed border-navy/30 text-navy font-bold p-3 rounded-xl flex items-center justify-center gap-2"
      >
        <Plus className="w-4 h-4" /> إضافة أب اعتراف آخر
      </button>

      <Field label="تاريخ الميلاد">
        <input type="date" value={get('birth_date')} onChange={set('birth_date')} className={inputClass} />
      </Field>

      {showContact && (
        <>
          <Field label="رقم الموبايل">
            <input type="tel" inputMode="tel" dir="ltr" value={get('phone')} onChange={set('phone')} className={inputClass} placeholder="01xxxxxxxxx" />
          </Field>
          <Field label="موبايل آخر">
            <input type="tel" inputMode="tel" dir="ltr" value={get('phone2')} onChange={set('phone2')} className={inputClass} />
          </Field>
          <Field label="ملاحظات">
            <textarea rows={3} value={get('notes')} onChange={set('notes')} className={inputClass} />
          </Field>
        </>
      )}
    </>
  );
}
