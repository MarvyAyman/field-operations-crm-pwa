-- الأفراد اللي صلة قرابتهم لسه مكتوبة كنص حر غير معروف ("آخر") أو فاضية: عشان تعرفي أماكنهم وتعدّليهم.
-- كل صف = فرد: المنطقة / الشارع / المبنى / الأسرة / الاسم / الصلة المكتوبة. للتعديل افتحي الأسرة في التطبيق (تعديل الفرد).
-- عشان تحوّلي نص معين لصلة من القائمة دفعة واحدة: غيّري الأسطر في الجزء الأخير (مفعّل بإزالة --) .
select
  case when a.kind = 'other_church' then a.name else 'منطقة ' || a.area_no end as place,
  s.name as street, b.house_no as building, f.family_name as family, p.person_no, p.full_name as person, p.gender,
  coalesce(nullif(btrim(p.extra->>'relation_other'), ''), '— فاضية —') as written_relation
from public.people p
join public.families f on f.id = p.family_id
left join public.buildings b on b.id = f.building_id
left join public.streets s on s.id = b.street_id
left join public.areas a on a.id = s.area_id
where p.deleted_at is null and p.relation_id is null
order by (nullif(btrim(p.extra->>'relation_other'), '') is null), written_relation, place, street, building, f.family_name, length(p.person_no), p.person_no
limit 500;

-- ---- تحويل نص معيّن لصلة من القائمة (مثال): شيلي -- من الأسطر دي وعدّلي النص والصلة ----
-- update public.people p
--    set relation_id = (select id from public.lookup_values where list_key ~* 'relation' and label = 'ابن' and active limit 1),
--        extra = nullif(p.extra - 'relation_other', '{}'::jsonb), updated_at = now()
--  where p.deleted_at is null and p.relation_id is null and btrim(p.extra->>'relation_other') = 'النص زي ما ظاهر في التقرير';
