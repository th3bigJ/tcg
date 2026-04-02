do $$
declare
  col record;
  constraint_name text;
begin
  select data_type, udt_schema, udt_name
    into col
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'customer_wishlists'
    and column_name = 'target_printing';

  if not found then
    raise notice 'public.customer_wishlists.target_printing not found; skipping migration';
    return;
  end if;

  for constraint_name in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'customer_wishlists'
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%target_printing%'
  loop
    execute format('alter table public.customer_wishlists drop constraint %I', constraint_name);
  end loop;

  if col.data_type = 'USER-DEFINED' then
    alter table public.customer_wishlists
      alter column target_printing type text
      using target_printing::text;
  elsif col.data_type <> 'text' then
    alter table public.customer_wishlists
      alter column target_printing type text
      using target_printing::text;
  end if;
end $$;
