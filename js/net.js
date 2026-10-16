// Online multiplayer: host-authoritative P2P over WebRTC using PeerJS (public PeerJS cloud broker).
const $ = id => document.getElementById(id);
const PREFIX = 'cartrace-';
const COLORS = ['#ff4f8b', '#43d17a', '#ffc107', '#9c5cff'];
const MAX = 4;
const qs = new URLSearchParams(location.search);
let Peer = null, peer = null, api = null;
export const NET = { mode: 'solo', you: 0, slots: [], conns: new Map(), hostConn: null, code: '', inRace: false, send() {}, broadcast() {} };

const ERR = {
  'peer-unavailable': '방을 찾을 수 없습니다. 코드를 확인해 주세요.',
  'unavailable-id': '이미 사용 중인 방 코드입니다. 다시 시도합니다…',
  'network': '시그널링 서버에 연결할 수 없습니다. 네트워크를 확인해 주세요.',
  'server-error': '시그널링 서버 오류입니다. 잠시 후 다시 시도해 주세요.',
  'socket-error': '서버 연결이 끊어졌습니다.', 'socket-closed': '서버 연결이 끊어졌습니다.',
  'browser-incompatible': '이 브라우저는 WebRTC를 지원하지 않습니다.',
  'webrtc': 'WebRTC 연결에 실패했습니다 (방화벽/회사망에서 차단될 수 있어요).',
};
function msg(t, err) { const el = $('mpMsg'); el.textContent = t || ''; el.className = err ? 'err' : ''; const l = $('lobbyMsg'); if (l) { l.textContent = t || ''; l.className = err ? 'err' : ''; } }
function nick() { let n = ($('nick').value || '').trim().slice(0, 10); if (!n) n = '플레이어' + ((Math.random() * 900 + 100) | 0); $('nick').value = n; localStorage.setItem('cartNick', n); return n; }
async function loadPeer() {
  if (Peer) return Peer;
  try { Peer = (await import('https://cdn.jsdelivr.net/npm/peerjs@1.5.4/+esm')).Peer; }
  catch (e) { msg('PeerJS 라이브러리를 불러오지 못했습니다. 인터넷 연결을 확인하세요.', true); throw e; }
  return Peer;
}
function peerOpts() {
  const o = { debug: 0, config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:global.stun.twilio.com:3478' }] } };
  const ph = qs.get('peerhost'); if (ph) { const [host, port] = ph.split(':'); Object.assign(o, { host, port: +(port || 9000), path: qs.get('peerpath') || '/', secure: location.protocol === 'https:' && host !== 'localhost' }); }
  return o;
}
const genCode = () => Array.from({ length: 4 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[(Math.random() * 32) | 0]).join('');

// ---------------- HOST ----------------
async function createRoom(tries = 0) {
  const P = await loadPeer(); const name = nick(); msg('방을 만드는 중…');
  NET.code = genCode(); peer = new P(PREFIX + NET.code, peerOpts());
  peer.on('open', () => {
    NET.mode = 'host'; NET.you = 0; NET.slots = [{ type: 'human', name, ready: true, id: 'host' }, null, null, null];
    NET.broadcast = m => { const s = JSON.stringify(m); for (const c of NET.conns.values()) if (c.open) c.send(s); };
    showLobby(); pushLobby(); msg('');
  });
  peer.on('connection', conn => {
    conn.on('open', () => { NET.conns.set(conn.peer, conn); lastSeen.set(conn.peer, performance.now()); });
    conn.on('data', d => hostRecv(conn, typeof d === 'string' ? JSON.parse(d) : d));
    conn.on('close', () => hostDrop(conn.peer));
    conn.on('error', () => hostDrop(conn.peer));
  });
  peer.on('disconnected', () => { try { peer.reconnect(); } catch (e) {} });
  peer.on('error', e => { if (e.type === 'unavailable-id' && tries < 3) { peer.destroy(); createRoom(tries + 1); return; } msg(ERR[e.type] || ('연결 오류: ' + e.type), true); });
}
function slotOf(peerId) { return NET.slots.findIndex(s => s && s.id === peerId); }
const lastSeen = new Map(); let hostSeen = 0;
function hostRecv(conn, m) {
  lastSeen.set(conn.peer, performance.now());
  const i = slotOf(conn.peer);
  if (m.t === 'hello') {
    if (NET.inRace) { conn.send(JSON.stringify({ t: 'reject', msg: '이미 경주가 진행 중입니다. 잠시 후 다시 참가해 주세요.' })); setTimeout(() => conn.close(), 300); return; }
    const free = NET.slots.findIndex(s => !s);
    if (free < 0) { conn.send(JSON.stringify({ t: 'reject', msg: '방이 가득 찼습니다 (최대 4명).' })); setTimeout(() => conn.close(), 300); return; }
    NET.slots[free] = { type: 'human', name: String(m.name || '게스트').slice(0, 10), ready: false, id: conn.peer };
    chat(`${NET.slots[free].name} 님이 입장했습니다.`); pushLobby(); return;
  }
  if (i < 0) return;
  if (m.t === 'ready') { NET.slots[i].ready = !!m.v; pushLobby(); }
  else if (m.t === 'chat') chat(`${NET.slots[i].name}: ${String(m.text).slice(0, 80)}`);
  else if (m.t === 'st') api.onRemoteState(i, m.s);
  else if (m.t === 'item') api.onRemoteItem(i);
  else if (m.t === 'spawn') api.onSpawn(m.a);
  else if (m.t === 'crash') api.onRemoteCrash(i);
  else if (m.t === 'hz') api.onRemoteHazard(i, m.id, !!m.sh);
}
function hostDrop(peerId) {
  const conn = NET.conns.get(peerId); NET.conns.delete(peerId); const i = slotOf(peerId); if (i < 0) return;
  const s = NET.slots[i];
  if (NET.inRace) { NET.slots[i] = { type: 'bot', name: s.name + ' (봇)', ready: true, id: 'bot' + i }; api.slotToBot(i); chat(`${s.name} 님의 연결이 끊겨 봇으로 대체됩니다.`); }
  else { NET.slots[i] = null; chat(`${s.name} 님이 나갔습니다.`); }
  pushLobby();
}
const BOTN = ['초록 봇', '노랑 봇', '보라 봇'];
function addBot() { const f = NET.slots.findIndex(s => !s); if (f < 0) return; NET.slots[f] = { type: 'bot', name: BOTN[(f - 1 + 3) % 3], ready: true, id: 'bot' + f }; pushLobby(); }
function removeSlot(i) {
  const s = NET.slots[i]; if (!s || i === 0) return;
  if (s.type === 'human') { const c = NET.conns.get(s.id); if (c) { c.send(JSON.stringify({ t: 'kicked' })); setTimeout(() => c.close(), 200); } chat(`${s.name} 님을 내보냈습니다.`); }
  NET.slots[i] = null; pushLobby();
}
function pushLobby() {
  for (const [pid, c] of NET.conns) if (c.open) c.send(JSON.stringify({ t: 'lobby', slots: NET.slots, you: slotOf(pid), code: NET.code }));
  renderLobby();
}
function canStart() { const n = NET.slots.filter(Boolean).length; return n >= 2 && NET.slots.every(s => !s || s.ready); }
function startRace() {
  if (!canStart()) return; NET.inRace = true;
  const slots = NET.slots.map(s => s && { type: s.type, name: s.name });
  for (const [pid, c] of NET.conns) if (c.open) c.send(JSON.stringify({ t: 'start', slots, you: slotOf(pid) }));
  hideMP(); api.startRace(slots, 0, 'host');
}
export function hostResults(rows) { NET.broadcast({ t: 'results', rows }); api.showResults(rows); setTimeout(backToLobby, 8000); }
function backToLobby() { NET.inRace = false; NET.slots.forEach(s => { if (s && s.type === 'human' && s.id !== 'host') s.ready = false; }); NET.broadcast({ t: 'tolobby' }); api.toLobby(); showLobby(); pushLobby(); }

// ---------------- GUEST ----------------
async function joinRoom(code) {
  code = (code || '').trim().toUpperCase(); if (!/^[A-Z0-9]{4,6}$/.test(code)) { msg('방 코드는 4~6자리 영문/숫자입니다.', true); return; }
  const P = await loadPeer(); const name = nick(); msg('방에 연결하는 중…'); NET.code = code;
  peer = new P(peerOpts());
  let opened = false;
  const to = setTimeout(() => { if (!opened) msg('연결 시간이 초과되었습니다. 코드 확인 또는 WebRTC 차단 여부를 확인하세요.', true); }, 15000);
  peer.on('open', () => {
    const conn = peer.connect(PREFIX + code, { reliable: true }); NET.hostConn = conn;
    conn.on('open', () => { opened = true; clearTimeout(to); NET.mode = 'guest'; NET.send = m => conn.open && conn.send(JSON.stringify(m)); NET.send({ t: 'hello', name }); showLobby(); msg(''); });
    conn.on('data', d => { hostSeen = performance.now(); guestRecv(typeof d === 'string' ? JSON.parse(d) : d); });
    conn.on('close', () => { if (NET.mode === 'guest') leave('호스트가 방을 닫았거나 연결이 끊어졌습니다.'); });
    conn.on('error', () => msg(ERR.webrtc, true));
  });
  peer.on('error', e => { clearTimeout(to); msg(ERR[e.type] || ('연결 오류: ' + e.type), true); });
}
function guestRecv(m) {
  if (m.t === 'lobby') { NET.slots = m.slots; NET.you = m.you; renderLobby(); }
  else if (m.t === 'chat') addChat(m.text);
  else if (m.t === 'reject') { leave(m.msg); }
  else if (m.t === 'kicked') { leave('호스트가 당신을 방에서 내보냈습니다.'); }
  else if (m.t === 'start') { NET.you = m.you; NET.inRace = true; hideMP(); api.startRace(m.slots, m.you, 'guest'); }
  else if (m.t === 'ping') {}
  else if (m.t === 'snap') api.onSnap(m);
  else if (m.t === 'say') api.onSay(m);
  else if (m.t === 'slots') api.onSlots(m);
  else if (m.t === 'results') api.showResults(m.rows);
  else if (m.t === 'tolobby') { NET.inRace = false; api.toLobby(); showLobby(); }
}
function leave(reason) {
  const wasMode = NET.mode; NET.mode = 'solo';
  try { peer && peer.destroy(); } catch (e) {}
  peer = null; NET.conns.clear(); NET.inRace = false;
  if (wasMode !== 'solo' && api) api.leftRoom();
  $('mpLobby').classList.add('hidden'); $('mpMenu').classList.remove('hidden'); $('mp').classList.remove('hidden'); $('title').classList.add('hidden');
  msg(reason || '', !!reason);
  history.replaceState(null, '', location.pathname);
}

// ---------------- UI ----------------
function chat(t) { if (NET.mode === 'host') { NET.broadcast({ t: 'chat', text: t }); addChat(t); } }
function addChat(t) { const l = $('chatLog'); const d = document.createElement('div'); d.textContent = t; l.appendChild(d); l.scrollTop = 1e6; }
function showLobby() { $('title').classList.add('hidden'); $('mp').classList.remove('hidden'); $('mpMenu').classList.add('hidden'); $('mpLobby').classList.remove('hidden'); renderLobby(); }
function hideMP() { $('mp').classList.add('hidden'); }
function renderLobby() {
  const host = NET.mode === 'host';
  $('roomCode').textContent = NET.code;
  $('invite').value = location.origin + location.pathname + '?room=' + NET.code;
  $('slots').innerHTML = NET.slots.map((s, i) => `<div class="slot" style="border-color:${COLORS[i]}"><span class="dot" style="background:${COLORS[i]}"></span>
    ${s ? `<b>${esc(s.name)}</b> ${s.type === 'bot' ? '🤖' : i === 0 ? '👑' : ''} ${i === NET.you ? '<i>(나)</i>' : ''} <span class="rd ${s.ready ? 'on' : ''}">${s.type === 'bot' ? '봇' : s.ready ? '준비 완료' : '대기 중'}</span>
      ${host && i > 0 ? `<button data-rm="${i}">${s.type === 'bot' ? '봇 제거' : '내보내기'}</button>` : ''}` : `<span class="empty">빈 자리</span>`}</div>`).join('');
  $('slots').querySelectorAll('[data-rm]').forEach(b => b.onclick = () => removeSlot(+b.dataset.rm));
  $('addBot').classList.toggle('hidden', !host); $('startRace').classList.toggle('hidden', !host); $('readyBtn').classList.toggle('hidden', host);
  $('addBot').disabled = !NET.slots.some(s => !s); $('startRace').disabled = !canStart();
  const me = NET.slots[NET.you]; $('readyBtn').textContent = me && me.ready ? '준비 취소' : '준비';
  $('lobbyHint').textContent = host ? (canStart() ? '모두 준비되었습니다! 경주를 시작하세요.' : '참가자 2명 이상(봇 포함) + 모두 준비 시 시작할 수 있어요.') : '호스트가 경주를 시작할 때까지 기다려 주세요.';
}
const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// heartbeat: detect silent disconnects (closed tabs / lost networks)
setInterval(() => {
  const now = performance.now();
  if (NET.mode === 'host') { NET.broadcast({ t: 'ping' }); for (const [pid] of NET.conns) if (now - (lastSeen.get(pid) || now) > 6000) { const c = NET.conns.get(pid); try { c.close(); } catch (e) {} hostDrop(pid); } }
  if (NET.mode === 'guest') { NET.send({ t: 'ping' }); if (hostSeen && now - hostSeen > 9000) leave('호스트와의 연결이 끊어졌습니다.'); }
}, 1500);
export function initNet(gameApi) {
  api = gameApi;
  $('nick').value = localStorage.getItem('cartNick') || '';
  $('mpBtn').onclick = () => { api.onMenu(true); $('title').classList.add('hidden'); $('mp').classList.remove('hidden'); };
  $('mpBack').onclick = () => { api.onMenu(false); $('mp').classList.add('hidden'); $('title').classList.remove('hidden'); };
  $('createBtn').onclick = () => createRoom().catch(() => {});
  $('joinBtn').onclick = () => joinRoom($('joinCode').value).catch(() => {});
  $('joinCode').addEventListener('keydown', e => { if (e.key === 'Enter') $('joinBtn').click(); });
  $('addBot').onclick = addBot; $('startRace').onclick = startRace;
  $('readyBtn').onclick = () => { const me = NET.slots[NET.you]; NET.send({ t: 'ready', v: !(me && me.ready) }); };
  $('leaveBtn').onclick = () => leave('');
  $('copyBtn').onclick = async () => { try { await navigator.clipboard.writeText($('invite').value); $('copyBtn').textContent = '복사됨!'; } catch (e) { $('invite').select(); document.execCommand('copy'); $('copyBtn').textContent = '복사됨!'; } setTimeout(() => $('copyBtn').textContent = '복사', 1500); };
  $('chatIn').addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter' && e.target.value.trim()) { const t = e.target.value.trim(); e.target.value = ''; if (NET.mode === 'host') chat(`${NET.slots[0].name}: ${t}`); else NET.send({ t: 'chat', text: t }); } });
  ['nick', 'joinCode', 'invite'].forEach(id => $(id).addEventListener('keydown', e => e.stopPropagation()));
  addEventListener('beforeunload', () => { try { peer && peer.destroy(); } catch (e) {} });
  if (!window.RTCPeerConnection) $('mpNote').textContent = '⚠️ 이 브라우저는 WebRTC를 지원하지 않아 멀티플레이를 사용할 수 없습니다.';
  const room = qs.get('room');
  if (room) { api.onMenu(true); $('title').classList.add('hidden'); $('mp').classList.remove('hidden'); $('joinCode').value = room.toUpperCase(); joinRoom(room).catch(() => {}); }
}
