-- حذف بيانات الاستيراد القديم (المناطق/الشوارع/العمارات/الأسر/الأفراد/الزيارات/الأرقام/الملاحظات).
-- شغّليه مرة واحدة في Supabase -> SQL Editor بعد ما تراجعي 07a. كله في عملية واحدة: لو حصل خطأ ما يتمسح شيء.
--
-- الحذف "ناعم" (deleted_at) عشان الموبايلات اللي اتزامنت قبل كده تشيل البيانات القديمة هي كمان
-- في المزامنة القادمة، بدل ما تفضل عندها. الأسماء/القوائم (آباء الاعتراف التسعة، الحالة، القرابة) ما بتتمسحش.
-- ما بيتمسح كمان: أسماء آباء الاعتراف القديمة المخفية (active = false) اللي أضافها الاستيراد القديم.
--
-- ⚠️ بيمسح كل بيانات الكنيسة دي، حتى اللي أدخلتيه يدوياً من التطبيق.

do $$
declare
  v_church uuid := null;   -- سيبيها null لو عندك كنيسة واحدة، أو حطي الـ id هنا
  v_now timestamptz := now();
  n int;
begin
  if v_church is null then
    select count(*) into n from public.churches;
    if n <> 1 then
      raise exception 'عندك % كنيسة: حطي الـ id بتاع الكنيسة في v_church فوق.', n;
    end if;
    select id into v_church from public.churches;
  end if;

  update public.visits       set deleted_at = v_now, updated_at = v_now where church_id = v_church and deleted_at is null;
  update public.family_phones set deleted_at = v_now, updated_at = v_now where church_id = v_church and deleted_at is null;
  update public.people       set deleted_at = v_now, updated_at = v_now where church_id = v_church and deleted_at is null;
  update public.families     set deleted_at = v_now, updated_at = v_now where church_id = v_church and deleted_at is null;
  update public.buildings    set deleted_at = v_now, updated_at = v_now where church_id = v_church and deleted_at is null;
  update public.streets      set deleted_at = v_now, updated_at = v_now where church_id = v_church and deleted_at is null;
  update public.areas        set deleted_at = v_now, updated_at = v_now where church_id = v_church and deleted_at is null;

  -- ملاحظات الأسر الداخلية ملهاش deleted_at: بتتمسح فعلياً (مفيش أسرة تظهر بيها بعد كده)
  delete from public.family_internal_notes where church_id = v_church;

  -- آباء الاعتراف القدام المخفيين (اللي أنشأهم الاستيراد القديم). التسعة الأساسيين active = true فمش بيتأثروا.
  delete from public.lookup_values where church_id = v_church and list_key ~* 'confess' and active = false;

  raise notice 'تم الحذف للكنيسة %', v_church;
end $$;

-- تأكيد: كل الأعداد لازم تبقى صفر
select (select count(*) from public.people   where deleted_at is null) as people_left,
       (select count(*) from public.families where deleted_at is null) as families_left,
       (select count(*) from public.buildings where deleted_at is null) as buildings_left;
