-- قائمة آباء الاعتراف: هذه الأسماء التسعة فقط (+ "آخر ..." يضيفها التطبيق تلقائياً).
-- شغّليه مرة واحدة في Supabase -> SQL Editor. آمن لو شغّلتيه أكتر من مرة.
-- أي اسم قديم في قائمة أب الاعتراف يتم "إخفاؤه" (active = false) ولا يُحذف،
-- فالأشخاص المسجلون به من قبل يحتفظون باسمه.
-- (updated_at بيتحدّث عشان الأجهزة اللي اتزامنت قبل كده تاخد التغيير.)

do $$
declare
  v_church uuid;
  v_key text;
  names text[] := array[
    'ابونا بيشوي وديع',
    'ابونا موسي واصف',
    'ابونا يوسف صبري',
    'ابونا دانيال ماهر',
    'ابونا بنيامين اسكندر',
    'ابونا سوريال انيس',
    'ابونا هدرا مجدي',
    'ابونا مارتيروس فيكتور',
    'ابونا يوليوس كامل'
  ];
  i int;
begin
  select id into v_church from public.churches order by created_at limit 1;
  if v_church is null then
    select church_id into v_church from public.members where church_id is not null limit 1;
  end if;
  if v_church is null then
    raise exception 'No church found: add your row to public.members (02_add_me_as_admin.sql) first.';
  end if;

  -- use the list key already in your table, if there is one
  select list_key into v_key from public.lookup_values where list_key ~* 'confess' limit 1;
  v_key := coalesce(v_key, 'confessor');

  for i in 1 .. array_length(names, 1) loop
    if exists (select 1 from public.lookup_values where list_key = v_key and label = names[i]) then
      update public.lookup_values
         set active = true, sort_order = i, updated_at = now()
       where list_key = v_key and label = names[i];
    else
      insert into public.lookup_values (church_id, list_key, code, label, label_f, active, sort_order)
      values (v_church, v_key, 'confessor_' || i, names[i], names[i], true, i);
    end if;
  end loop;

  -- hide every other confessor entry
  update public.lookup_values
     set active = false, updated_at = now()
   where list_key ~* 'confess' and active and not (label = any (names));
end $$;
