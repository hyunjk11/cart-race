// Fake supabase-js createClient for tests/account.py (no network, no emails). Server state lives in localStorage '__mockdb'
// so it survives reloads; flags in localStorage '__mockflags' ({offline, noTables, confirm}). Installed as window.__cartSupabaseMock.
(() => {
  const db = () => JSON.parse(localStorage.getItem('__mockdb') || '{"users":{},"cart_profiles":{},"cart_progress":{},"cart_records":{},"calls":[]}');
  const put = d => localStorage.setItem('__mockdb', JSON.stringify(d));
  const flags = () => JSON.parse(localStorage.getItem('__mockflags') || '{}');
  const log = c => { const d = db(); d.calls.push(c); put(d); };
  const netErr = () => ({ data: null, error: { message: 'TypeError: Failed to fetch', name: 'AuthRetryableFetchError', status: 0 } });
  window.__cartSupabaseMock = (url, key, opts) => {
    const SK = opts.auth.storageKey, subs = [];
    const emit = (ev, s) => subs.forEach(f => f(ev, s));
    const sess = () => JSON.parse(localStorage.getItem(SK) || 'null');
    const mk = u => ({ access_token: 'tok-' + u.id, user: { id: u.id, email: u.email, identities: [{}] } });
    const auth = {
      onAuthStateChange(cb) { subs.push(cb); setTimeout(() => cb('INITIAL_SESSION', sess()), 0); return { data: { subscription: { unsubscribe() {} } } }; },
      async getSession() { return { data: { session: sess() }, error: null }; },
      async signUp({ email, password }) {
        log('signUp'); if (flags().offline) return netErr();
        const d = db();
        if (password.length < 6) return { data: {}, error: { code: 'weak_password', message: 'Password should be at least 6 characters.' } };
        if (Object.values(d.users).some(u => u.email === email)) return { data: { user: { id: 'x', identities: [] }, session: null }, error: null };
        const u = { id: 'u' + Math.random().toString(36).slice(2, 10), email, password }; d.users[u.id] = u; put(d);
        if (flags().confirm) return { data: { user: { id: u.id, email, identities: [{}] }, session: null }, error: null };
        const s = mk(u); localStorage.setItem(SK, JSON.stringify(s)); emit('SIGNED_IN', s); return { data: { user: s.user, session: s }, error: null };
      },
      async signInWithPassword({ email, password }) {
        log('signIn'); if (flags().offline) return netErr();
        const u = Object.values(db().users).find(u => u.email === email);
        if (!u || u.password !== password) return { data: { user: null, session: null }, error: { code: 'invalid_credentials', message: 'Invalid login credentials', status: 400 } };
        const s = mk(u); localStorage.setItem(SK, JSON.stringify(s)); emit('SIGNED_IN', s); return { data: { user: s.user, session: s }, error: null };
      },
      async signOut() { log('signOut'); localStorage.removeItem(SK); emit('SIGNED_OUT', null); return { error: null }; },
    };
    const uid = () => sess()?.user?.id || null;
    const pk = { cart_profiles: 'id', cart_progress: 'user_id' };
    function from(t) {
      const q = { t, f: [], op: 'select', lim: null, ord: null, single: false };
      const run = async () => {
        log(q.op + ':' + t);
        if (flags().offline) return { data: null, error: { message: 'TypeError: Failed to fetch' }, status: 0 };
        if (flags().noTables) return { data: null, error: { code: 'PGRST205', message: `Could not find the table 'public.${t}' in the schema cache` }, status: 404 };
        const d = db();
        if (q.op === 'upsert') {
          const row = q.row, id = row[pk[t]];
          if (!uid() || id !== uid()) return { data: null, error: { code: '42501', message: 'new row violates row-level security policy' }, status: 403 };
          d[t][id] = { ...(d[t][id] || {}), ...row, updated_at: Date.now() }; put(d); return { data: null, error: null, status: 201 };
        }
        let rows = Object.values(d[t]);
        if (t !== 'cart_records') rows = rows.filter(r => r[pk[t]] === uid()); // RLS: own rows only
        for (const [c, v] of q.f) rows = rows.filter(r => r[c] === v);
        if (q.ord) rows.sort((a, b) => a[q.ord] - b[q.ord]);
        if (q.lim != null) rows = rows.slice(0, q.lim);
        if (t === 'cart_records') rows = rows.map(({ map, lap_ms, nickname, char }) => ({ map, lap_ms, nickname, char }));
        if (q.head) return { data: null, error: null, status: 200 };
        return { data: q.single ? rows[0] || null : rows, error: null, status: 200 };
      };
      const b = {
        select(c, o) { q.head = !!o?.head; return b; }, eq(c, v) { q.f.push([c, v]); return b; }, order(c) { q.ord = c; return b; },
        limit(n) { q.lim = n; return b; }, maybeSingle() { q.single = true; return run(); },
        upsert(row) { q.op = 'upsert'; q.row = row; return run(); }, then(res, rej) { return run().then(res, rej); },
      };
      return b;
    }
    async function rpc(fn, a) {
      log('rpc:' + fn); if (flags().offline) return { data: null, error: { message: 'TypeError: Failed to fetch' } };
      if (flags().noTables) return { data: null, error: { code: 'PGRST202', message: 'not found' } };
      const d = db(), k = uid() + ':' + a.p_map, o = d.cart_records[k];
      d.cart_records[k] = { user_id: uid(), map: a.p_map, lap_ms: o ? Math.min(o.lap_ms, a.p_lap_ms) : a.p_lap_ms, nickname: a.p_nickname, char: a.p_char };
      put(d); return { data: d.cart_records[k].lap_ms, error: null };
    }
    return { auth, from, rpc };
  };
})();
