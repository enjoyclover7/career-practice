create table public.practice_records (
  user_id uuid not null references auth.users(id) on delete cascade,
  question_id text not null check (question_id ~ '^q[0-9]{3}$'),
  kind text not null check (kind in ('drafts','assessments','learning')),
  value jsonb not null,
  mutation_id uuid not null,
  updated_at timestamptz not null default now(),
  primary key (user_id,question_id,kind),
  constraint valid_practice_value check (coalesce((
    (kind='drafts' and jsonb_typeof(value)='string' and char_length(value #>> '{}')<=50000)
    or (kind='assessments' and value in ('"known"'::jsonb,'"uncertain"'::jsonb,'"unknown"'::jsonb))
    or (kind='learning' and (value='null'::jsonb or (
      jsonb_typeof(value)='object' and jsonb_typeof(value->'answerText')='string'
      and char_length(btrim(value->>'answerText'))>0 and char_length(value->>'answerText')<=50000
      and jsonb_typeof(value->'tipText')='string' and char_length(value->>'tipText')<=10000
      and value - 'answerText' - 'tipText' = '{}'::jsonb
    )))
  ),false))
);
alter table public.practice_records enable row level security;
revoke all on public.practice_records from public,anon,authenticated;
grant select,insert,update on public.practice_records to authenticated;
create policy own_records_select on public.practice_records for select to authenticated using ((select auth.uid())=user_id);
create policy own_records_insert on public.practice_records for insert to authenticated with check ((select auth.uid())=user_id);
create policy own_records_update on public.practice_records for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create function public.save_practice_record(owner_id uuid,question text,record_kind text,payload jsonb,mutation uuid)
returns void language plpgsql security invoker set search_path='' as $$
begin
  if owner_id is distinct from auth.uid() or auth.uid() is null then
    raise exception 'Account mismatch' using errcode='42501';
  end if;
  insert into public.practice_records(user_id,question_id,kind,value,mutation_id,updated_at)
  values(owner_id,question,record_kind,coalesce(payload,'null'::jsonb),mutation,statement_timestamp())
  on conflict(user_id,question_id,kind) do update
    set value=excluded.value,mutation_id=excluded.mutation_id,updated_at=excluded.updated_at
    where practice_records.mutation_id is distinct from excluded.mutation_id;
end;
$$;
revoke all on function public.save_practice_record(uuid,text,text,jsonb,uuid) from public,anon;
grant execute on function public.save_practice_record(uuid,text,text,jsonb,uuid) to authenticated;
