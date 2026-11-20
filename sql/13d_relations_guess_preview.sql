-- معاينة فقط (لا تغيّر شيئاً): كام فرد ممكن نحدد صلة قرابته تلقائي من رقم الفرد ونوعه؟
-- القاعدة (بتتطبق بس على اللي صلتهم فاضية تماماً):
--   1) رقم الفرد 1                                        => رب الأسرة
--   2) رقم الفرد 2 + أنثى + ورقم 1 في نفس الأسرة ذكر     => زوج / زوجة
--   3) (اختيارية، مش داخلة في ملف التطبيق) باقي الأرقام: ذكر => ابن ، أنثى => ابنة
select rule, count(*) as people
from (
  select case
           when p.person_no = '1' then '1) رقم 1 => رب الأسرة'
           when p.person_no = '2' and p.gender = 'female' and h.gender = 'male' then '2) رقم 2 أنثى (والرقم 1 ذكر) => زوجة'
           when p.person_no ~ '^[0-9]+$' and p.person_no::int >= 3 and p.gender in ('male','female') then '3) رقم 3+ => ابن/ابنة حسب النوع (اختياري، تخمين)'
           else '— مش هيتغير (يتراجع يدوياً)'
         end as rule
  from public.people p
  left join public.people h on h.family_id = p.family_id and h.person_no = '1' and h.deleted_at is null
  where p.deleted_at is null and p.relation_id is null and nullif(btrim(p.extra->>'relation_other'), '') is null
) t
group by rule order by rule;
