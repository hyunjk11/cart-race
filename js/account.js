/**
 * account.js — 👤 계정: optional Supabase email+password login and cloud save (cart_profiles / cart_progress / cart_records).
 * Guest play never needs it: supabase-js (vendor/supabase.mjs) is only loaded when the panel is opened or a saved session exists.
 * Sync: the whole save (progress.js snapshot) is upserted debounced after any synced localStorage write and right after a race;
 * failures/offline keep a persistent dirty flag and retry with backoff. First login on a device merges the guest save once.
 * If the tables are missing (supabase/schema.sql not run yet), login still works and progress stays on this device.
 */
import { SUPABASE } from './config/supabase.js';
import { MAPS } from './config/maps.js';
import { COINS } from './config/parts.js';
import { ROSTER } from './config/characters.js';
import { LS, DEBUG } from './store.js';
import * as P from './progress.js';
import { $, escHtml } from './util.js';

const T = SUPABASE.tables,
  AUTH_KEY = 'cartSbAuth', // supabase-js session storage key
  K_UID = 'cartAcctUid', // account whose save is currently in localStorage ('' = guest)
  K_GUEST = 'cartGuestSave', // guest save from before login (restored on sign-out)
  K_DIRTY = 'cartSyncDirty',
  K_LAPS = 'cartLapQueue',
  mergedKey = uid => 'cartMerged_' + uid;

let api = {},
  sb = null,
  sbP = null,
  user = null,
  tables = 'unknown', // unknown | ok | missing | error
  sync = 'idle', // idle | saving | saved | pending | offline | error | local
  lastSaved = 0,
  applying = false,
  timer = 0,
  retry = 0,
  seq = 0,
  busy = false,
  tab = 'acct',
  boardMap = null,
  msg = ['', false];

const sbAuthStored = () => {
  try {
    return !!localStorage.getItem(AUTH_KEY);
  } catch (e) {
    return false;
  }
};
const st = { get: k => LS.get(k), set: (k, v) => LS.set(k, v), keys: () => LS.keys() };
const snap = () => P.snapshot(st, COINS.start);

/** Korean message for a Supabase/auth/network error. */
export function koErr(e) {
  const c = String(e?.code || e?.error_code || ''),
    m = String(e?.message || e || '');
  if (c === 'invalid_credentials' || /invalid login credentials/i.test(m)) return '이메일 또는 비밀번호가 맞지 않아요.';
  if (c === 'email_not_confirmed' || /email not confirmed/i.test(m))
    return '이메일 인증이 아직 안 됐어요. 받은 메일의 확인 링크를 누른 뒤 다시 로그인해 주세요.';
  if (c === 'user_already_exists' || c === 'email_exists' || /already registered|already been registered/i.test(m))
    return '이미 가입된 이메일이에요. 로그인해 주세요.';
  if (c === 'weak_password' || /password should|password.*(at least|characters)/i.test(m))
    return '비밀번호가 너무 약해요. 6자 이상으로 정해 주세요.';
  if (c === 'email_address_invalid' || /invalid format|email address .* is invalid|validate email/i.test(m))
    return '이메일 형식이 올바르지 않아요.';
  if (c === 'signup_disabled' || /signups not allowed/i.test(m)) return '지금은 새 회원가입이 막혀 있어요.';
  if (c.startsWith('over_') || /rate limit|too many/i.test(m) || e?.status === 429)
    return '요청이 너무 많아요. 잠시 후 다시 시도해 주세요.';
  if (/failed to fetch|network|load failed|fetch/i.test(m) || (typeof navigator !== 'undefined' && navigator.onLine === false))
    return '인터넷에 연결할 수 없어요. 연결을 확인하고 다시 시도해 주세요.';
  return '문제가 생겼어요: ' + (m || c || '알 수 없는 오류');
}

