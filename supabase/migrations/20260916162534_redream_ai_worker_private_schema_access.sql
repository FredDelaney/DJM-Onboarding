-- Invoker-rights workers must resolve their explicitly granted private helpers.
-- USAGE does not grant EXECUTE, table access, or expose this schema to PostgREST.
grant usage on schema private to service_role;
