-- الحالة: مقيم / مسافر / متنيح
-- القائمة كانت موجودة عندك قبل كده وفيها "متنيح" بس، فالإضافة الأولى تخطّتها.
-- الملف ده بيضيف/يفعّل الثلاث اختيارات جوّه نفس القائمة الموجودة.
-- شغّليه مرة واحدة في Supabase -> SQL Editor (آمن لو شغّلتيه أكتر من مرة).
-- في الآخر بيعرض نتيجة القائمة عشان تتأكدي.

do $$
declare
  v_church uuid;
  v_key text;
  v_ids text[] := array['resident', 'traveling', 'deceased'];
  names text[]   := array['مقيم', 'مسافر', 'متنيح'];
  names_f text[] := array['مقيمة', 'مسافرة', 'متنيحة'];
  i int;
begin
  -- the same list the app reads: a "status" list that is not the visit status or the marital status
  select list_key, church_id into v_key, v_church
    from public.lookup_values
   where list_key ~* 'status' and list_key !~* '(visit|marital)'
   limit 1;

  if v_key is null then
    v_key := 'person_status';
    select id into v_church from public.churches order by created_at limit 1;
  end if;
  if v_church is null then
    select church_id into v_church from public.members where church_id is not null limit 1;
  end if;

  for i in 1 .. 3 loop
    if exists (select 1 from public.lookup_values where list_key = v_key and label = names[i]) then
      update public.lookup_values
         set active = true, sort_order = i,
             label_f = case when label_f is null or label_f = label then names_f[i] else label_f end,
             updated_at = now()
       where list_key = v_key and label = names[i];
    else
      insert into public.lookup_values (church_id, list_key, code, label, label_f, active, sort_order)
      values (v_church, v_key, v_ids[i], names[i], names_f[i], true, i);
    end if;
  end loop;
end $$;

-- النتيجة: لازم تشوفي مقيم / مسافر / متنيح
select list_key, label, label_f, active, sort_order
  from public.lookup_values
 where list_key ~* 'status' and list_key !~* '(visit|marital)'
 order by sort_order;
