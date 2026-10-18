// Real supabase-js (vendor bundle) vs local PostgREST 12 + Postgres 17 loaded with supabase/schema.sql (setup: tests/sbrest_setup.sh). Not in CI.
import crypto from 'crypto';
const { createClient } = await import(new URL('../vendor/supabase.mjs', import.meta.url));
const SECRET = 'local-test-secret-local-test-secret-1234';
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (sub, role = 'authenticated') => { const h = b64({ alg: 'HS256', typ: 'JWT' }), p = b64({ sub, role, exp: Math.floor(Date.now() / 1e3) + 3600 }); return `${h}.${p}.` + crypto.createHmac('sha256', SECRET).update(`${h}.${p}`).digest('base64url'); };
const mk = sub => createClient('http://sb.local', 'sb_publishable_x', { accessToken: async () => (sub ? jwt(sub) : jwt(undefined, 'anon')), realtime: { transport: class { constructor() {} close() {} } }, global: { fetch: (u, o) => fetch(String(u).replace('http://sb.local/rest/v1', 'http://localhost:3099'), o) } });
let fails = 0; const ok = (c, m, x) => (c ? console.log('ok  ', m) : (fails++, console.log('FAIL', m, JSON.stringify(x))));
const A = '11111111-1111-1111-1111-111111111111', B = '22222222-2222-2222-2222-222222222222';
const a = mk(A), b = mk(B), anon = mk(null);
for (const [n, c] of [['auth', a], ['anon', anon]]) {
  const r = await Promise.all([['cart_progress', 'user_id'], ['cart_profiles', 'id'], ['cart_records', 'map']].map(([t, col]) => c.from(t).select(col).limit(1)));
  ok(r.every(x => !x.error || x.error.code === '42501'), n + ' table probe ok', r.map(x => x.error));
}
const miss = await a.from('cart_nope').select('id').limit(1);
ok(miss.error && (miss.status === 404 || ['PGRST205', '42P01'].includes(miss.error.code)), 'missing table detected', [miss.status, miss.error]);
let r = await a.from('cart_progress').upsert({ user_id: A, data: { v: 1, coins: 123 }, merged: true }, { onConflict: 'user_id' }); ok(!r.error, 'upsert own progress', r.error);
r = await a.from('cart_progress').upsert({ user_id: A, data: { v: 1, coins: 124 }, merged: true }, { onConflict: 'user_id' }); ok(!r.error, 'upsert again (update path)', r.error);
r = await a.from('cart_progress').select('data, merged').eq('user_id', A).maybeSingle(); ok(r.data?.data?.coins === 124, 'read own progress', r);
r = await b.from('cart_progress').select('data, merged').eq('user_id', A).maybeSingle(); ok(!r.error && r.data === null, 'B cannot read A', r);
r = await b.from('cart_progress').upsert({ user_id: A, data: {}, merged: true }, { onConflict: 'user_id' }); ok(!!r.error, 'B cannot overwrite A', r.error);
r = await a.from('cart_profiles').upsert({ id: A, nickname: '에이' }, { onConflict: 'id' }); ok(!r.error, 'upsert own profile', r.error);
r = await a.from('cart_profiles').select('nickname').eq('id', A).maybeSingle(); ok(r.data?.nickname === '에이', 'read profile', r);
r = await a.rpc('cart_submit_lap', { p_map: 'freezer', p_lap_ms: 41000, p_nickname: '에이', p_char: 'mango' }); ok(!r.error && r.data === 41000, 'rpc submit lap', r);
r = await anon.rpc('cart_submit_lap', { p_map: 'freezer', p_lap_ms: 4000, p_nickname: 'x', p_char: null }); ok(!!r.error, 'anon cannot submit', r.error);
r = await anon.from('cart_records').select('map, lap_ms, nickname, char').eq('map', 'freezer').order('lap_ms', { ascending: true }).limit(20); ok(!r.error && r.data[0]?.lap_ms === 41000 && !('user_id' in r.data[0]), 'anon leaderboard', r);
r = await anon.from('cart_records').select('user_id'); ok(!!r.error, 'user_id not public', r.error);
console.log(fails ? 'FAIL ' + fails : 'REST TESTS PASS');
