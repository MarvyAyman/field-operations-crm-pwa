-- تقرير فقط (لا يغيّر شيئاً): كيف مسجّلة صلة القرابة حالياً؟
-- شغّليه أولاً في Supabase -> SQL Editor. النتيجة جدول واحد:
--   "من القائمة"  = الفرد مربوط بصلة من القائمة  | "نص حر (آخر)" = مكتوبة كنص | "بدون صلة" = فاضية
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
