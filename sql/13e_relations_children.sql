-- الأفراد رقم 3 وما بعده => ابن / ابنة (حسب النوع). بيطبّق فقط على اللي صلتهم فاضية تماماً.
-- شغّليه بعد 13b و 13d_apply. الأفراد اللي نوعهم مش متسجل بيتسابوا (مش بنخمّن النوع).
-- ملاحظة: لو في الأسرة أب أو أخ أو حفيد برقم 3+ هيتسجلوا ابن/ابنة غلط، وتعدّليهم يدوي من التطبيق.
update public.people p
   set relation_id = (select id from public.lookup_values where list_key ~* 'relation' and label = 'ابن' and active limit 1),
       updated_at = now()
 where p.deleted_at is null
   and p.relation_id is null
   and nullif(btrim(p.extra->>'relation_other'), '') is null
   and p.person_no ~ '^[0-9]+$' and p.person_no::int >= 3
   and p.gender in ('male', 'female');

-- النتيجة: كام فرد لكل صلة، وكام لسه بدون صلة
select coalesce(l.label, '— بدون صلة —') as relation, count(*) as people
from public.people p left join public.lookup_values l on l.id = p.relation_id
where p.deleted_at is null group by 1 order by 2 desc;
