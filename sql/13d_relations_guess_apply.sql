-- يطبّق القاعدتين الآمنتين فقط على الأفراد اللي صلتهم فاضية تماماً:
--   رقم 1 => رب الأسرة  |  رقم 2 أنثى (والرقم 1 في نفس الأسرة ذكر) => زوج / زوجة
-- لازم تكون شغّلتي 13b قبله (عشان الصلات تكون موجودة في القائمة).
-- القاعدة الثالثة (ابن/ابنة) مش مطبّقة هنا عن قصد؛ عشان ممكن يطلع في الأسرة أب أو أخ أو حفيد.
-- شغّلي 13d_relations_guess_preview.sql الأول وشوفي الأرقام.
with rel as (
  select
    (select id from public.lookup_values where list_key ~* 'relation' and label = 'رب الأسرة' and active limit 1) as head_id,
    (select id from public.lookup_values where list_key ~* 'relation' and label = 'زوج' and active limit 1) as spouse_id
), pick as (
  select p.id,
         case when p.person_no = '1' then rel.head_id
              when p.person_no = '2' and p.gender = 'female' and h.gender = 'male' then rel.spouse_id end as rid
  from public.people p
  cross join rel
  left join public.people h on h.family_id = p.family_id and h.person_no = '1' and h.deleted_at is null
  where p.deleted_at is null and p.relation_id is null and nullif(btrim(p.extra->>'relation_other'), '') is null
)
update public.people p
   set relation_id = pick.rid, updated_at = now()
  from pick
 where p.id = pick.id and pick.rid is not null;

-- النتيجة: كام فرد لسه بدون صلة، وكام لكل صلة
select coalesce(l.label, '— بدون صلة —') as relation, count(*) as people
from public.people p left join public.lookup_values l on l.id = p.relation_id
where p.deleted_at is null group by 1 order by 2 desc;