async function loadClient() {
  let create;
  if (DEBUG && window.__cartSupabaseMock) create = window.__cartSupabaseMock;
  else create = (await import('supabase')).createClient;
  sb = create(SUPABASE.url, SUPABASE.key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: AUTH_KEY },
  });
  sb.auth.onAuthStateChange((ev, session) => {
    // don't await supabase calls inside this callback (supabase-js deadlock note)
    setTimeout(() => onAuth(ev, session), 0);
  });
  const { data } = await sb.auth.getSession();
  if (data?.session?.user && !user) await onLogin(data.session.user);
  else if (!data?.session && LS.get(K_UID)) restoreGuest(); // session expired/removed elsewhere
  return sb;
}
/** Load supabase-js + create the client once. */
export function ensureClient() {
  if (!sbP)
    sbP = loadClient().catch(e => {
      sbP = null;
      throw e;
    });
  return sbP;
}

function onAuth(ev, session) {
  if (ev === 'SIGNED_OUT') {
    if (user) restoreGuest();
  } else if (session?.user && (!user || user.id !== session.user.id) && (ev === 'SIGNED_IN' || ev === 'INITIAL_SESSION'))
    onLogin(session.user);
}

async function checkTables() {
  const r = await Promise.all([T.progress, T.profiles, T.records].map(t => sb.from(t).select('*', { head: true }).limit(1)));
  const bad = r.find(x => x.error);
  if (!bad) return (tables = 'ok');
  const e = bad.error;
  tables = e.code === 'PGRST205' || e.code === '42P01' || bad.status === 404 ? 'missing' : 'error';
  return tables;
}

function writeLocal(fn) {
  applying = true;
  try {
    fn();
  } finally {
    applying = false;
  }
}
function replaceLocal(d) {
  writeLocal(() => {
    for (const k of LS.keys()) if (k && k.startsWith(P.BEST_PREFIX)) LS.del(k);
    P.apply(st, d);
  });
}

async function onLogin(u) {
  if (user && user.id === u.id) return;
  user = u;
  const cur = LS.get(K_UID) || '';
  if (cur && cur !== u.id) restoreGuest(true); // another account's save is on this device
  if (!LS.get(K_UID)) writeLocal(() => LS.set(K_GUEST, JSON.stringify(snap())));
  writeLocal(() => LS.set(K_UID, u.id));
  render();
  await checkTables().catch(() => (tables = 'error'));
  if (tables !== 'ok') {
    sync = 'local';
    render();
    if (tables === 'error') setTimeout(() => user && loadCloud(), 15000);
    return;
  }
  await loadCloud();
}

/** Pull the cloud save and reconcile with this device (merge once, then cloud is the source of truth). */
async function loadCloud() {
  if (!user) return;
  if (tables !== 'ok' && (await checkTables().catch(() => 'error')) !== 'ok') return render();
  const uid = user.id;
  try {
    const { data: row, error } = await sb.from(T.progress).select('data, merged').eq('user_id', uid).maybeSingle();
    if (error) throw error;
    const local = snap(),
      cloud = row?.data || null;
    let d;
    if (LS.get(mergedKey(uid)) !== '1') {
      d = P.merge(local, cloud);
      writeLocal(() => LS.set(mergedKey(uid), '1'));
      for (const [m, t] of Object.entries(d.best)) queueLap(m, t, d.char, true);
    } else if (LS.get(K_DIRTY) === '1' || !cloud)
      d = local; // unsynced changes made while logged in win
    else d = P.merge({}, cloud);
    replaceLocal(d);
    api.onApplied?.();
    await loadProfile();
    if (!cloud || JSON.stringify(cloud) !== JSON.stringify(snap())) await save(true);
    else {
      sync = 'saved';
      lastSaved = Date.now();
    }
    flushLaps();
  } catch (e) {
    sync = 'error';
    msg = [koErr(e), true];
    schedule(true);
  }
  render();
}

async function loadProfile() {
  const { data, error } = await sb.from(T.profiles).select('nickname').eq('id', user.id).maybeSingle();
  if (error) throw error;
  if (data?.nickname) writeLocal(() => LS.set(P.K.nick, data.nickname));
  else await saveProfile(LS.get(P.K.nick) || (user.email || '플레이어').split('@')[0].slice(0, 10));
  const n = $('nick');
  if (n && LS.get(P.K.nick)) n.value = LS.get(P.K.nick);
}
async function saveProfile(nick) {
  nick =
    String(nick || '')
      .trim()
      .slice(0, 10) || '플레이어';
  writeLocal(() => LS.set(P.K.nick, nick));
  if (!user || tables !== 'ok') return nick;
  const { error } = await sb.from(T.profiles).upsert({ id: user.id, nickname: nick }, { onConflict: 'id' });
  if (error) throw error;
  return nick;
}

