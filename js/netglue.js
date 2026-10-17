// split out of main.js (no behavior change): multiplayer glue (host snapshots, guest prediction/mirroring, remote carts, MP race end); shared main.js state is reached through G (getters/setters)
import { NET, hostResults, initNet } from './net.js';
import * as THREE from 'three';
import { flash, say } from './hud.js';
import * as FX from './fx.js';
import * as TR from './track.js';
import { sound } from './audio.js';
import { T_LIMIT } from './shop.js';
import { shopRows, showResults, toLobby, leftRoom } from './results.js';
let G = null; export const bind = g => { G = g; };
function onRemoteState(i, s) { const c = G.carts[i]; if (c && c.remote) c.rs = s; }
function onRemoteItem(i) { const c = G.carts[i]; if (c && c.remote) c.useItem = true; }
function onSpawn(a) { if (G.MODE === 'host' && G.products.length < G.MAXP + 20) G.spawnProduct(...a.slice(0, 6).map(Number)); }
function slotToBot(i) { const c = G.carts[i]; if (!c) return; c.remote = false; c.ai = true; c.name += ' (봇)'; G.nameTag(c, c.name); NET.broadcast({ t: 'slots', names: G.carts.map(c => c.name) }); }
function onSlots(m) { (m.names || []).forEach((n, i) => { const c = G.carts[i]; if (c && c !== G.player && !c.inactive && c.name !== n) { c.name = n; G.nameTag(c, n); } }); }
export function applyRemote(c, dt) {
  const s = c.rs; if (!s) return; const k = Math.min(1, dt * 15);
  c.x += (s[0] - c.x) * k; c.z += (s[1] - c.z) * k; c.h = s[2]; c.vd = s[3]; c.v = s[4]; c.drifting = !!s[5]; c.slip = s[6]; c.lap = s[7]; c.idx = s[8]; c.steerIn = s[11];
  if (s[9] && !c.finished) { c.finished = true; c.time = s[10]; G.finishOrder.push(c); }
  c.prog = c.finished ? 1e6 - c.time : c.lap * G.N + c.idx;
  if (c.drifting && Math.abs(c.slip) > 0.75 && (s[12] || 0) > 0.8 && c.riders && c.riders.length) G.hopOut(c, 'drift');
  if (c.magnetT > 0 && c.magTarget) { /* guest applies the pull locally from the snapshot */ }
}
function onRemoteCrash(i, k) { const c = G.carts[i]; if (!c || !c.remote) return; if (c.riders && c.riders.length) G.hopOut(c, 'crash'); if (G.SHOPON() && k > 7 && G.state === 'race') G.shop.crash(c, k); }
export function netFollow(c, dt) {
  const s = c.ns; if (!s) return; const k = Math.min(1, dt * 10);
  if (Math.hypot(s[0] - c.x, s[1] - c.z) > 12) { c.x = s[0]; c.z = s[1]; }
  c.x += (s[0] - c.x) * k; c.z += (s[1] - c.z) * k; c.h += G.ang(s[2] - c.h) * k; c.vd = s[3]; c.v = s[4]; c.drifting = !!s[5]; c.slip = s[6];
  c.lap = s[7]; c.idx = s[8]; c.prog = s[9]; c.finished = !!s[10]; c.time = s[11]; c.shieldT = s[13] ? 1 : 0; c.riderN = s[14];
}
function makeSnap(full) {
  const S = Object.assign({ t: 'snap',
    c: G.carts.map(c => c.inactive ? null : [G.r2(c.x), G.r2(c.z), G.r2(c.h), G.r2(c.vd), G.r2(c.v), c.drifting ? 1 : 0, G.r2(c.slip || 0), c.lap, c.idx, Math.round(c.prog), c.finished ? 1 : 0, G.r2(c.time), c.item, c.shieldT > 0 ? 1 : 0, G.nRiders(c), c.hitSeq || 0, c.magnetT > 0 && c.magTarget ? G.carts.indexOf(c.magTarget) : -1, G.r2(c.slipT || 0)]),
    cu: G.customers.map(cu => { const p = cu.holder.position, q = cu.holder.quaternion; return [G.r2(p.x), G.r2(p.y), G.r2(p.z), G.r2(q.x), G.r2(q.y), G.r2(q.z), G.r2(q.w), G.CU_ST.indexOf(cu.state), cu.state === 'ride' ? G.carts.indexOf(cu.cart) : -1, cu.seat || 0]; }) }, G.fun.snap());
  if (full) S.pr = G.products.map(p => { const b = p.body; return [p.k, G.r2(b.position.x), G.r2(b.position.y), G.r2(b.position.z), G.r2(b.quaternion.x), G.r2(b.quaternion.y), G.r2(b.quaternion.z), G.r2(b.quaternion.w)]; });
  else delete S.pp;
  if (G.SHOPON()) S.sh = G.shop.snap();
  return S;
}
export const mirror = [];
function onSnap(m) {
  if (G.MODE !== 'guest') return;
  m.c.forEach((a, i) => { const c = G.carts[i]; if (!a || !c) return;
    if (c === G.player) { G.player.item = a[12]; G.player.shieldT = a[13] ? 1 : 0; G.player.riderN = a[14];
      if (a[16] >= 0 && G.carts[a[16]]) { G.player.magnetT = 0.3; G.player.magTarget = G.carts[a[16]]; }
      if (a[17] > 0) G.player.slipT = Math.max(G.player.slipT || 0, a[17]);
      if (a[15] > (G.player.hitSeqSeen || 0)) { G.player.hitSeqSeen = a[15]; if (performance.now() - (G.player.predHitAt || 0) > 1200) guestHit(); } }
    else c.ns = a; });
  m.cu.forEach((a, i) => { if (G.customers[i]) G.customers[i].nt = a; });
  if (m.pr) { m.pr.forEach((a, i) => { let mm = mirror[i]; const K = G.PKINDS[a[0]] || G.PKINDS[0];
      if (!mm || mm.k !== a[0]) { if (mm) G.scene.remove(mm.mesh); mm = mirror[i] = { k: a[0], mesh: new THREE.Mesh(K.g, K.m || G.pMats[i % G.pMats.length]) }; G.scene.add(mm.mesh); }
      mm.mesh.visible = true; mm.mesh.position.set(a[1], a[2], a[3]); mm.mesh.quaternion.set(a[4], a[5], a[6], a[7]); });
    for (let i = m.pr.length; i < mirror.length; i++) mirror[i].mesh.visible = false; }
  G.fun.applySnap(m);
  if (m.sh && G.shop) G.shop.applySnap(m.sh);
}
const _q = new THREE.Quaternion();
export function guestCustomers(dt) {
  const k = Math.min(1, dt * 10);
  for (const cu of G.customers) { const a = cu.nt; if (!a) continue; const h = cu.holder, ox = h.position.x, oz = h.position.z;
    if (Math.hypot(a[0] - ox, a[2] - oz) > 6) h.position.set(a[0], a[1], a[2]); else { h.position.x += (a[0] - ox) * k; h.position.y += (a[1] - h.position.y) * k; h.position.z += (a[2] - oz) * k; }
    cu.state = G.CU_ST[a[7]] || 'walk';
    if (cu.state === 'ride' && G.carts[a[8]]) { const c = G.carts[a[8]]; cu.t = (cu.t || 0) + dt; G.ridePose(cu, c, a[9], Math.max(1, G.nRiders(c))); cu.x = h.position.x; cu.z = h.position.z; continue; }
    _q.set(a[3], a[4], a[5], a[6]); h.quaternion.slerp(_q, k); h.scale.setScalar(1);
    const moved = Math.hypot(h.position.x - ox, h.position.z - oz); cu.t = (cu.t || 0) + moved * 4; cu.g.walk(cu.state === 'walk' && moved > 0.002 ? cu.t : 0);
    cu.x = h.position.x; cu.z = h.position.z; }
}
function guestHit() { const p = G.player; p.spin = 1.1; p.v *= 0.35; p.drifting = false; G.shake = 0.7; flash('당했다! 🌀'); FX.comic(p.x, 2 + hAt(p.x, p.z), p.z, G.pick(['POW!', '퍽!', '빙글~']), '#ff4081'); FX.screenFlash('#fff', 0.45); sound.bump(1); G.puff(p.x, 0.8, p.z, 0xffffff, 6); }
export function guestBumps(c) {
  if (c !== G.player) return;
  // effects the host can't apply to a locally-predicted cart: predicted banana spin, wet signs, fallen customers, VIP/forklift, loose products
  for (const h of G.fun.hazards) { const d = Math.hypot(c.x - h.x, c.z - h.z);
    if (h.type === 'banana' && d < h.r + 0.4 && !h.gone && h.arm <= 0) { h.gone = true; h.mesh.visible = false; const sh = c.shieldT > 0; NET.send({ t: 'hz', id: h.id, sh }); if (sh) { c.shieldT = 0; say(c, '실드로 막았다!', 1.3, true); } else { c.predHitAt = performance.now(); guestHit(); } }
    else if (h.type === 'sign' && d < h.r + 0.4 && !h.gone && h.arm <= 0) { h.gone = true; NET.send({ t: 'hz', id: h.id }); h.mesh.visible = false; c.v *= 0.55; G.puff(h.x, 0.6, h.z, 0xffd600, 5); sound.bump(0.8); G.shake = Math.max(G.shake, 0.3); } }
  for (const cu of G.customers) if ((cu.state === 'down' || cu.state === 'rise') && G.circlePush(c, cu.holder.position.x, cu.holder.position.z, 1.7, 0.9)) {}
  const E = G.fun.ev; if (E.vip) G.circlePush(c, E.vip.x, E.vip.z, 3.4, 0.9); if (E.fork && E.forkT) G.circlePush(c, E.forkT[0], E.forkT[1], 2.2, 0.6);
  for (const m of mirror) if (m.mesh.visible) { const b = m.mesh.position; if (b.y - hAt(b.x, b.z) < 0.6 && Math.abs(b.x - c.x) < 1.4 && Math.abs(b.z - c.z) < 1.4) c.v *= 0.993; }
  for (const cu of G.customers) if (cu.state === 'walk' && Math.hypot(c.x - cu.x, c.z - cu.z) < 1.3 && (c.bump || 0) <= 0) { c.v *= Math.abs(c.v) > 9 ? 0.75 : 0.5; c.bump = 0.6; sound.bump(0.6); }
}
function onSay(m) { const ent = m.k === 'u' ? G.customers[m.i] : G.carts[m.i]; if (ent && !ent.inactive) say(ent, m.text, m.dur, true); }
export function netSay(ent, text, dur) { const i = G.customers.indexOf(ent), j = G.carts.indexOf(ent); if (i >= 0) NET.broadcast({ t: 'say', k: 'u', i, text, dur }); else if (j >= 0) NET.broadcast({ t: 'say', k: 'c', i: j, text, dur }); }
function myState() { const c = G.player; return [G.r2(c.x), G.r2(c.z), G.r2(c.h), G.r2(c.vd), G.r2(c.v), c.drifting ? 1 : 0, G.r2(c.slip || 0), c.lap, c.idx, c.finished ? 1 : 0, G.r2(c.time), c.steerIn || 0, G.r2(c.driftT || 0)]; }
export function mpFinish() { flash('🏁 완주! 다른 참가자를 기다리는 중…'); G.msgT = 6; G.startCut(G.finishOrder[0] && !G.finishOrder[0].inactive ? G.finishOrder[0] : G.player); }
export function mpTick(dt) {
  if (G.MODE === 'host' && (G.state === 'countdown' || G.state === 'race')) {
    G.netAcc += dt; if (G.netAcc >= 1 / 15) { G.netAcc = 0; G.snapN++; NET.broadcast(makeSnap(G.snapN % 3 === 0)); }
    if (G.state === 'race' && !G.mpDone) {
      const humans = G.carts.filter(c => !c.inactive && (c === G.player || c.remote));
      if (!G.firstFinT && G.carts.some(c => !c.inactive && c.finished)) G.firstFinT = G.raceT;
      const allDone = G.carts.every(c => c.inactive || c.finished);
      if (G.SHOPON() ? (allDone || (G.firstFinT && G.raceT - G.firstFinT > 45) || (G.TLIM && G.raceT >= T_LIMIT)) : (humans.every(c => c.finished) || (G.firstFinT && G.raceT - G.firstFinT > 30))) {
        G.mpDone = true; const act = G.carts.filter(c => !c.inactive);
        const order = [...G.finishOrder.filter(c => !c.inactive), ...act.filter(c => !c.finished).sort((a, b) => b.prog - a.prog)];
        if (G.SHOPON()) hostResults(shopRows().map(r => ({ name: r.name, time: r.time, bot: r.bot, i: r.i, score: r.score, rc: r.rc })));
        else hostResults(order.map(c => ({ name: c.name, time: c.finished ? c.time : null, bot: !!c.ai })));
      }
    }
  }
  if (G.MODE === 'guest' && (G.state === 'countdown' || G.state === 'race')) {
    G.netAcc += dt; if (G.netAcc >= 0.05) { G.netAcc = 0; NET.send({ t: 'st', s: myState() }); }
    if (G.player.useItem) { G.player.useItem = false; if (G.player.item || (G.SHOPON() && G.shop.nearest(G.player, 3.0))) NET.send({ t: 'item' }); }
  }
}

export function init() {
  initNet({ getChar: () => G.MYCHAR, getOpts: () => G.optsNow(), onOpts: G.onOpts, getMap: () => TR.MAP_ID, onMap: id => { if (id !== TR.MAP_ID) G.loadMap(id); }, renderMaps: () => G.renderMaps(), onRemoteHazard: (i, id, sh) => { const c = G.carts[i]; if (c && c.remote) G.fun.remoteHazardHit(c, id, sh); }, startRace: G.startRaceMP, onRemoteState, onRemoteCrash, onRemoteItem, onSpawn, slotToBot, onSnap, onSay, onSlots, showResults, toLobby, leftRoom,
  onMenu: open => { if (G.state === 'title' || G.state === 'lobby') G.state = open ? 'lobby' : 'title'; } });
}
