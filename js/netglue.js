/**
 * netglue.js — multiplayer glue between net.js and the race: host snapshots, guest prediction/mirroring,
 * remote carts, speech/customer sync, MP race end. Split out of main.js; shared state comes from state.js (S, ctx).
 */
import { NET, hostResults, initNet } from './net.js';
import { loadout } from './parts.js';
import * as THREE from 'three';
import { flash, say } from './hud.js';
import * as FX from './fx.js';
import * as TR from './track.js';
import { hAt } from './track.js';
import { sound } from './audio.js';

import { T_LIMIT } from './config/shop.js';
import { shopRows, showResults, toLobby, leftRoom } from './results.js';
import { S, ctx } from './state.js';
import { MAXP } from './config/tuning.js';
import { $, r2, pick } from './util.js';

function onRemoteState(i, s) {
  const c = ctx.carts[i];
  if (c && c.remote) c.rs = s;
}
function onRemoteItem(i) {
  const c = ctx.carts[i];
  if (c && c.remote) c.useItem = true;
}
function onSpawn(a) {
  if (S.MODE === 'host' && ctx.products.length < MAXP + 20) ctx.spawnProduct(...a.slice(0, 6).map(Number));
}
function slotToBot(i) {
  const c = ctx.carts[i];
  if (!c) return;
  c.remote = false;
  c.ai = true;
  c.name += ' (봇)';
  ctx.nameTag(c, c.name);
  NET.broadcast({ t: 'slots', names: ctx.carts.map(c => c.name) });
}
// rejoin (E2): a dropped guest came back with its room token -> the replacement bot hands the cart back
function slotToHuman(i, name) {
  const c = ctx.carts[i];
  if (!c) return;
  c.ai = false;
  c.remote = true;
  c.rs = null;
  c.name = name;
  ctx.nameTag(c, name);
  NET.broadcast({ t: 'slots', names: ctx.carts.map(c => c.name) });
}
const REJOIN_KEYS = ['x', 'z', 'h', 'vd', 'v', 'lap', 'idx', 'prog', 'finished', 'time', 'lapT0', 'laps', 'n2o', 'gauge', 'item'];
function rejoinState(i) {
  const c = ctx.carts[i],
    me = {};
  for (const k of REJOIN_KEYS) me[k] = c[k];
  return { raceT: S.raceT, state: S.state, me };
}
// guest side: jump straight into the running race (no countdown/intro); late joiners only watch
function rejoinRace(r) {
  if (r.state !== 'countdown') {
    S.state = 'race';
    S.cd = 0;
    ctx.showIntro(false);
    $('countdown').textContent = '';
  }
  S.raceT = +r.raceT || 0;
  if (r.spec) {
    S.player.lateSpec = true; // watched only: no coins
    ctx.startSpectate();
    flash('👀 레이스가 진행 중이에요 — 관전하다가 다음 레이스부터 참가합니다');
    S.msgT = 5;
    return;
  }
  if (r.me) {
    Object.assign(S.player, r.me);
    S.player.rs = null;
  }
  flash('📡 다시 연결되었습니다! 레이스를 이어서 달려요');
  S.msgT = 3;
}
function netNote(t) {
  flash(t);
  S.msgT = 3;
}
function onSlots(m) {
  (m.names || []).forEach((n, i) => {
    const c = ctx.carts[i];
    if (c && c !== S.player && !c.inactive && c.name !== n) {
      c.name = n;
      ctx.nameTag(c, n);
    }
  });
}
export function applyRemote(c, dt) {
  const s = c.rs;
  if (!s) return;
  const k = Math.min(1, dt * 15);
  c.x += (s[0] - c.x) * k;
  c.z += (s[1] - c.z) * k;
  c.h = s[2];
  c.vd = s[3];
  c.v = s[4];
  c.drifting = !!s[5];
  c.slip = s[6];
  c.lap = s[7];
  c.idx = s[8];
  c.steerIn = s[11];
  if (s[9] && !c.finished) {
    c.finished = true;
    c.time = s[10];
    ctx.finishOrder.push(c);
  }
  c.prog = c.finished ? 1e6 - c.time : c.lap * S.N + c.idx;
  if (c.drifting && Math.abs(c.slip) > 0.75 && (s[12] || 0) > 0.8 && c.riders && c.riders.length) ctx.hopOut(c, 'drift');
  if (c.magnetT > 0 && c.magTarget) {
    /* guest applies the pull locally from the snapshot */
  }
}
function onRemoteCrash(i, k) {
  const c = ctx.carts[i];
  if (!c || !c.remote) return;
  if (c.riders && c.riders.length) ctx.hopOut(c, 'crash');
  if (ctx.SHOPON() && k > 7 && S.state === 'race') S.shop.crash(c, k);
}
export function netFollow(c, dt) {
  const s = c.ns;
  if (!s) return;
  const k = Math.min(1, dt * 10);
  if (Math.hypot(s[0] - c.x, s[1] - c.z) > 12) {
    c.x = s[0];
    c.z = s[1];
  }
  c.x += (s[0] - c.x) * k;
  c.z += (s[1] - c.z) * k;
  c.h += ctx.ang(s[2] - c.h) * k;
  c.vd = s[3];
  c.v = s[4];
  c.drifting = !!s[5];
  c.slip = s[6];
  c.lap = s[7];
  c.idx = s[8];
  c.prog = s[9];
  c.finished = !!s[10];
  c.time = s[11];
  c.shieldT = s[13] ? 1 : 0;
  c.riderN = s[14];
}
function makeSnap(full) {
  const snap = Object.assign(
    {
      t: 'snap',
      c: ctx.carts.map(c =>
        c.inactive
          ? null
          : [
              r2(c.x),
              r2(c.z),
              r2(c.h),
              r2(c.vd),
              r2(c.v),
              c.drifting ? 1 : 0,
              r2(c.slip || 0),
              c.lap,
              c.idx,
              Math.round(c.prog),
              c.finished ? 1 : 0,
              r2(c.time),
              c.item,
              c.shieldT > 0 ? 1 : 0,
              ctx.nRiders(c),
              c.hitSeq || 0,
              c.magnetT > 0 && c.magTarget ? ctx.carts.indexOf(c.magTarget) : -1,
              r2(c.slipT || 0),
            ],
      ),
      cu: ctx.customers.map(cu => {
        const p = cu.holder.position,
          q = cu.holder.quaternion;
        return [
          r2(p.x),
          r2(p.y),
          r2(p.z),
          r2(q.x),
          r2(q.y),
          r2(q.z),
          r2(q.w),
          ctx.CU_ST.indexOf(cu.state),
          cu.state === 'ride' ? ctx.carts.indexOf(cu.cart) : -1,
          cu.seat || 0,
        ];
      }),
    },
    S.fun.snap(),
  );
  if (full)
    snap.pr = ctx.products.map(p => {
      const b = p.body;
      return [
        p.k,
        r2(b.position.x),
        r2(b.position.y),
        r2(b.position.z),
        r2(b.quaternion.x),
        r2(b.quaternion.y),
        r2(b.quaternion.z),
        r2(b.quaternion.w),
      ];
    });
  else delete snap.pp;
  if (ctx.SHOPON()) snap.sh = S.shop.snap();
  snap.mg = S.mgr.snap();
  return snap;
}
export const mirror = [];
function onSnap(m) {
  if (S.MODE !== 'guest') return;
  m.c.forEach((a, i) => {
    const c = ctx.carts[i];
    if (!a || !c) return;
    if (c === S.player) {
      S.player.item = a[12];
      S.player.shieldT = a[13] ? 1 : 0;
      S.player.riderN = a[14];
      if (a[16] >= 0 && ctx.carts[a[16]]) {
        S.player.magnetT = 0.3;
        S.player.magTarget = ctx.carts[a[16]];
      }
      if (a[17] > 0) S.player.slipT = Math.max(S.player.slipT || 0, a[17]);
      if (a[15] > (S.player.hitSeqSeen || 0)) {
        S.player.hitSeqSeen = a[15];
        if (performance.now() - (S.player.predHitAt || 0) > 1200) guestHit();
      }
    } else c.ns = a;
  });
  m.cu.forEach((a, i) => {
    if (ctx.customers[i]) ctx.customers[i].nt = a;
  });
  if (m.pr) {
    m.pr.forEach((a, i) => {
      let mm = mirror[i];
      const K = ctx.PKINDS[a[0]] || ctx.PKINDS[0];
      if (!mm || mm.k !== a[0]) {
        if (mm) ctx.scene.remove(mm.mesh);
        mm = mirror[i] = { k: a[0], mesh: new THREE.Mesh(K.g, K.m || ctx.pMats[i % ctx.pMats.length]) };
        ctx.scene.add(mm.mesh);
      }
      mm.mesh.visible = true;
      mm.mesh.position.set(a[1], a[2], a[3]);
      mm.mesh.quaternion.set(a[4], a[5], a[6], a[7]);
    });
    for (let i = m.pr.length; i < mirror.length; i++) mirror[i].mesh.visible = false;
  }
  S.fun.applySnap(m);
  S.mgr.applySnap(m.mg);
  if (m.sh && S.shop) S.shop.applySnap(m.sh);
}
const _q = new THREE.Quaternion();
export function guestCustomers(dt) {
  const k = Math.min(1, dt * 10);
  for (const cu of ctx.customers) {
    const a = cu.nt;
    if (!a) continue;
    const h = cu.holder,
      ox = h.position.x,
      oz = h.position.z;
    if (Math.hypot(a[0] - ox, a[2] - oz) > 6) h.position.set(a[0], a[1], a[2]);
    else {
      h.position.x += (a[0] - ox) * k;
      h.position.y += (a[1] - h.position.y) * k;
      h.position.z += (a[2] - oz) * k;
    }
    cu.state = ctx.CU_ST[a[7]] || 'walk';
    if (cu.state === 'ride' && ctx.carts[a[8]]) {
      const c = ctx.carts[a[8]];
      cu.t = (cu.t || 0) + dt;
      ctx.ridePose(cu, c, a[9], Math.max(1, ctx.nRiders(c)));
      cu.x = h.position.x;
      cu.z = h.position.z;
      continue;
    }
    _q.set(a[3], a[4], a[5], a[6]);
    h.quaternion.slerp(_q, k);
    h.scale.setScalar(1);
    const moved = Math.hypot(h.position.x - ox, h.position.z - oz);
    cu.t = (cu.t || 0) + moved * 4;
    cu.g.walk(cu.state === 'walk' && moved > 0.002 ? cu.t : 0);
    cu.x = h.position.x;
    cu.z = h.position.z;
  }
}
function guestHit() {
  const p = S.player;
  p.spin = 1.1;
  p.v *= 0.35;
  p.drifting = false;
  S.shake = 0.7;
  flash('당했다! 🌀');
  FX.comic(p.x, 2 + hAt(p.x, p.z), p.z, pick(['POW!', '퍽!', '빙글~']), '#ff4081');
  FX.screenFlash('#fff', 0.45);
  sound.bump(1);
  ctx.puff(p.x, 0.8, p.z, 0xffffff, 6);
}
export function guestBumps(c) {
  if (c !== S.player) return;
  // effects the host can't apply to a locally-predicted cart: predicted banana spin, wet signs, fallen customers, VIP/forklift, loose products
  for (const h of S.fun.hazards) {
    const d = Math.hypot(c.x - h.x, c.z - h.z);
    if (h.type === 'banana' && d < h.r + 0.4 && !h.gone && h.arm <= 0) {
      h.gone = true;
      h.mesh.visible = false;
      const sh = c.shieldT > 0;
      NET.send({ t: 'hz', id: h.id, sh });
      if (sh) {
        c.shieldT = 0;
        say(c, '실드로 막았다!', 1.3, true);
      } else {
        c.predHitAt = performance.now();
        guestHit();
      }
    } else if (h.type === 'sign' && d < h.r + 0.4 && !h.gone && h.arm <= 0) {
      h.gone = true;
      NET.send({ t: 'hz', id: h.id });
      h.mesh.visible = false;
      c.v *= 0.55;
      ctx.puff(h.x, 0.6, h.z, 0xffd600, 5);
      sound.bump(0.8);
      S.shake = Math.max(S.shake, 0.3);
    }
  }
  for (const cu of ctx.customers)
    if ((cu.state === 'down' || cu.state === 'rise') && ctx.circlePush(c, cu.holder.position.x, cu.holder.position.z, 1.7, 0.9)) {
    }
  const E = S.fun.ev;
  if (E.vip) ctx.circlePush(c, E.vip.x, E.vip.z, 3.4, 0.9);
  if (E.fork && E.forkT) ctx.circlePush(c, E.forkT[0], E.forkT[1], 2.2, 0.6);
  for (const m of mirror)
    if (m.mesh.visible) {
      const b = m.mesh.position;
      if (b.y - hAt(b.x, b.z) < 0.6 && Math.abs(b.x - c.x) < 1.4 && Math.abs(b.z - c.z) < 1.4) c.v *= 0.993;
    }
  for (const cu of ctx.customers)
    if (cu.state === 'walk' && Math.hypot(c.x - cu.x, c.z - cu.z) < 1.3 && (c.bump || 0) <= 0) {
      c.v *= Math.abs(c.v) > 9 ? 0.75 : 0.5;
      c.bump = 0.6;
      sound.bump(0.6);
    }
}
function onSay(m) {
  const ent = m.k === 'u' ? ctx.customers[m.i] : ctx.carts[m.i];
  if (ent && !ent.inactive) say(ent, m.text, m.dur, true);
}
export function netSay(ent, text, dur) {
  const i = ctx.customers.indexOf(ent),
    j = ctx.carts.indexOf(ent);
  if (i >= 0) NET.broadcast({ t: 'say', k: 'u', i, text, dur });
  else if (j >= 0) NET.broadcast({ t: 'say', k: 'c', i: j, text, dur });
}
function myState() {
  const c = S.player;
  return [
    r2(c.x),
    r2(c.z),
    r2(c.h),
    r2(c.vd),
    r2(c.v),
    c.drifting ? 1 : 0,
    r2(c.slip || 0),
    c.lap,
    c.idx,
    c.finished ? 1 : 0,
    r2(c.time),
    c.steerIn || 0,
    r2(c.driftT || 0),
  ];
}
export function mpFinish() {
  flash('🏁 완주! 다른 참가자를 기다리는 중…');
  S.msgT = 6;
  ctx.startCut(ctx.finishOrder[0] && !ctx.finishOrder[0].inactive ? ctx.finishOrder[0] : S.player);
}
export function mpTick(dt) {
  if (S.MODE === 'host' && (S.state === 'countdown' || S.state === 'race')) {
    S.netAcc += dt;
    if (S.netAcc >= 1 / 15) {
      S.netAcc = 0;
      S.snapN++;
      NET.broadcast(makeSnap(S.snapN % 3 === 0));
    }
    if (S.state === 'race' && !S.mpDone) {
      const humans = ctx.carts.filter(c => !c.inactive && (c === S.player || c.remote));
      if (!S.firstFinT && ctx.carts.some(c => !c.inactive && c.finished)) S.firstFinT = S.raceT;
      const allDone = ctx.carts.every(c => c.inactive || c.finished);
      if (
        ctx.SHOPON()
          ? allDone || (S.firstFinT && S.raceT - S.firstFinT > 45) || (S.TLIM && S.raceT >= T_LIMIT)
          : humans.every(c => c.finished) || (S.firstFinT && S.raceT - S.firstFinT > 30)
      ) {
        S.mpDone = true;
        const act = ctx.carts.filter(c => !c.inactive);
        const order = [...ctx.finishOrder.filter(c => !c.inactive), ...act.filter(c => !c.finished).sort((a, b) => b.prog - a.prog)];
        if (ctx.SHOPON()) hostResults(shopRows().map(r => ({ name: r.name, time: r.time, bot: r.bot, i: r.i, score: r.score, rc: r.rc })));
        else hostResults(order.map(c => ({ name: c.name, time: c.finished ? c.time : null, bot: !!c.ai, i: ctx.carts.indexOf(c) })));
      }
    }
  }
  if (S.MODE === 'guest' && (S.state === 'countdown' || S.state === 'race')) {
    S.netAcc += dt;
    if (S.netAcc >= 0.05) {
      S.netAcc = 0;
      NET.send({ t: 'st', s: myState() });
    }
    if (S.player.useItem) {
      S.player.useItem = false;
      if (S.player.item || (ctx.SHOPON() && S.shop.nearest(S.player, 3.0))) NET.send({ t: 'item' });
    }
  }
}

export function init() {
  initNet({
    getChar: () => S.MYCHAR,
    getParts: () => loadout(),
    getOpts: () => ctx.optsNow(),
    onOpts: ctx.onOpts,
    getMap: () => TR.MAP_ID,
    onMap: id => {
      if (id !== TR.MAP_ID) ctx.loadMap(id);
    },
    renderMaps: () => ctx.renderMaps(),
    onRemoteHazard: (i, id, sh) => {
      const c = ctx.carts[i];
      if (c && c.remote) S.fun.remoteHazardHit(c, id, sh);
    },
    onRemoteMg: (i, m) => S.mgr.remoteHit(i, m),
    startRace: ctx.startRaceMP,
    onRemoteState,
    onRemoteCrash,
    onRemoteItem,
    onSpawn,
    slotToBot,
    onSnap,
    onSay,
    onSlots,
    slotToHuman,
    rejoinState,
    rejoinRace,
    netNote,
    showResults,
    toLobby,
    leftRoom,
    onMenu: open => {
      if (S.state === 'title' || S.state === 'lobby') S.state = open ? 'lobby' : 'title';
    },
  });
}
