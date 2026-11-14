-- "تمت الزيارة بواسطة ..." : اسم العضو في جدول الأعضاء + مين سجّل الزيارة.
-- شغّليه في Supabase -> SQL Editor *قبل* ما ترفعي الكود الجديد. آمن لو اتشغّل أكتر من مرة.

alter table public.members add column if not exists full_name text;
alter table public.visits  add column if not exists created_by uuid;

-- الزيارات القديمة: نعتبر آخر من عدّلها هو من سجّلها (أقرب معلومة موجودة)
update public.visits set created_by = updated_by where created_by is null and updated_by is not null;

-- اكتبي اسم كل عضو (غيّري الإيميل والاسم). لو اسم فاضي بيظهر الجزء الأول من الإيميل.
-- update public.members set full_name = 'مارفي' where email = 'maro30ayman@gmail.com';
-- update public.members set full_name = 'اسم الخادم' where email = 'email@example.com';

select email, full_name, role, active from public.members order by email;