function schedule(isRetry) {
  clearTimeout(timer);
  if (!user) return;
  const ms = isRetry ? SUPABASE.retryMs[Math.min(retry++, SUPABASE.retryMs.length - 1)] : SUPABASE.saveDebounceMs;
  timer = setTimeout(() => save(), ms);
}
/** Upsert the save now. */
async function save(force) {
  clearTimeout(timer);
  if (!user || !sb) return false;
  if (tables !== 'ok') {
    sync = 'local';
    render();
    return false;
  }
  if (!force && LS.get(K_DIRTY) !== '1') return true;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    sync = 'offline';
    render();
    return false;
  }
  const my = ++seq;
  sync = 'saving';
  render();
  try {
    const { error } = await sb.from(T.progress).upsert({ user_id: user.id, data: snap(), merged: true }, { onConflict: 'user_id' });
    if (error) throw error;
    retry = 0;
    lastSaved = Date.now();
    if (my === seq) {
      LS.set(K_DIRTY, '0');
      sync = 'saved';
    }
    render();
    return true;
  } catch (e) {
    sync = typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'pending';
    render();
    schedule(true);
    return false;
  }
}
/** Save immediately (race end) — no-op for guests. */
export function saveNow() {
  if (user) return save();
  return Promise.resolve(false);
}

function laps() {
  try {
    const q = JSON.parse(LS.get(K_LAPS) || '{}');
    return q && typeof q === 'object' ? q : {};
  } catch (e) {
    return {};
  }
}
/** Remember a best lap for the leaderboard (sent when logged in; queued while offline). */
export function queueLap(map, sec, char, noFlush) {
  if (!user || !(sec > 0)) return;
  const q = laps(),
    ms = Math.round(sec * 1000);
  if (q[map] && q[map].ms <= ms) return;
  q[map] = { ms, char: char || null };
  LS.set(K_LAPS, JSON.stringify(q));
  if (!noFlush) flushLaps();
}
async function flushLaps() {
  if (!user || tables !== 'ok' || busy) return;
  busy = true;
  try {
    for (const [map, r] of Object.entries(laps())) {
      if (r.ms < 3000 || r.ms > 600000) {
        const q = laps();
        delete q[map];
        LS.set(K_LAPS, JSON.stringify(q));
        continue;
      }
      const { error } = await sb.rpc('cart_submit_lap', {
        p_map: map,
        p_lap_ms: r.ms,
        p_nickname: LS.get(P.K.nick) || '플레이어',
        p_char: r.char,
      });
      if (error) throw error;
      const q = laps();
      if (q[map] && q[map].ms === r.ms) delete q[map];
      LS.set(K_LAPS, JSON.stringify(q));
    }
  } catch (e) {
    setTimeout(flushLaps, 30000);
  } finally {
    busy = false;
  }
}

/** Sign out: flush, then put the guest save from before login back. */
function restoreGuest(keepUser) {
  clearTimeout(timer);
  let g = null;
  try {
    g = JSON.parse(LS.get(K_GUEST) || 'null');
  } catch (e) {
    /* ignore */
  }
  if (g && tables === 'ok') replaceLocal(g); // never synced (tables missing) -> keep what was played
  writeLocal(() => {
    LS.set(K_UID, '');
    LS.set(K_DIRTY, '0');
    LS.set(K_LAPS, '{}');
  });
  if (!keepUser) {
    user = null;
    tables = 'unknown';
    sync = 'idle';
    api.onApplied?.();
    render();
  }
}
async function signOut() {
  msg = ['로그아웃 중…', false];
  render();
  if (LS.get(K_DIRTY) === '1') await Promise.race([save(), new Promise(r => setTimeout(r, 3000))]);
  try {
    await sb.auth.signOut();
  } catch (e) {
    /* local sign-out still happens below */
  }
  restoreGuest();
  msg = ['로그아웃했어요. 이제 게스트로 플레이해요.', false];
  render();
}

