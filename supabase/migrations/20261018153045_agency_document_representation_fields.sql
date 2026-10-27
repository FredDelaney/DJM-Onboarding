-- Extend reviewed representation snapshots with explicit contract variables.
-- Other document kinds retain their existing field and banking-data boundaries.
create or replace function private.document_studio_snapshot(p_doc public.agency_documents)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare keys text[]; fields jsonb; brand jsonb;
begin
  keys:=case p_doc.kind
    when 'player_contract' then array['player_name','player_dob','agent_name','agent_licence','start_date','end_date','commission','commercial_commission','excluded_income','agent_notice_contact','player_notice_contact','data_protection_law','dispute_resolution','governing_law','enforcement_courts']
    when 'mandate' then array['principal_name','principal_type','player_name','territory','start_date','end_date','commission']
    when 'agency_pitch' then array['player_name','player_club','position','purpose']
    when 'invoice' then array['invoice_number','recipient_name','recipient_address','recipient_email','issue_date','due_date','currency','tax_rate','payment_url','reference']
    else array['player_name','player_club','position','recipient_name','report_date','author'] end;
  select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) into fields from jsonb_each(p_doc.content->'fields') where key=any(keys);
  select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) into brand from jsonb_each(p_doc.content->'brand')
    where key=any(array['name','legalName','logoUrl','primary','accent','email','phone','website','address','registration']) or (key='bankDetails' and p_doc.kind='invoice');
  return jsonb_build_object('title',p_doc.title,'kind',p_doc.kind,'status','ready','content',jsonb_build_object(
    'brand',brand,'fields',fields,'sections',p_doc.content->'sections','sources',p_doc.content->'sources',
    'lines',case when p_doc.kind='invoice' then p_doc.content->'lines' else '[]'::jsonb end,'reviewed',true));
end $$;
revoke all on function private.document_studio_snapshot(public.agency_documents) from public,anon,authenticated;

