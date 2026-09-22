begin;

create index if not exists
  person_external_profiles_person_only_idx
on djm_os.person_external_profiles (
  person_id
);

commit;