async function submitAuth(kind) {
  const email = ($('aEmail')?.value || '').trim(),
    pw = $('aPw')?.value || '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setMsg('이메일 형식이 올바르지 않아요.', true);
  if (pw.length < 6) return setMsg('비밀번호는 6자 이상이어야 해요.', true);
  setMsg(kind === 'up' ? '가입하는 중…' : '로그인 중…', false);
  try {
    await ensureClient();
    if (kind === 'up') {
      const { data, error } = await sb.auth.signUp({ email, password: pw, options: { emailRedirectTo: SUPABASE.site } });
      if (error) throw error;
      if (data?.session?.user) {
        await onLogin(data.session.user);
        setMsg('가입 완료! 로그인됐어요. 진행도가 클라우드에 저장돼요.', false);
      } else if (data?.user && Array.isArray(data.user.identities) && data.user.identities.length === 0)
        setMsg('이미 가입된 이메일이에요. 로그인해 주세요.', true);
      else
        setMsg(
          '가입은 됐지만 이 프로젝트는 이메일 인증이 켜져 있어 바로 로그인되지 않아요. 받은 메일의 확인 링크를 누른 뒤 로그인해 주세요.',
          true,
        );
    } else {
      const { data, error } = await sb.auth.signInWithPassword({ email, password: pw });
      if (error) throw error;
      if (data?.user) await onLogin(data.user);
      setMsg('로그인됐어요! 진행도가 클라우드에 저장돼요.', false);
    }
  } catch (e) {
    setMsg(koErr(e), true);
  }
}
function setMsg(t, err) {
  msg = [t, !!err];
  render();
}

