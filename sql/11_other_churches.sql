-- كنائس أخرى + "الأسرة انتقلت". شغّليه في Supabase -> SQL Editor *قبل* رفع الكود. آمن لو اتشغّل أكتر من مرة.
--   areas.kind : 'own' = منطقتنا (الافتراضي) ، 'other_church' = كنيسة انتقلت لها أسر
--   areas.name : اسم الكنيسة (للكنائس الأخرى فقط)
--   families.moved : الأسرة انتقلت إلى كنيسة أخرى
alter table public.areas    add column if not exists kind text not null default 'own';
alter table public.areas    add column if not exists name text;
alter table public.families add column if not exists moved boolean not null default false;

select (select count(*) from public.areas where kind = 'own') as own_areas,
       (select count(*) from public.areas where kind = 'other_church') as other_churches,
       (select count(*) from public.families where moved) as moved_families;
