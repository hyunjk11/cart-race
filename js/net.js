/**
 * net.js — Online multiplayer: host-authoritative P2P over WebRTC using PeerJS (public PeerJS cloud broker).
 */
import { charOf } from './chars.js';
import { cleanLoadout, randomLoadout } from './parts.js';
import { ROSTER } from './config/characters.js';
import { LS } from './store.js';
import { iceServers } from './netconfig.js';
import { $, escHtml } from './util.js';
const PREFIX = 'cartrace-';
const COLORS = ['#ff4f8b', '#43d17a', '#ffc107', '#9c5cff'];
const qs = new URLSearchParams(location.search);
let Peer = null,
  peer = null,
  api = null;
export const NET = {
  mode: 'solo',
  you: 0,
  slots: [],
  conns: new Map(),
  hostConn: null,
  code: '',
  inRace: false,
  map: 'mart',
  opts: { gmode: 'race', tlim: true, diff: 'normal' },
  send() {},
  broadcast() {},
};

const TIP =
  '\n💡 다른 네트워크로 시도해 보세요: 와이파이 ↔ 모바일 데이터(LTE/5G) 전환, 회사·학교 와이파이 대신 집 와이파이나 핫스팟. 두 사람이 같은 와이파이에 있으면 가장 잘 연결돼요.';