const fmt = s => `${Math.floor(s / 60)}:${(s % 60).toFixed(2).padStart(5, '0')}`;
const timeKo = t => new Date(t).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
function syncLine() {
  if (tables === 'missing')
    return '⚠️ 클라우드 저장소가 아직 준비되지 않았어요 (관리자: supabase/schema.sql 실행 필요). 진행도는 이 기기에만 저장돼요.';
  if (tables === 'error') return '⚠️ 서버에 연결할 수 없어요. 진행도는 이 기기에 저장되고 나중에 다시 올려요.';
  return (
    {
      saving: '⏳ 저장 중…',
      saved: `☁️ 클라우드에 저장됨${lastSaved ? ' · ' + timeKo(lastSaved) : ''}`,
      pending: '⏳ 저장 대기 중 — 자동으로 다시 시도해요',
      offline: '📴 오프라인 — 연결되면 자동으로 저장해요',
      error: '⚠️ 동기화 실패 — 자동으로 다시 시도해요',
      local: '💾 이 기기에만 저장 중',
    }[sync] || '☁️ 연결 중…'
  );
}
function acctBody() {
  if (!user)
    return `<p class="note">로그인 없이도 게스트로 플레이할 수 있어요. 로그인하면 코인·파츠·캐릭터·설정·최고 기록이 클라우드에 저장돼 다른 기기에서도 이어서 할 수 있어요.</p>
  <form id="aForm" class="aform" autocomplete="on" onsubmit="return false">
   <label>이메일 <input id="aEmail" type="email" inputmode="email" autocomplete="email" maxlength="120" placeholder="you@example.com"></label>
   <label>비밀번호 <input id="aPw" type="password" autocomplete="current-password" maxlength="72" placeholder="6자 이상"></label>
   <div class="lbtns"><button id="aIn" class="pri" type="submit">🔑 로그인</button><button id="aUp" type="button">✨ 회원가입</button></div>
  </form>`;
  const s = P.readStats(st);
  return `<div class="arow">📧 <b>${escHtml(user.email || '')}</b></div>
  <div class="arow"><label>닉네임 <input id="aNick" maxlength="10" value="${escHtml(LS.get(P.K.nick) || '')}" placeholder="닉네임"></label><button id="aNickSave" class="sec">저장</button></div>
  <div id="aSync" class="note">${syncLine()}</div>
  <div class="astats">🏁 레이스 <b>${s.races}</b> · 🏆 우승 <b>${s.wins}</b> · 🥉 입상 <b>${s.podiums}</b> · 🪙 번 코인 <b>${s.coinsEarned.toLocaleString('ko-KR')}</b></div>
  <div class="lbtns"><button id="aSyncNow" class="sec">🔄 지금 저장</button><button id="aOut" class="sec">🚪 로그아웃</button></div>`;
}
function boardBody() {
  const ids = Object.keys(MAPS);
  if (!boardMap) boardMap = LS.get('cartMap') && MAPS[LS.get('cartMap')] ? LS.get('cartMap') : ids[0];
  return `<div class="maprow small">${ids.map(id => `<button data-bmap="${id}" class="mapc${id === boardMap ? ' on' : ''}">${MAPS[id].icon} ${MAPS[id].name}</button>`).join('')}</div><ol id="aBoard" class="aboard"><li class="note">불러오는 중…</li></ol>`;
}
async function loadBoard() {
  const m = boardMap,
    ol = () => $('aBoard');
  try {
    await ensureClient();
    if (tables === 'unknown') await checkTables();
    if (tables === 'missing') throw { message: '랭킹 저장소가 아직 준비되지 않았어요 (관리자: supabase/schema.sql 실행 필요).', code: 'x' };
    const { data, error } = await sb
      .from(T.records)
      .select('map, lap_ms, nickname, char')
      .eq('map', m)
      .order('lap_ms', { ascending: true })
      .limit(SUPABASE.leaderboardSize);
    if (error) throw error;
    if (m !== boardMap || !ol()) return;
    const me = LS.get(P.K.nick);
    ol().innerHTML = data?.length
      ? data
          .map((r, i) => {
            const c = ROSTER.find(x => x.id === r.char);
            return `<li class="${user && r.nickname === me ? 'me' : ''}"><span class="rk">${i + 1}</span><span class="nm">${c ? c.emoji : ''} ${escHtml(r.nickname)}</span><b>${fmt(r.lap_ms / 1000)}</b></li>`;
          })
          .join('')
      : '<li class="note">아직 기록이 없어요. 로그인하고 첫 기록을 남겨 보세요!</li>';
  } catch (e) {
    if (m === boardMap && ol()) ol().innerHTML = `<li class="note err">${escHtml(e.code === 'x' ? e.message : koErr(e))}</li>`;
  }
}
function render() {
  const btn = $('tAcct');
  if (btn) {
    btn.classList.toggle('on', !!user);
    btn.title = user ? `계정: ${LS.get(P.K.nick) || user.email}` : '계정 (로그인)';
  }
  const root = $('acct');
  if (!root || root.classList.contains('hidden')) return;
  const keep = { e: $('aEmail')?.value, p: $('aPw')?.value, n: $('aNick')?.value, f: document.activeElement?.id };
  $('aTabs').innerHTML = [
    ['acct', '👤 계정'],
    ['board', '🏆 랭킹'],
  ]
    .map(([k, n]) => `<button role="tab" data-atab="${k}" aria-selected="${k === tab}" class="${k === tab ? 'on' : ''}">${n}</button>`)
    .join('');
  if (tab === 'acct') {
    const sameView = !!$('aForm') === !user && $('aBody').dataset.view === 'acct';
    if (sameView && user && $('aSync')) {
      $('aSync').textContent = syncLine();
    } else {
      $('aBody').innerHTML = acctBody();
      if (keep.e && $('aEmail')) $('aEmail').value = keep.e;
      if (keep.p && $('aPw')) $('aPw').value = keep.p;
      if (keep.n && $('aNick')) $('aNick').value = keep.n;
      if (keep.f && $(keep.f)) $(keep.f).focus();
    }
  } else if ($('aBody').dataset.view !== 'board:' + boardMap) {
    $('aBody').innerHTML = boardBody();
    loadBoard();
  }
  $('aBody').dataset.view = tab === 'acct' ? 'acct' : 'board:' + boardMap;
  $('aMsg').textContent = msg[0];
  $('aMsg').className = 'note' + (msg[1] ? ' err' : '');
}
export function openAccount(which) {
  if (which) tab = which;
  msg = ['', false];
  $('acct').classList.remove('hidden');
  $('aBody').dataset.view = '';
  render();
  ensureClient()
    .then(render)
    .catch(e => setMsg('로그인 기능을 불러오지 못했어요. ' + koErr(e), true));
  ($('aEmail') || $('aClose')).focus();
}
function closeAccount() {
  $('acct').classList.add('hidden');
}
export const accountOpen = () => !!$('acct') && !$('acct').classList.contains('hidden');
export const loggedIn = () => !!user;

