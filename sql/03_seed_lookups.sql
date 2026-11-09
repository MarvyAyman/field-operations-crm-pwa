-- Dropdown lists used by the new family / person form.
-- Run it ONCE in Supabase -> SQL Editor.
-- Safe to run again: a list is only added when no list with a similar name exists yet
-- (so it never duplicates lists you already have). It does NOT touch existing rows.
--
-- Lists created:   contract_type  (نوع العقد)
--                  person_status  (الحالة: مقيم / مسافر / متنيح)
--                  marital_status (الحالة الاجتماعية)
-- "أب الاعتراف" (list key: confessor) is NOT seeded: add your priests' names yourself, e.g.
--   insert into public.lookup_values (church_id, list_key, code, label, active, sort_order)
--   select id, 'confessor', 'fr_1', 'أبونا فلان', true, 1 from public.churches limit 1;

do $$
declare
  v_church uuid;
begin
  select id into v_church from public.churches order by created_at limit 1;
  if v_church is null then
    select church_id into v_church from public.members where church_id is not null limit 1;
  end if;
  if v_church is null then
    raise exception 'No church found: add your row to public.members (02_add_me_as_admin.sql) first.';
  end if;

  if not exists (select 1 from public.lookup_values where list_key ~* 'contract') then
    insert into public.lookup_values (church_id, list_key, code, label, label_f, active, sort_order) values
      (v_church, 'contract_type', 'owner', 'ملك',   'ملك',   true, 1),
      (v_church, 'contract_type', 'rent',  'إيجار', 'إيجار', true, 2);
  end if;

  if not exists (select 1 from public.lookup_values where list_key ~* 'status' and list_key !~* '(visit|marital)') then
    insert into public.lookup_values (church_id, list_key, code, label, label_f, active, sort_order) values
      (v_church, 'person_status', 'resident',  'مقيم',   'مقيمة',  true, 1),
      (v_church, 'person_status', 'traveling', 'مسافر',  'مسافرة', true, 2),
      (v_church, 'person_status', 'deceased',  'متنيح',  'متنيحة', true, 3);
  end if;

  if not exists (select 1 from public.lookup_values where list_key ~* 'marital') then
    insert into public.lookup_values (church_id, list_key, code, label, label_f, active, sort_order) values
      (v_church, 'marital_status', 'single',    'أعزب',  'عزباء',  true, 1),
      (v_church, 'marital_status', 'married',   'متزوج', 'متزوجة', true, 2),
      (v_church, 'marital_status', 'widowed',   'أرمل',  'أرملة',  true, 3),
      (v_church, 'marital_status', 'separated', 'منفصل', 'منفصلة', true, 4);
  end if;
end $$;
