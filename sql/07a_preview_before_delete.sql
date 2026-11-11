-- معاينة فقط (لا تغيّر شيئاً): كام صف موجود دلوقتي في كل جدول، وتواريخ إدخاله.
-- شغّليه في Supabase -> SQL Editor قبل ملف الحذف 07b.
-- لو فيه بيانات أدخلتيها يدوياً من التطبيق (مش من الإكسيل) هتتمسح معاهم، فراجعي الأرقام.
select 'areas' as tbl, count(*) filter (where deleted_at is null) as live, min(created_at) as first_created, max(created_at) as last_created from public.areas
union all select 'streets',   count(*) filter (where deleted_at is null), min(created_at), max(created_at) from public.streets
union all select 'buildings', count(*) filter (where deleted_at is null), min(created_at), max(created_at) from public.buildings
union all select 'families',  count(*) filter (where deleted_at is null), min(created_at), max(created_at) from public.families
union all select 'people',    count(*) filter (where deleted_at is null), min(created_at), max(created_at) from public.people
union all select 'visits',    count(*) filter (where deleted_at is null), min(created_at), max(created_at) from public.visits
union all select 'confessor lookups (hidden)', count(*) filter (where active = false), null, null from public.lookup_values where list_key ~* 'confess'
order by 1;