function onClick(e) {
  const t = e.target.closest('button');
  if (e.target.id === 'acct') return closeAccount();
  if (!t) return;
  if (t.dataset.atab) {
    tab = t.dataset.atab;
    msg = ['', false];
    return render();
  }
  if (t.dataset.bmap) {
    boardMap = t.dataset.bmap;
    return render();
  }
  if (t.id === 'aClose') return closeAccount();
  if (t.id === 'aIn') return submitAuth('in');
  if (t.id === 'aUp') return submitAuth('up');
  if (t.id === 'aOut') return signOut();
  if (t.id === 'aSyncNow') {
    LS.set(K_DIRTY, '1');
    return loadCloud();
  }
  if (t.id === 'aNickSave')
    saveProfile($('aNick').value)
      .then(n => {
        $('aNick').value = n;
        setMsg('닉네임을 저장했어요. 멀티플레이에서도 이 이름을 써요.', false);
      })
      .catch(err => setMsg(koErr(err), true));
}

/** api = { onApplied() } — called after the cloud save was written into localStorage (refresh coins, character, parts…). */
export function initAccount(a) {
  api = a || {};
  const box = document.createElement('div');
  box.id = 'acct';
  box.className = 'hidden';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.setAttribute('aria-label', '계정');
  box.innerHTML = `<div class="panel apanel"><div class="ghead"><h2>👤 계정</h2><button id="aClose" class="iconbtn" aria-label="닫기">✕</button></div><div id="aTabs" class="gtabs" role="tablist"></div><div id="aBody"></div><div id="aMsg" class="note" role="status" aria-live="polite"></div></div>`;
  document.body.append(box);
  box.addEventListener('click', onClick);
  box.addEventListener('submit', e => e.preventDefault());
  box.addEventListener('keydown', e => {
    e.stopPropagation(); // typing in the form must not start the race / mute / restart
    if (e.code === 'Escape') closeAccount();
  });
  const tt = document.querySelector('#title .ttop');
  if (tt && !$('tAcct')) {
    const b = document.createElement('button');
    b.id = 'tAcct';
    b.className = 'iconbtn';
    b.setAttribute('aria-label', '계정');
    b.textContent = '👤';
    b.onclick = () => openAccount('acct');
    tt.prepend(b);
  }
  document.addEventListener('cart:account', e => openAccount(e.detail || 'acct'));
  LS.onSet(k => {
    if (applying || !user || !k || !P.isSynced(k)) return;
    if (k === P.K.nick) {
      saveProfile(LS.get(k)).catch(() => {});
      return;
    }
    if (LS.get(K_DIRTY) !== '1') LS.set(K_DIRTY, '1');
    seq++;
    if (sync !== 'offline') sync = 'pending';
    schedule();
  });
  addEventListener('online', () => {
    if (!user) return;
    if (LS.get(K_DIRTY) === '1') save();
    flushLaps();
  });
  addEventListener('pagehide', () => user && LS.get(K_DIRTY) === '1' && save());
  render();
  // restore a saved session without slowing the first frame (guests never load supabase-js)
  if (sbAuthStored() || LS.get(K_UID)) setTimeout(() => ensureClient().catch(() => {}), 800);
}
/** Count a finished run into the persistent stats and save right away. */
export function recordRun(r) {
  P.addRun(st, r);
  saveNow();
}
if (DEBUG)
  window.__acct = {
    ensureClient,
    state: () => ({ user: user && { id: user.id, email: user.email }, tables, sync, dirty: LS.get(K_DIRTY) }),
    saveNow,
    snap,
  };
