create schema if not exists platform;

revoke all on schema platform from public;
revoke all on schema platform from anon;
revoke all on schema platform from authenticated;

alter default privileges in schema platform revoke all on tables from public;
alter default privileges in schema platform revoke all on tables from anon;
alter default privileges in schema platform revoke all on tables from authenticated;

alter default privileges in schema platform revoke execute on functions from public;
alter default privileges in schema platform revoke execute on functions from anon;
alter default privileges in schema platform revoke execute on functions from authenticated;
