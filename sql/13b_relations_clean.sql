-- 1) يضيف صلات القرابة الأساسية (آمن لو شغّلتيه أكتر من مرة، ولا يخفي أي صلة موجودة).
--    كل صلة مزدوجة مذكر/مؤنث والتطبيق بيعرض الصيغة حسب نوع الفرد:
--      رب الأسرة | زوج / زوجة | ابن / ابنة | أب / أم | أخ / أخت
-- 2) يحوّل النصوص الحرة ("آخر") المعروفة إلى الصلة الصحيحة من القائمة، بعد توحيد الإملاء
--    (أ/ا، ة/ه، ى/ي، المسافات، التشكيل)، مثلاً: "الزوجة" و"زوجه" و"زوجتي" => زوج / زوجة.
--    النصوص غير المعروفة بتتساب كما هي، وبتطلع في 13c عشان تراجعيها.
-- بعد التشغيل: افتحي التطبيق أونلاين مرة عشان القائمة والتعديلات تتزامن.

do $$
declare
  v_church uuid;
  v_key text;
  masc text[] := array['رب الأسرة', 'زوج',  'ابن',  'أب', 'أخ'];
  fem  text[] := array['رب الأسرة', 'زوجة', 'ابنة', 'أم', 'أخت'];
  i int;
begin
  select id into v_church from public.churches order by created_at limit 1;
  if v_church is null then
    select church_id into v_church from public.members where church_id is not null limit 1;
  end if;
  if v_church is null then raise exception 'No church found'; end if;

  select list_key into v_key from public.lookup_values where list_key ~* 'relation' limit 1;
  v_key := coalesce(v_key, 'relation');

  for i in 1 .. array_length(masc, 1) loop
    if exists (select 1 from public.lookup_values where list_key = v_key and (label = masc[i] or label = fem[i])) then
      update public.lookup_values
         set label = masc[i], label_f = fem[i], active = true, sort_order = i, updated_at = now()
       where id = (select id from public.lookup_values where list_key = v_key and (label = masc[i] or label = fem[i]) order by active desc limit 1);
    else
      insert into public.lookup_values (church_id, list_key, code, label, label_f, active, sort_order)
      values (v_church, v_key, 'relation_' || i, masc[i], fem[i], true, i);
    end if;
  end loop;

  -- النص الحر -> صلة من القائمة
  with alias(t, target) as (values
    ('ربالاسره','رب الأسرة'), ('ربعائله','رب الأسرة'), ('ربالعائله','رب الأسرة'), ('ربالبيت','رب الأسرة'), ('ربالاسرهالاب','رب الأسرة'),
    ('زوج','زوج'), ('الزوج','زوج'), ('زوجي','زوج'), ('زوجها','زوج'),
    ('زوجه','زوج'), ('الزوجه','زوج'), ('زوجتي','زوج'), ('زوجته','زوج'), ('قرينه','زوج'),
    ('ابن','ابن'), ('الابن','ابن'), ('ولد','ابن'), ('الولد','ابن'), ('ابني','ابن'), ('ابنه','ابن'), ('الابنه','ابن'), ('ابنتي','ابن'), ('بنت','ابن'), ('البنت','ابن'),
    ('اب','أب'), ('الاب','أب'), ('ابي','أب'), ('والد','أب'), ('الوالد','أب'), ('ابوه','أب'),
    ('ام','أب'), ('الام','أب'), ('امي','أب'), ('والده','أب'), ('الوالده','أب'),
    ('اخ','أخ'), ('الاخ','أخ'), ('اخي','أخ'), ('اخت','أخ'), ('الاخت','أخ'), ('اختي','أخ')
  ),
  hit as (
    select p.id, l.id as rel_id
    from public.people p
    join alias a on a.t = translate(regexp_replace(coalesce(p.extra->>'relation_other', ''), '[ً-ٰٟـ\s]', '', 'g'), 'أإآىةؤئ', 'ااايهوي')
    join public.lookup_values l on l.list_key = v_key and l.label = a.target and l.active
    where p.deleted_at is null and p.relation_id is null
  )
  update public.people p
     set relation_id = hit.rel_id,
         extra = nullif(p.extra - 'relation_other', '{}'::jsonb),
         updated_at = now()
    from hit
   where p.id = hit.id;
end $$;

-- النتيجة بعد التنظيف (نفس شكل التقرير 13a)
select kind, label, count(*) as people
from (
  select case
           when p.relation_id is not null then 'من القائمة'
           when nullif(btrim(p.extra->>'relation_other'), '') is not null then 'نص حر (آخر)'
           else 'بدون صلة'
         end as kind,
         coalesce(l.label || case when l.label_f is distinct from l.label then ' / ' || l.label_f else '' end || case when l.active then '' else ' (مخفية)' end,
                  nullif(btrim(p.extra->>'relation_other'), ''), '—') as label
  from public.people p
  left join public.lookup_values l on l.id = p.relation_id
  where p.deleted_at is null
) t
group by kind, label
order by kind, people desc;
