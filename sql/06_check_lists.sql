-- فحص: شغّليه في Supabase -> SQL Editor وابعتيلي النتيجة (صورة أو نسخ) لو لسه فيه مشكلة في القوائم.
select list_key, label, active, sort_order, updated_at
  from public.lookup_values
 where list_key ~* '(confess|status)'
 order by list_key, active desc, sort_order;
