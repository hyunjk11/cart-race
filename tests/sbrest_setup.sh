#!/usr/bin/env bash
# Local stand-in for the Supabase REST API to check supabase/schema.sql + the client query shapes (tests/sbrest.test.mjs).
# Needs postgresql (apt install postgresql) and the PostgREST static binary in /tmp/postgrest. Uses port 5499 (pg) / 3099 (rest).
set -e
P=$(ls -d /usr/lib/postgresql/*/bin | tail -1); R=$(cd "$(dirname "$0")/.." && pwd)
rm -rf /tmp/pgd && $P/initdb -D /tmp/pgd -U postgres >/dev/null && $P/pg_ctl -D /tmp/pgd -o "-p 5499 -k /tmp" -l /tmp/pg.log start >/dev/null; sleep 2
psql -h /tmp -p 5499 -U postgres -q -v ON_ERROR_STOP=1 <<'SQL'
create role anon nologin; create role authenticated nologin; create role authenticator login noinherit; grant anon, authenticated to authenticator;
create schema auth; create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid $$;
grant usage on schema auth to anon, authenticated; grant usage on schema public to anon, authenticated;
insert into auth.users values ('11111111-1111-1111-1111-111111111111','a@x'),('22222222-2222-2222-2222-222222222222','b@x');
SQL
for i in 1 2; do psql -h /tmp -p 5499 -U postgres -q -v ON_ERROR_STOP=1 -f "$R/supabase/schema.sql" 2>/dev/null; done  # twice: idempotent
printf 'db-uri = "postgres://authenticator@/postgres?host=/tmp&port=5499"\ndb-schemas = "public"\ndb-anon-role = "anon"\njwt-secret = "local-test-secret-local-test-secret-1234"\nserver-port = 3099\n' > /tmp/pgrst.conf
(/tmp/postgrest /tmp/pgrst.conf > /tmp/pgrst.log 2>&1 &); sleep 2; echo "ready: node tests/sbrest.test.mjs"
