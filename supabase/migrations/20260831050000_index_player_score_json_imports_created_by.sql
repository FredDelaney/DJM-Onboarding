-- Cover the creator foreign key used by score-import audit and cleanup queries.
do $migration$
begin
  if to_regclass('djm_os.player_score_json_imports') is not null then
    execute 'create index if not exists player_score_json_imports_created_by_idx on djm_os.player_score_json_imports(created_by)';
  end if;
end;
$migration$;