const ERR = {
  'peer-unavailable': '방을 찾을 수 없습니다. 코드를 확인하거나, 호스트가 방을 아직 열어 두었는지 확인해 주세요.',
  'unavailable-id': '이미 사용 중인 방 코드입니다. 다시 시도합니다…',
  'network': '시그널링 서버에 연결할 수 없습니다. 인터넷 연결을 확인해 주세요.' + TIP,
  'server-error': '시그널링 서버 오류입니다. 잠시 후 다시 시도해 주세요.',
  'socket-error': '서버 연결이 끊어졌습니다. 잠시 후 다시 시도해 주세요.',
  'socket-closed': '서버 연결이 끊어졌습니다. 잠시 후 다시 시도해 주세요.',
  'browser-incompatible': '이 브라우저는 WebRTC를 지원하지 않습니다. 최신 Chrome·Safari·Firefox·삼성 인터넷을 사용해 주세요.',
  'webrtc': '상대와 직접 연결(WebRTC)하지 못했습니다. 방화벽이나 통신사/회사망이 P2P 연결을 막고 있을 수 있어요.' + TIP,
  'timeout': '연결 시간이 초과되었습니다. 방 코드를 확인하고, 네트워크가 P2P 연결을 막고 있지 않은지 확인해 주세요.' + TIP,
  'host-lost': '호스트와의 연결이 끊어졌습니다.' + TIP,
};
function msg(t, err) {
  const el = $('mpMsg');
  el.textContent = t || '';
  el.className = err ? 'err' : '';
  const l = $('lobbyMsg');
  if (l) {
    l.textContent = t || '';
    l.className = err ? 'err' : '';
  }
}
function nick() {
  let n = ($('nick').value || '').trim().slice(0, 10);
  if (!n) n = '플레이어' + ((Math.random() * 900 + 100) | 0);
  $('nick').value = n;
  LS.set('cartNick', n);
  return n;
}
async function loadPeer() {
  if (Peer) return Peer;
  try {
    Peer = (await import('peerjs')).Peer;
  } catch (e) {
    // vendor/peerjs.mjs (esbuild bundle of peerjs@1.5.4 ESM), mapped in index.html
    msg('PeerJS 라이브러리를 불러오지 못했습니다. 인터넷 연결을 확인하세요.', true);
    throw e;
  }
  return Peer;
}
function peerOpts() {
  const o = { debug: 0, config: { iceServers: iceServers() } };
  const ph = qs.get('peerhost');
  if (ph) {
    const [host, port] = ph.split(':');
    Object.assign(o, {
      host,
      port: +(port || 9000),
      path: qs.get('peerpath') || '/',
      secure: location.protocol === 'https:' && host !== 'localhost',
    });
  }
  return o;
}
const genCode = () => Array.from({ length: 4 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[(Math.random() * 32) | 0]).join('');

// ---------------- HOST ----------------
async function createRoom(tries = 0, mg = null) {
  const P = await loadPeer();
  const name = mg ? (mg.slots[mg.you] || {}).name || nick() : nick();
  if (!mg) msg('방을 만드는 중…');
  NET.code = mg ? mg.code : genCode();
  const me = (peer = new P(PREFIX + NET.code, peerOpts()));
  peer.on('open', () => {
    NET.mode = 'host';
    NET.you = 0;
    NET.slots = [{ type: 'human', name, ready: true, id: 'host', char: api.getChar(), parts: api.getParts() }, null, null, null];
    if (mg)
      mg.slots.forEach((s, i) => {
        if (i > 0 && s && s.type === 'bot') NET.slots[i] = s;
      }); // host migration: keep the bots, humans rejoin into free slots
    NET.broadcast = m => {
      const s = JSON.stringify(m);
      for (const c of NET.conns.values()) if (c.open) c.send(s);
    };
    NET.map = api.getMap();
    NET.opts = mg ? mg.opts || api.getOpts() : api.getOpts();
    mig = null;
    showLobby();
    pushLobby();
    msg('');
    if (mg) chat(`이전 호스트가 나가서 ${name} 님이 새 호스트가 되었습니다.`);
  });
  peer.on('connection', conn => {
    conn.on('open', () => {
      NET.conns.set(conn.peer, conn);
      lastSeen.set(conn.peer, performance.now());
    });
    conn.on('data', d => hostRecv(conn, typeof d === 'string' ? JSON.parse(d) : d));
    conn.on('close', () => hostDrop(conn.peer));
    conn.on('error', () => hostDrop(conn.peer));
  });
  peer.on('disconnected', () => {
    try {
      peer.reconnect();
    } catch (e) {}
  });
  peer.on('error', e => {
    if (mg) {
      if (peer === me) migRetry();
      return;
    }
    if (e.type === 'unavailable-id' && tries < 3) {
      peer.destroy();
      createRoom(tries + 1);
      return;
    }
    msg(ERR[e.type] || '연결 오류: ' + e.type, true);
  });
}
function slotOf(peerId) {
  return NET.slots.findIndex(s => s && s.id === peerId);
}
const lastSeen = new Map();
let hostSeen = 0;
function hostRecv(conn, m) {
  lastSeen.set(conn.peer, performance.now());
  const i = slotOf(conn.peer);
  if (m.t === 'hello') {
    const tok = typeof m.tok === 'string' ? m.tok.slice(0, 40) : '';
    // rejoin: same room token -> reclaim the old slot (from the replacement bot, or from a stale connection not yet timed out)
    const own = tok ? NET.slots.findIndex((s, k) => s && k > 0 && s.tok === tok) : -1;
    if (own > 0) {
      const s = NET.slots[own],
        old = s.type === 'human' && s.id !== conn.peer ? NET.conns.get(s.id) : null;
      const name = s.human || s.name,
        wasBot = s.type === 'bot';
      NET.slots[own] = {
        type: 'human',
        name,
        ready: NET.inRace || !!(old && s.ready),
        id: conn.peer,
        char: s.char,
        parts: s.parts,
        tok,
        spec: s.spec,
      };
      if (old) {
        NET.conns.delete(s.id);
        lastSeen.delete(s.id);
        try {
          old.close();
        } catch (e) {}
      }
      if (NET.inRace) {
        if (s.spec) sendSpectate(conn, own);
        else {
          if (wasBot) api.slotToHuman(own, name);
          conn.send(
            JSON.stringify({ t: 'start', slots: NET.raceSlots, you: own, map: NET.map, opts: NET.opts, rejoin: api.rejoinState(own) }),
          );
        }
      }
      chat(`${name} 님이 다시 연결되었습니다.`);
      pushLobby();
      return;
    }
    const free = NET.slots.findIndex(s => !s);
    if (free < 0) {
      conn.send(
        JSON.stringify({
          t: 'reject',
          msg: NET.inRace
            ? '레이스가 진행 중이고 자리가 가득 찼습니다. 레이스가 끝난 뒤 다시 참가해 주세요.'
            : '방이 가득 찼습니다 (최대 4명).',
        }),
      );
      setTimeout(() => conn.close(), 300);
      return;
    }
    NET.slots[free] = {
      type: 'human',
      name: String(m.name || '게스트').slice(0, 10),
      ready: false,
      id: conn.peer,
      char: charOf(m.char).id,
      parts: cleanLoadout(m.parts),
      tok,
      spec: NET.inRace,
    };
    // late joiner mid-race: watch as a spectator, play from the next race (slot reserved in the lobby)
    if (NET.inRace) {
      sendSpectate(conn, free);
      chat(`${NET.slots[free].name} 님이 관전 중입니다 (다음 레이스부터 참가).`);
    } else chat(`${NET.slots[free].name} 님이 입장했습니다.`);
    pushLobby();
    return;
  }
  if (i < 0) return;
  if (m.t === 'ready') {
    NET.slots[i].ready = !!m.v;
    pushLobby();
  } else if (m.t === 'char') {
    if (!NET.inRace) {
      NET.slots[i].char = charOf(m.id).id;
      pushLobby();
    }
  } else if (m.t === 'parts') {
    if (!NET.inRace) {
      NET.slots[i].parts = cleanLoadout(m.lo);
      pushLobby();
    }
  } else if (m.t === 'chat') chat(`${NET.slots[i].name}: ${String(m.text).slice(0, 80)}`);
  else if (m.t === 'st') api.onRemoteState(i, m.s);
  else if (m.t === 'item') api.onRemoteItem(i);
  else if (m.t === 'spawn') api.onSpawn(m.a);
  else if (m.t === 'crash') api.onRemoteCrash(i, +m.k || 0);
  else if (m.t === 'hz') api.onRemoteHazard(i, m.id, !!m.sh);
  else if (m.t === 'mg' && api.onRemoteMg) api.onRemoteMg(i, m);
}
function sendSpectate(conn, i) {
  conn.send(
    JSON.stringify({
      t: 'start',
      slots: NET.raceSlots,
      you: i,
      map: NET.map,
      opts: NET.opts,
      rejoin: { raceT: api.rejoinState(0).raceT, spec: true },
    }),
  );
}
function hostDrop(peerId) {
  const conn = NET.conns.get(peerId);
  NET.conns.delete(peerId);
  const i = slotOf(peerId);
  if (i < 0) return;
  const s = NET.slots[i];
  if (NET.inRace && !s.spec) {
    NET.slots[i] = {
      type: 'bot',
      name: s.name + ' (봇)',
      ready: true,
      id: 'bot' + i,
      char: s.char,
      parts: s.parts,
      tok: s.tok,
      human: s.name,
    };
    api.slotToBot(i);
    chat(`${s.name} 님의 연결이 끊겨 봇으로 대체됩니다.`);
  } else {
    NET.slots[i] = null;
    chat(`${s.name} 님이 나갔습니다.`);
  }
  pushLobby();
}
function addBot() {
  const f = NET.slots.findIndex(s => !s);
  if (f < 0) return;
  const used = new Set(NET.slots.filter(Boolean).map(s => s.char)),
    free = ROSTER.filter(r => !used.has(r.id)),
    d = free[(Math.random() * free.length) | 0] || ROSTER[f];
  NET.slots[f] = { type: 'bot', name: d.name + ' 봇', ready: true, id: 'bot' + f, char: d.id, parts: randomLoadout() };
  pushLobby();
}
export function setMyChar(id) {
  if (NET.mode === 'host' && NET.slots[0] && !NET.inRace) {
    NET.slots[0].char = id;
    pushLobby();
  } else if (NET.mode === 'guest') NET.send({ t: 'char', id });
}
/** Our equipped parts changed (garage): host updates its slot, a guest tells the host; synced to everyone via the lobby. */
export function setMyParts(lo) {
  if (NET.mode === 'host' && NET.slots[0] && !NET.inRace) {
    NET.slots[0].parts = cleanLoadout(lo);
    pushLobby();
  } else if (NET.mode === 'guest') NET.send({ t: 'parts', lo });
}
function removeSlot(i) {
  const s = NET.slots[i];
  if (!s || i === 0) return;
  if (s.type === 'human') {
    const c = NET.conns.get(s.id);
    if (c) {
      c.send(JSON.stringify({ t: 'kicked' }));
      setTimeout(() => c.close(), 200);
    }
    chat(`${s.name} 님을 내보냈습니다.`);
  }
  NET.slots[i] = null;
  pushLobby();
}
export function pushLobby() {
  if (NET.mode !== 'host') return;
  for (const [pid, c] of NET.conns)
    if (c.open)
      c.send(
        JSON.stringify({
          t: 'lobby',
          slots: NET.slots.map(s => s && { ...s, tok: undefined, human: undefined }),
          you: slotOf(pid),
          code: NET.code,
          map: NET.map,
          opts: NET.opts,
          race: NET.inRace,
        }),
      );
  renderLobby();
}
function canStart() {
  const n = NET.slots.filter(Boolean).length;
  return n >= 2 && NET.slots.every(s => !s || s.ready);
}
function startRace() {
  if (!canStart()) return;
  NET.inRace = true;
  NET.slots.forEach(s => {
    if (s) s.spec = false;
  });
  const slots = (NET.raceSlots = NET.slots.map(s => s && { type: s.type, name: s.name, char: s.char, parts: s.parts }));
  for (const [pid, c] of NET.conns)
    if (c.open) c.send(JSON.stringify({ t: 'start', slots, you: slotOf(pid), map: NET.map, opts: NET.opts }));
  hideMP();
  api.startRace(slots, 0, 'host');
}
export function hostResults(rows) {
  NET.broadcast({ t: 'results', rows });
  api.showResults(rows);
  setTimeout(backToLobby, 10000);
}
function backToLobby() {
  NET.inRace = false;
  NET.slots.forEach(s => {
    if (s && s.type === 'human' && s.id !== 'host') s.ready = false;
  });
  NET.broadcast({ t: 'tolobby' });
  api.toLobby();
  showLobby();
  pushLobby();
}

// ---------------- GUEST ----------------
function roomTok(code) {
  const k = 'cartTok_' + code;
  let t = LS.get(k);
  if (!t) {
    t = Array.from({ length: 16 }, () => 'abcdefghijkmnpqrstuvwxyz23456789'[(Math.random() * 32) | 0]).join('');
    LS.set(k, t);
  }
  return t;
}
let retry = 0;
// connection to the host lost mid-race: try to rejoin the same room (host gives the slot back by token) before giving up
function lost(reason, gone = false) {
  if (NET.mode !== 'guest') {
    leave(reason);
    return;
  }
  if (mig) {
    migRetry();
    return;
  }
  if (NET.inRace && retry < 3 && !gone) {
    retry++;
    const p = peer;
    peer = null;
    NET.hostConn = null;
    NET.send = () => {};
    hostSeen = 0;
    try {
      p && p.destroy();
    } catch (e) {}
    api.netNote(`📡 연결이 끊겨 다시 연결하는 중… (${retry}/3)`);
    setTimeout(() => joinRoom(NET.code, true).catch(() => leave(reason)), 1000);
    return;
  }
  migrate(reason);
}
// ---- host migration (E3): the host is gone -> the first remaining guest re-opens the SAME room code as the new host,
// the other guests rejoin it (bots are kept). A race in progress cannot be carried over (the host simulated it), so
// everyone lands back in the lobby and can start the next race. If it fails, a clear message + back to the MP menu.
let mig = null;
function migrate(reason) {
  const humans = NET.slots.map((s, i) => (s && s.type === 'human' && i > 0 ? i : -1)).filter(i => i > 0);
  if (NET.you <= 0 || !humans.includes(NET.you)) {
    leave(reason);
    return;
  }
  const wasRace = NET.inRace;
  dropPeer();
  NET.inRace = false;
  api.leftRoom();
  mig = { n: 0, code: NET.code, you: NET.you, cand: humans[0] === NET.you, slots: NET.slots, opts: NET.opts };
  showLobby();
  msg(
    (wasRace ? '호스트가 나가서 레이스가 중단되었습니다. ' : '호스트가 나갔습니다. ') +
      (mig.cand ? '내가 새 호스트가 되어 방을 다시 여는 중…' : '새 호스트에게 다시 연결하는 중…'),
  );
  setTimeout(migStep, mig.cand ? 1500 : 3500);
}
function dropPeer() {
  const p = peer;
  peer = null;
  NET.hostConn = null;
  NET.send = () => {};
  hostSeen = 0;
  try {
    p && p.destroy();
  } catch (e) {}
}
function migStep() {
  if (!mig) return;
  if (++mig.n > 10) {
    mig = null;
    leave('호스트가 나가서 방이 닫혔습니다. 메뉴에서 새 방을 만들거나 다른 방에 참가해 주세요.');
    return;
  }
  (mig.cand ? createRoom(0, mig) : joinRoom(mig.code, true)).catch(() => migRetry());
}
function migRetry() {
  if (!mig) return;
  dropPeer();
  setTimeout(migStep, 2500);
}
async function joinRoom(code, re = false) {
  code = (code || '').trim().toUpperCase();
  if (!/^[A-Z0-9]{4,6}$/.test(code)) {
    msg('방 코드는 4~6자리 영문/숫자입니다.', true);
    return;
  }
  if (!re) retry = 0;
  const P = await loadPeer();
  const name = nick();
  if (!re) msg('방에 연결하는 중…');
  NET.code = code;
  const me = (peer = new P(peerOpts()));
  let opened = false;
  const to = setTimeout(() => {
    if (opened || peer !== me) return;
    if (re) lost(ERR.timeout);
    else msg(ERR.timeout, true);
  }, 15000);
  peer.on('open', () => {
    const conn = peer.connect(PREFIX + code, { reliable: true });
    NET.hostConn = conn;
    conn.on('open', () => {
      opened = true;
      clearTimeout(to);
      NET.mode = 'guest';
      NET.send = m => conn.open && conn.send(JSON.stringify(m));
      NET.send({ t: 'hello', name, char: api.getChar(), parts: api.getParts(), tok: roomTok(code) });
      if (!re || mig) {
        mig = null;
        showLobby();
        msg('');
      }
    });
    conn.on('data', d => {
      if (peer !== me) return;
      hostSeen = performance.now();
      guestRecv(typeof d === 'string' ? JSON.parse(d) : d);
    });
    conn.on('close', () => {
      if (NET.mode === 'guest' && peer === me) lost('호스트가 방을 닫았거나 연결이 끊어졌습니다.');
    });
    conn.on('error', () => msg(ERR.webrtc, true));
    watchIce(conn, () => {
      if (!opened) {
        clearTimeout(to);
        msg(ERR.webrtc, true);
      }
    });
  });
  peer.on('error', e => {
    if (peer !== me) return;
    clearTimeout(to);
    if (re) {
      lost(ERR[e.type] || ERR.webrtc, e.type === 'peer-unavailable');
      return;
    }
    msg(ERR[e.type] || '연결 오류: ' + e.type, true);
  });
}
// ICE 'failed' = no direct path and no working relay: show the network tips right away instead of waiting for the timeout
function watchIce(conn, onFail) {
  const pc = conn.peerConnection;
  if (!pc) {
    setTimeout(() => conn.peerConnection && watchIce(conn, onFail), 200);
    return;
  }
  pc.addEventListener('iceconnectionstatechange', () => {
    if (pc.iceConnectionState === 'failed') onFail();
  });
}
function guestRecv(m) {
  if (m.t === 'lobby') {
    NET.slots = m.slots;
    NET.you = m.you;
    if (m.map) {
      NET.map = m.map;
      api.onMap(m.map);
    }
    if (m.opts) {
      NET.opts = m.opts;
      api.onOpts(m.opts);
    }
    if (m.race === false && NET.inRace) {
      NET.inRace = false;
      api.toLobby();
      showLobby();
      msg('호스트가 바뀌어 레이스가 중단되었습니다. 다음 레이스를 준비해 주세요.');
    }
    renderLobby();
  } else if (m.t === 'chat') addChat(m.text);
  else if (m.t === 'reject') {
    leave(m.msg);
  } else if (m.t === 'kicked') {
    leave('호스트가 당신을 방에서 내보냈습니다.');
  } else if (m.t === 'start') {
    if (m.map) {
      NET.map = m.map;
      api.onMap(m.map);
    }
    if (m.opts) api.onOpts(m.opts);
    NET.you = m.you;
    NET.inRace = true;
    hideMP();
    retry = 0;
    api.startRace(m.slots, m.you, 'guest');
    if (m.rejoin) api.rejoinRace(m.rejoin);
  } else if (m.t === 'ping') {
  } else if (m.t === 'snap') api.onSnap(m);
  else if (m.t === 'say') api.onSay(m);
  else if (m.t === 'slots') api.onSlots(m);
  else if (m.t === 'results') api.showResults(m.rows);
  else if (m.t === 'tolobby') {
    NET.inRace = false;
    api.toLobby();
    showLobby();
  }
}
function leave(reason) {
  const wasMode = NET.mode;
  NET.mode = 'solo';
  mig = null;
  try {
    peer && peer.destroy();
  } catch (e) {}
  peer = null;
  NET.conns.clear();
  NET.inRace = false;
  if (wasMode !== 'solo' && api) api.leftRoom();
  $('mpLobby').classList.add('hidden');
  $('mpMenu').classList.remove('hidden');
  $('mp').classList.remove('hidden');
  $('title').classList.add('hidden');
  msg(reason || '', !!reason);
  history.replaceState(null, '', location.pathname);
}

// ---------------- UI ----------------
function chat(t) {
  if (NET.mode === 'host') {
    NET.broadcast({ t: 'chat', text: t });
    addChat(t);
  }
}
function addChat(t) {
  const l = $('chatLog');
  const d = document.createElement('div');
  d.textContent = t;
  l.appendChild(d);
  l.scrollTop = 1e6;
}
function showLobby() {
  $('title').classList.add('hidden');
  $('mp').classList.remove('hidden');
  $('mpMenu').classList.add('hidden');
  $('mpLobby').classList.remove('hidden');
  renderLobby();
}
function hideMP() {
  $('mp').classList.add('hidden');
}
function renderLobby() {
  const host = NET.mode === 'host';
  $('roomCode').textContent = NET.code;
  $('invite').value = location.origin + location.pathname + '?room=' + NET.code;
  $('slots').innerHTML = NET.slots
    .map(
      (s, i) => `<div class="slot" style="border-color:${COLORS[i]}"><span class="dot" style="background:${COLORS[i]}"></span>
    ${
      s
        ? `<span class="sch" title="${escHtml(charOf(s.char).name)}">${charOf(s.char).emoji}</span><b>${escHtml(s.name)}</b> <small class="scn">${escHtml(charOf(s.char).name)}</small> ${s.type === 'bot' ? '🤖' : i === 0 ? '👑' : ''} ${i === NET.you ? '<i>(나)</i>' : ''} <span class="rd ${s.ready ? 'on' : ''}">${s.type === 'bot' ? '봇' : s.ready ? '준비 완료' : '대기 중'}</span>
      ${host && i > 0 ? `<button data-rm="${i}">${s.type === 'bot' ? '봇 제거' : '내보내기'}</button>` : ''}`
        : `<span class="empty">빈 자리</span>`
    }</div>`,
    )
    .join('');
  $('slots')
    .querySelectorAll('[data-rm]')
    .forEach(b => (b.onclick = () => removeSlot(+b.dataset.rm)));
  $('addBot').classList.toggle('hidden', !host);
  $('startRace').classList.toggle('hidden', !host);
  $('readyBtn').classList.toggle('hidden', host);
  $('addBot').disabled = !NET.slots.some(s => !s);
  $('startRace').disabled = !canStart();
  const me = NET.slots[NET.you];
  $('readyBtn').textContent = me && me.ready ? '✋ 준비 취소' : '✋ 준비';
  api.renderMaps();
  $('lobbyHint').textContent = host
    ? canStart()
      ? '모두 준비되었습니다! 레이스를 시작하세요.'
      : '참가자 2명 이상(봇 포함) + 모두 준비 시 시작할 수 있어요.'
    : '호스트가 레이스를 시작할 때까지 기다려 주세요.';
}

// heartbeat: detect silent disconnects (closed tabs / lost networks)
let hbLast = performance.now();
setInterval(() => {
  const now = performance.now(),
    stalled = now - hbLast > 3000;
  hbLast = now;
  if (stalled) {
    for (const k of lastSeen.keys()) lastSeen.set(k, now);
    if (hostSeen) hostSeen = now;
  } // our own tab was frozen (busy main thread / backgrounded): don't blame the peers
  if (NET.mode === 'host') {
    NET.broadcast({ t: 'ping' });
    for (const [pid] of NET.conns)
      if (now - (lastSeen.get(pid) || now) > 6000) {
        const c = NET.conns.get(pid);
        try {
          c.close();
        } catch (e) {}
        hostDrop(pid);
      }
  }
  if (NET.mode === 'guest') {
    NET.send({ t: 'ping' });
    if (hostSeen && now - hostSeen > 9000) lost(ERR['host-lost']);
  }
}, 1500);
export function initNet(gameApi) {
  api = gameApi;
  $('nick').value = LS.get('cartNick') || '';
  $('mpBtn').onclick = () => {
    api.onMenu(true);
    $('title').classList.add('hidden');
    $('mp').classList.remove('hidden');
  };
  $('mpBack').onclick = () => {
    api.onMenu(false);
    $('mp').classList.add('hidden');
    $('title').classList.remove('hidden');
  };
  $('createBtn').onclick = () => createRoom().catch(() => {});
  $('joinBtn').onclick = () => joinRoom($('joinCode').value).catch(() => {});
  $('joinCode').addEventListener('keydown', e => {
    if (e.key === 'Enter') $('joinBtn').click();
  });
  $('addBot').onclick = addBot;
  $('startRace').onclick = startRace;
  $('readyBtn').onclick = () => {
    const me = NET.slots[NET.you];
    NET.send({ t: 'ready', v: !(me && me.ready) });
  };
  $('leaveBtn').onclick = () => leave('');
  $('copyBtn').onclick = async () => {
    try {
      await navigator.clipboard.writeText($('invite').value);
      $('copyBtn').textContent = '복사됨!';
    } catch (e) {
      $('invite').select();
      document.execCommand('copy');
      $('copyBtn').textContent = '복사됨!';
    }
    setTimeout(() => ($('copyBtn').textContent = '복사'), 1500);
  };
  $('chatIn').addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Enter' && e.target.value.trim()) {
      const t = e.target.value.trim();
      e.target.value = '';
      if (NET.mode === 'host') chat(`${NET.slots[0].name}: ${t}`);
      else NET.send({ t: 'chat', text: t });
    }
  });
  ['nick', 'joinCode', 'invite'].forEach(id => $(id).addEventListener('keydown', e => e.stopPropagation()));
  addEventListener('beforeunload', () => {
    try {
      peer && peer.destroy();
    } catch (e) {}
  });
  if (!window.RTCPeerConnection) $('mpNote').textContent = '⚠️ 이 브라우저는 WebRTC를 지원하지 않아 멀티플레이를 사용할 수 없습니다.';
  const room = qs.get('room');
  if (room) {
    api.onMenu(true);
    $('title').classList.add('hidden');
    $('mp').classList.remove('hidden');
    $('joinCode').value = room.toUpperCase();
    joinRoom(room).catch(() => {});
  }
}
