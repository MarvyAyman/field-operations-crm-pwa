import { inputClass, lookupsFor, lookupLabel, LOOKUP, OTHER } from '../data.js';
import { Field } from './ui.jsx';

// The person questions, shared by "head of the family" (add-family form) and "family member" (person form).
//   get(key) / set(key) -> read / change a field.   lookups = all lookup_values.
//   nameLabel : label of the name field.   showRelation : members only (the head is the head).
export default function PersonFields({ get, set, lookups, nameLabel = 'الاسم *', namePlaceholder, showRelation = false, nameRef }) {
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
          <option value={OTHER}>آخر...</option>
        </select>
      </Field>
      {get('confessor_id') === OTHER && (
        <Field label="اسم أب الاعتراف">
          <input type="text" value={get('confessor_other')} onChange={set('confessor_other')} className={inputClass} placeholder="اكتب اسم أب الاعتراف" />
        </Field>
      )}
      <Field label="تاريخ الميلاد">
        <input type="date" value={get('birth_date')} onChange={set('birth_date')} className={inputClass} />
      </Field>
    </>
  );
}
