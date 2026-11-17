-- Run once against the existing hosted database; preserves existing ownership RLS.
create or replace function public.liftlog_save(expected_payload jsonb, next_payload jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare current_payload jsonb; who uuid := auth.uid();
begin
  if who is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if next_payload is null or jsonb_typeof(next_payload) <> 'object' then raise exception 'Invalid payload'; end if;
  -- Serialize first-row creation too; every caller for the same account takes this lock.
  perform pg_advisory_xact_lock(hashtextextended(who::text, 0));
  select payload into current_payload from public.user_data where user_id=who for update;
  if current_payload is distinct from expected_payload then
    return jsonb_build_object('saved',false,'payload',current_payload);
  end if;
  insert into public.user_data(user_id,payload,updated_at) values(who,next_payload,clock_timestamp())
    on conflict(user_id) do update set payload=excluded.payload,updated_at=excluded.updated_at;
  return jsonb_build_object('saved',true);
end $$;
revoke all on function public.liftlog_save(jsonb,jsonb) from public, anon;
grant execute on function public.liftlog_save(jsonb,jsonb) to authenticated;
