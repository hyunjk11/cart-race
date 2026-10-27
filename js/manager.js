/**
 * manager.js — 점장 (store manager) catch-up NPC. He rides a scissor lift up on the shelf line ahead of the race leader,
 * yells through his megaphone and lobs comic stuff (MG_THROWS) at the leader (sometimes 2nd) in an arc, with a red
 * warning circle where it will land. Host/solo decide everything and keep an event log (show/throw/hit/hide) that guests
 * replay from snapshots; a guest resolves hits on its own cart and reports them ({t:'mg'}) like hazards.
 * Tuning: MANAGER in config/tuning.js; throwables + lines in config/items.js.
 */
import * as THREE from 'three';
import * as TR from './track.js';
import { hAt } from './track.js';
import { MANAGER as MG } from './config/tuning.js';
import { MG_THROWS, MG_LINES } from './config/items.js';

const TYPES = Object.keys(MG_THROWS);
const toon = c => new THREE.MeshToonMaterial({ color: c });
const mesh = (g, m, x = 0, y = 0, z = 0) => {
  const o = new THREE.Mesh(g, m);
  o.position.set(x, y, z);
  return o;
};
function tagTex(text, bg, fg, w = 128, h = 56, font = 34) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  g.fillStyle = fg;
  g.font = `${font}px Jua, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, w / 2, h / 2 + 2, w - 8);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** The manager himself: chubby suit, big head, comb-over, mustache, round glasses, red tie, name tag, megaphone. */
function makeManagerModel() {
  const root = new THREE.Group(),
    bob = new THREE.Group();
  root.add(bob);
  const skin = toon(0xffdcc0),
    suit = toon(0x34495e),
    white = toon(0xffffff),
    dark = new THREE.MeshBasicMaterial({ color: 0x1a1020 });
  const body = mesh(new THREE.CapsuleGeometry(0.36, 0.3, 6, 14), suit, 0, 0.72, 0);
  body.scale.set(1.15, 1, 1);
  bob.add(body);
  const shirt = mesh(new THREE.SphereGeometry(0.24, 12, 10), white, 0, 0.82, 0.25);
  shirt.scale.set(0.75, 1.1, 0.45);
  bob.add(shirt);
  const tie = mesh(new THREE.ConeGeometry(0.075, 0.36, 4), toon(0xe53935), 0, 0.74, 0.37);
  tie.rotation.x = Math.PI;
  bob.add(tie);
  bob.add(mesh(new THREE.BoxGeometry(0.1, 0.07, 0.06), toon(0xe53935), 0, 0.94, 0.34));
  // name tag "점장"
  const tag = mesh(
    new THREE.PlaneGeometry(0.28, 0.13),
    new THREE.MeshBasicMaterial({ map: tagTex('점장', '#fff', '#1565c0') }),
    0.2,
    0.86,
    0.37,
  );
  tag.rotation.y = 0.35;
  bob.add(tag);
  // head
  const headG = new THREE.Group();
  headG.position.y = 1.42;
  bob.add(headG);
  const head = mesh(new THREE.SphereGeometry(0.5, 24, 18), skin);
  head.scale.set(1.08, 0.95, 1);
  headG.add(head);
  const hairM = toon(0x4e4e4e);
  for (const s of [-1, 1]) {
    const tuft = mesh(new THREE.SphereGeometry(0.17, 12, 10), hairM, s * 0.44, 0.02, -0.08);
    tuft.scale.set(0.6, 1, 1.2);
    headG.add(tuft);
    // round glasses
    const ring = mesh(new THREE.TorusGeometry(0.11, 0.018, 6, 18), dark, s * 0.17, 0.04, 0.47);
    headG.add(ring);
    const eye = mesh(new THREE.SphereGeometry(0.05, 10, 8), dark, s * 0.17, 0.04, 0.46);
    eye.scale.set(1, 1.2, 0.5);
    headG.add(eye);
    const mus = mesh(new THREE.CapsuleGeometry(0.045, 0.14, 4, 8), hairM, s * 0.09, -0.12, 0.48);
    mus.rotation.z = s * 1.2;
    headG.add(mus);
    const blush = mesh(
      new THREE.CircleGeometry(0.07, 12),
      new THREE.MeshBasicMaterial({ color: 0xff8fb0, transparent: true, opacity: 0.7 }),
    );
    blush.position.set(s * 0.33, -0.1, 0.38);
    blush.rotation.y = s * 0.6;
    headG.add(blush);
  }
  headG.add(mesh(new THREE.BoxGeometry(0.13, 0.02, 0.02), dark, 0, 0.06, 0.5)); // glasses bridge
  // comb-over: three strands across the bald top
  for (let k = 0; k < 3; k++) {
    const st = mesh(new THREE.CapsuleGeometry(0.03, 0.55, 4, 6), hairM, 0, 0.43 - k * 0.02, 0.12 - k * 0.12);
    st.rotation.z = Math.PI / 2 + 0.25;
    st.rotation.x = 0.15 + k * 0.25;
    headG.add(st);
  }
  const mouth = mesh(new THREE.SphereGeometry(0.07, 10, 8), toon(0xc62828), 0, -0.24, 0.44);
  mouth.scale.set(1.2, 0.8, 0.5);
  headG.add(mouth);
  // arms: left holds the megaphone, right throws
  const arm = s => {
    const ap = new THREE.Group();
    ap.position.set(s * 0.42, 1.0, 0.02);
    bob.add(ap);
    ap.add(mesh(new THREE.CapsuleGeometry(0.09, 0.32, 4, 8), suit, 0, -0.22, 0));
    ap.add(mesh(new THREE.SphereGeometry(0.1, 10, 8), skin, 0, -0.46, 0));
    return ap;
  };
  const armL = arm(1),
    armR = arm(-1);
  const mega = new THREE.Group();
  mega.add(mesh(new THREE.CylinderGeometry(0.2, 0.06, 0.42, 14, 1, true), toon(0xff9800)));
  mega.children[0].material.side = THREE.DoubleSide;
  mega.add(mesh(new THREE.CylinderGeometry(0.205, 0.205, 0.05, 14, 1, true), white, 0, 0.2, 0));
  mega.children[1].material.side = THREE.DoubleSide;
  mega.position.set(0, -0.5, 0.18);
  mega.rotation.x = -1.2;
  armL.add(mega);
  for (const s of [-1, 1]) {
    const lp = new THREE.Group();
    lp.position.set(s * 0.17, 0.38, 0);
    root.add(lp);
    lp.add(mesh(new THREE.CapsuleGeometry(0.1, 0.18, 4, 8), suit, 0, -0.16, 0));
    const shoe = mesh(new THREE.SphereGeometry(0.12, 10, 8), toon(0x3e2723), 0, -0.33, 0.05);
    shoe.scale.set(1, 0.6, 1.5);
    lp.add(shoe);
  }
  root.scale.setScalar(1.7);
  return { root, bob, headG, armL, armR, mouth };
}
/** Yellow scissor lift: base, criss-cross arms (scaled to the lift height), platform with a railing. */
function makeLift() {
  const g = new THREE.Group(),
    y = toon(0xffc107),
    k = toon(0x424242);
  g.add(mesh(new THREE.BoxGeometry(1.7, 0.3, 1.7), y, 0, 0.15, 0));
  const arms = new THREE.Group();
  for (const s of [-1, 1])
    for (const zz of [-0.75, 0.75]) {
      const a = mesh(new THREE.BoxGeometry(0.08, 1.15, 0.08), k, 0, 0.5, zz);
      a.rotation.z = s * 0.95;
      arms.add(a);
    }
  arms.position.y = 0.3;
  g.add(arms);
  const top = new THREE.Group();
  top.add(mesh(new THREE.BoxGeometry(1.8, 0.14, 1.8), y));
  for (const [x, z, w, d] of [
    [0, -0.85, 1.8, 0.06],
    [0.85, 0, 0.06, 1.8],
    [-0.85, 0, 0.06, 1.8],
  ]) {
    top.add(mesh(new THREE.BoxGeometry(w, 0.06, d), y, x, 0.55, z));
    top.add(mesh(new THREE.BoxGeometry(0.06, 0.55, 0.06), y, x + (w > 1 ? 0.85 : 0), 0.28, z + (d > 1 ? 0.85 : 0)));
  }
  g.add(top);
  // "점장" warning sign hanging on the railing
  const sign = mesh(
    new THREE.PlaneGeometry(1.2, 0.36),
    new THREE.MeshBasicMaterial({ map: tagTex('📢 점장', '#d32f2f', '#fff', 192, 58, 40), side: THREE.DoubleSide }),
  );
  sign.position.set(0, 0.36, 0.9);
  top.add(sign);
  return {
    g,
    set(h) {
      arms.scale.y = Math.max(0.05, (h - 0.3) / 1);
      top.position.y = Math.max(0.37, h);
    },
  };
}
/** One mesh group per throwable type (pooled, toggled visible). */
function makeThrowable(type) {
  const g = new THREE.Group();
  if (type === 'mop') {
    const st = mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.8, 6), toon(0x8d6e63));
    g.add(st);
    const hd = mesh(new THREE.SphereGeometry(0.38, 10, 8), toon(0xb3e5fc), 0, -0.95, 0);
    hd.scale.set(1.2, 0.6, 1.2);
    g.add(hd);
  } else if (type === 'fish') {
    const b = mesh(new THREE.SphereGeometry(0.32, 12, 10), toon(0x78909c));
    b.scale.set(0.6, 0.7, 1.7);
    g.add(b);
    const t = mesh(new THREE.ConeGeometry(0.28, 0.4, 4), toon(0x607d8b), 0, 0, -0.68);
    t.rotation.x = Math.PI / 2;
    t.scale.set(0.3, 1, 1);
    g.add(t);
    g.add(mesh(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshBasicMaterial({ color: 0x111111 }), 0.17, 0.07, 0.36));
    g.add(mesh(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshBasicMaterial({ color: 0x111111 }), -0.17, 0.07, 0.36));
    const frost = mesh(
      new THREE.SphereGeometry(0.34, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0xe1f5fe, transparent: true, opacity: 0.35 }),
    );
    frost.scale.set(0.65, 0.75, 1.75);
    g.add(frost);
  } else if (type === 'chicken') {
    const b = mesh(new THREE.CapsuleGeometry(0.2, 0.7, 6, 10), toon(0xfff176));
    b.rotation.x = Math.PI / 2;
    g.add(b);
    g.add(mesh(new THREE.SphereGeometry(0.2, 10, 8), toon(0xfff176), 0, 0.15, 0.55));
    g.add(mesh(new THREE.BoxGeometry(0.06, 0.16, 0.2), toon(0xe53935), 0, 0.36, 0.55));
    const bk = mesh(new THREE.ConeGeometry(0.07, 0.2, 6), toon(0xff9800), 0, 0.12, 0.78);
    bk.rotation.x = Math.PI / 2;
    g.add(bk);
    for (const s of [-1, 1]) g.add(mesh(new THREE.CapsuleGeometry(0.03, 0.3, 4, 6), toon(0xff9800), s * 0.1, -0.15, -0.5));
  } else if (type === 'sticker') {
    // price gun
    g.add(mesh(new THREE.BoxGeometry(0.25, 0.3, 0.7), toon(0xff7043)));
    const h = mesh(new THREE.BoxGeometry(0.18, 0.45, 0.16), toon(0x37474f), 0, -0.3, -0.2);
    h.rotation.x = -0.3;
    g.add(h);
    const lb = mesh(
      new THREE.PlaneGeometry(0.5, 0.25),
      new THREE.MeshBasicMaterial({ map: tagTex('50%', '#ffeb3b', '#d32f2f', 96, 48, 34), side: THREE.DoubleSide }),
      0.14,
      0.05,
      0,
    );
    lb.rotation.y = Math.PI / 2;
    g.add(lb);
  } else if (type === 'melon') {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 8;
    const x = c.getContext('2d');
    for (let i = 0; i < 8; i++) {
      x.fillStyle = i % 2 ? '#2e7d32' : '#66bb6a';
      x.fillRect(i * 8, 0, 8, 8);
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    const m = mesh(new THREE.SphereGeometry(0.55, 16, 12), new THREE.MeshLambertMaterial({ map: t }));
    m.scale.set(1, 0.9, 1.1);
    g.add(m);
  } else {
    // tissue roll + streamer
    g.add(mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.5, 14), toon(0xffffff)));
    g.add(mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.52, 10), toon(0x8d6e63)));
    const s = mesh(
      new THREE.PlaneGeometry(0.45, 1.6),
      new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }),
      0,
      0,
      -0.9,
    );
    s.rotation.x = Math.PI / 2;
    g.add(s);
  }
  g.visible = false;
  return g;
}

export function createManager(G) {
  const { scene, carts, sound } = G;
  const root = new THREE.Group();
  root.visible = false;
  const lift = makeLift(),
    man = makeManagerModel();
  root.add(lift.g);
  root.add(man.root);
  scene.add(root);
  // pooled projectiles + warning circles
  const POOL = 4,
    pool = [];
  const ringM = new THREE.MeshBasicMaterial({ color: 0xff1744, transparent: true, opacity: 0.85, depthWrite: false }),
    discM = new THREE.MeshBasicMaterial({ color: 0xff5252, transparent: true, opacity: 0.32, depthWrite: false }),
    shadowM = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false });
  const ringG = new THREE.RingGeometry(MG.hitR - 0.28, MG.hitR, 32),
    discG = new THREE.CircleGeometry(MG.hitR, 32),
    shadowG = new THREE.CircleGeometry(0.6, 16);
  for (const G2 of [ringG, discG, shadowG]) G2.rotateX(-Math.PI / 2);
  for (let i = 0; i < POOL; i++) {
    const warn = new THREE.Group();
    warn.add(new THREE.Mesh(ringG, ringM), new THREE.Mesh(discG, discM));
    const shadow = new THREE.Mesh(shadowG, shadowM);
    warn.add(shadow);
    warn.visible = false;
    scene.add(warn);
    const ms = {};
    for (const t of TYPES) {
      ms[t] = makeThrowable(t);
      scene.add(ms[t]);
    }
    pool.push({ warn, shadow, ms, p: null });
  }
  // a watermelon that rides in the basket of a hit cart
  const melonOn = carts.map(c => {
    const m = makeThrowable('melon');
    m.scale.setScalar(0.85);
    m.position.set(0, 1.25, 0.35);
    c.g.root.add(m);
    return m;
  });
  const speaker = { holder: new THREE.Group(), sayCd: 0 }; // speech-bubble anchor (above his head)
  const st = {
    cd: MG.firstDelay,
    visit: null, // {t, x, z, y, face, plan:[{at, target, type}], end}
    projs: [],
    log: [], // event log [seq, kind, ...] — replayed by guests
    seq: 0,
    seen: 0,
    stats: { visits: 0, throws: 0, hits: 0, blocks: 0, misses: 0 },
    pid: 0,
  };
  let mgfx = null;
  const ovl = () => {
    if (!mgfx) {
      mgfx = document.getElementById('mgfx');
      if (!mgfx) {
        mgfx = document.createElement('div');
        mgfx.id = 'mgfx';
        document.body.appendChild(mgfx);
      }
    }
    return mgfx;
  };
  const isHost = () => G.mode !== 'guest';
  const R = () => Math.random();
  const pickW = () => {
    let s = 0;
    for (const t of TYPES) s += MG_THROWS[t].w;
    let r = R() * s;
    for (const t of TYPES) if ((r -= MG_THROWS[t].w) <= 0) return t;
    return TYPES[0];
  };
  const name = c => {
    const n = String(c.name || '').replace(/<[^>]*>/g, '');
    return n === '나' ? '거기' : n;
  };
  const near = (x, z, d = 32) => G.player && Math.hypot(G.player.x - x, G.player.z - z) < d;
  function emit(kind, ...a) {
    const e = [++st.seq, kind, ...a];
    st.log.push(e);
    if (st.log.length > 24) st.log.shift();
    return e;
  }
  // ---------- geometry helpers ----------
  let segLen = 0;
  function lapLen() {
    if (segLen) return segLen;
    const P = TR.path;
    let L = 0;
    for (let i = 0; i < P.length; i++) {
      const a = P[i],
        b = P[(i + 1) % P.length];
      L += Math.hypot(b.x - a.x, b.y - a.y);
    }
    segLen = L / Math.max(1, P.length);
    return segLen;
  }
  const active = () => carts.filter(c => !c.inactive && !c.finished && !c.spec);
  const ranked = () => active().sort((a, b) => b.prog - a.prog);
  /** where to aim: predicted position of `c` after `t` s, clamped inside the track */
  function aimAt(c, t) {
    const k = MG.lead * t * Math.max(0, c.v || 0);
    let px = c.x + Math.sin(c.vd ?? c.h) * k + (R() - 0.5) * 2 * MG.aimErr,
      pz = c.z + Math.cos(c.vd ?? c.h) * k + (R() - 0.5) * 2 * MG.aimErr;
    const P = TR.path,
      N = P.length;
    let bi = c.idx || 0,
      bd = 1e9;
    for (let j = 0; j < 60; j++) {
      const i = ((c.idx || 0) + j) % N,
        d = Math.hypot(P[i].x - px, P[i].y - pz);
      if (d < bd) {
        bd = d;
        bi = i;
      }
    }
    const [tx, tz] = TR.tangentAt(bi),
      lat = -(px - P[bi].x) * tz + (pz - P[bi].y) * tx,
      lim = TR.HW - 1.4;
    if (Math.abs(lat) > lim) {
      const q = TR.atLane(bi, Math.sign(lat) * lim);
      px = q.x;
      pz = q.z;
    }
    return [px, pz];
  }
  // ---------- visit / throw lifecycle (host+solo) ----------
  function startVisit(target, nThrows, forceType) {
    const N = TR.path.length;
    let i = Math.round((target.idx || 0) + MG.ahead / lapLen());
    for (let k = 0; k < 30 && !TR.straightAt(i % N); k++) i++;
    i %= N;
    const side = R() < 0.5 ? -1 : 1,
      p = TR.atLane(i, side * (TR.HW + 0.9)),
      q = TR.atLane(i, 0);
    const face = Math.atan2(q.x - p.x, q.z - p.z);
    const plan = [];
    for (let k = 0; k < nThrows; k++) plan.push({ at: 0.9 + k * MG.gap, type: forceType || pickW(), tgt: target, done: false });
    const second = ranked()[1];
    if (!forceType && second && active().length >= 3) for (const pl of plan.slice(1)) if (R() < MG.p2nd) pl.tgt = second;
    st.stats.visits++;
    const LL = target === ranked()[0] ? MG_LINES.first : MG_LINES.second,
      line = LL[(R() * LL.length) | 0];
    const text = line.replace('{n}', name(target));
    st.visit = { t: 0, x: p.x, z: p.z, y: hAt(p.x, p.z), face, plan, end: 0.9 + nThrows * MG.gap + 1.1 };
    showVisit(p.x, p.z, face, text);
    emit('show', r2(p.x), r2(p.z), r2(face), text);
  }
  const r2 = v => Math.round(v * 100) / 100;
  function showVisit(x, z, face, text) {
    st.visit = st.visit || { t: 0, x, z, y: hAt(x, z), face, plan: [], end: 99 };
    root.position.set(x, hAt(x, z), z);
    root.rotation.y = face;
    root.visible = true;
    speaker.holder.position.set(x, hAt(x, z) + MG.liftH + 1.6, z);
    lift.set(0.3);
    man.root.position.y = 0.45;
    if (near(x, z, 90) || G.mode === 'solo') {
      G.announce(`점장: ${text}`);
      sound.megaphone && sound.megaphone();
    }
    G.say(speaker, text, 2.4, true);
  }
  function throwOne(pl) {
    const V = st.visit,
      c = pl.tgt;
    if (!c || c.inactive || c.finished) return;
    const [tx, tz] = aimAt(c, MG.flight + 0.05);
    const sy = V.y + MG.liftH + 1.9;
    const id = ++st.pid,
      see = R() < MG.aiSee;
    addProj(id, pl.type, V.x, sy, V.z, tx, tz, carts.indexOf(c), see);
    st.stats.throws++;
    emit('throw', id, pl.type, r2(V.x), r2(sy), r2(V.z), r2(tx), r2(tz), carts.indexOf(c));
  }
  function addProj(id, type, sx, sy, sz, tx, tz, ti, see) {
    const slot = pool.find(s => !s.p);
    if (!slot) return;
    const p = { id, type, sx, sy, sz, tx, tz, ty: hAt(tx, tz), t: 0, slot, ti, see, spin: (R() - 0.5) * 18 };
    slot.p = p;
    slot.warn.visible = true;
    slot.warn.position.set(tx, p.ty + 0.06, tz);
    slot.ms[type].visible = true;
    st.projs.push(p);
    if (st.visit) st.visit.armT = 0.35;
    if (near(sx, sz, 60)) sound.toss && sound.toss();
  }
  function freeProj(p) {
    p.slot.p = null;
    p.slot.warn.visible = false;
    for (const t of TYPES) p.slot.ms[t].visible = false;
    st.projs.splice(st.projs.indexOf(p), 1);
  }
  /** effect of a throwable on a cart. local = we simulate this cart (apply physics); always plays visuals. */
  function applyHit(c, type, blocked, local) {
    const D = MG_THROWS[type] || MG_THROWS.fish,
      y = 2.2 + hAt(c.x, c.z),
      me = c === G.player;
    if (blocked) {
      if (local) c.shieldT = 0;
      G.comic(c.x, y, c.z, '실드 팅~!', '#80d8ff');
      G.puff(c.x, 1, c.z, 0x80d8ff, 6);
      G.say(c, '실드로 막았다!', 1.3, true);
      if (me) sound.charge();
      return;
    }
    if (local) {
      c.hitSeq = (c.hitSeq || 0) + (c.remote ? 0 : 1);
      c.drifting = false;
      if (D.fx === 'slip') {
        c.slipT = Math.max(c.slipT || 0, 1.4);
        c.spin = Math.max(c.spin || 0, 0.55);
        c.v *= 0.7;
      } else if (D.fx === 'spin') {
        c.spin = 1.15;
        c.v *= 0.35;
      } else if (D.fx === 'bonk') {
        c.spin = 0.7;
        c.v *= 0.45;
      } else if (D.fx === 'melon') {
        c.v *= 0.7;
      } else c.v *= 0.72; // sticker / tissue: mostly a screen gag
    }
    if (D.fx === 'melon') c.melonT = MG.melonT;
    c.mgOv = { type, t: MG.overlayT };
    if (me || near(c.x, c.z, 28)) G.comic(c.x, y, c.z, D.pow, D.col);
    G.puff(c.x, 1, c.z, type === 'melon' ? 0xff5252 : type === 'tissue' ? 0xffffff : 0xb3e5fc, 8);
    const L = (c.lines && c.lines.hit) || ['으아악~', '빙글빙글~', '누구야!'];
    G.say(c, me ? `${D.icon} ${L[(R() * L.length) | 0]}` : L[(R() * L.length) | 0], 1.5, true);
    if (me) {
      G.flash(`점장의 ${D.icon} ${D.name}에 맞았다!`);
      G.shakeIt(0.6);
      overlay(type);
    }
    if (me || near(c.x, c.z)) {
      if (type === 'chicken') sound.squeak && sound.squeak();
      else sound.splat && sound.splat(type === 'melon' ? 1.3 : 1);
    }
    if (R() < 0.6) G.say(speaker, MG_LINES.hit[(R() * MG_LINES.hit.length) | 0], 1.6, true);
  }
  function overlay(type) {
    const el = ovl();
    if (!el) return;
    el.innerHTML = '';
    el.className = 'on ' + type;
    const add = (cls, css, txt) => {
      const d = document.createElement('i');
      d.className = cls;
      d.style.cssText = css;
      if (txt) d.textContent = txt;
      el.appendChild(d);
    };
    if (type === 'sticker') {
      const T = ['50%', '1+1', '특가', '반값', '세일', '30%', '점장 추천'];
      for (let k = 0; k < 7; k++)
        add('stk', `left:${5 + R() * 78}%;top:${8 + R() * 70}%;--r:${((R() - 0.5) * 50) | 0}deg;animation-delay:${k * 0.07}s`, T[k]);
    } else if (type === 'tissue') {
      for (let k = 0; k < 6; k++) add('tp', `left:${4 + k * 16 + R() * 6}%;height:${35 + R() * 45}%;animation-delay:${k * 0.05}s`);
    } else if (type === 'melon' || type === 'fish' || type === 'mop') {
      const col = type === 'melon' ? '#ff5252' : type === 'fish' ? '#b3e5fc' : '#81d4fa';
      for (let k = 0; k < 5; k++)
        add('spl', `left:${8 + R() * 70}%;top:${10 + R() * 60}%;--s:${0.6 + R() * 0.9};background:${col};animation-delay:${k * 0.04}s`);
      if (type === 'melon') for (let k = 0; k < 6; k++) add('seed', `left:${15 + R() * 65}%;top:${15 + R() * 60}%`);
    } else add('feather', '', '꽥!');
    clearTimeout(overlay.tm);
    overlay.tm = setTimeout(() => {
      el.className = '';
      el.innerHTML = '';
    }, MG.overlayT * 1000);
  }
  function land(p) {
    const hits = [];
    if (isHost()) {
      for (const c of carts) {
        if (c.inactive || c.finished || c.remote) continue; // remote (guest) carts report their own hits
        if (Math.hypot(c.x - p.tx, c.z - p.tz) < MG.hitR + 0.5) hits.push(c);
      }
      for (const c of hits) {
        const blocked = (c.shieldT || 0) > 0;
        st.stats[blocked ? 'blocks' : 'hits']++;
        applyHit(c, p.type, blocked, true);
        emit('hit', p.id, carts.indexOf(c), p.type, blocked ? 1 : 0);
      }
      if (!hits.length) {
        st.stats.misses++;
        if (p.type === 'mop' && G.addPuddle) G.addPuddle(p.tx, p.tz);
        if (R() < 0.5) G.say(speaker, MG_LINES.miss[(R() * MG_LINES.miss.length) | 0], 1.5, true);
      }
    } else {
      const P = G.player;
      if (P && !P.finished && Math.hypot(P.x - p.tx, P.z - p.tz) < MG.hitR + 0.5) {
        const blocked = (P.shieldT || 0) > 0;
        applyHit(P, p.type, blocked, true);
        P.mgSeen = P.mgSeen || {};
        P.mgSeen[p.id] = 1;
        if (G.send) G.send({ t: 'mg', id: p.id, ty: p.type, sh: blocked ? 1 : 0 });
      }
    }
    if (near(p.tx, p.tz, 30)) {
      if (!hits.length) G.comic(p.tx, 1.2 + p.ty, p.tz, p.type === 'mop' ? '철퍽~' : '쿵!', '#fff');
      sound.bump(0.5);
    }
    G.puff(p.tx, 0.6 + p.ty, p.tz, 0xffffff, 6);
  }
  // ---------- per frame ----------
  function update(dt, state) {
    // timers that also run for mirrored carts (visual only)
    carts.forEach((c, i) => {
      if (c.melonT > 0) c.melonT -= dt;
      melonOn[i].visible = (c.melonT || 0) > 0 && !c.inactive;
      if (melonOn[i].visible) melonOn[i].rotation.y += dt * 2;
    });
    if (st.visit) animVisit(dt);
    for (let i = st.projs.length - 1; i >= 0; i--) {
      const p = st.projs[i];
      p.t += dt;
      const u = Math.min(1, p.t / MG.flight),
        x = p.sx + (p.tx - p.sx) * u,
        z = p.sz + (p.tz - p.sz) * u,
        apex = 3 + Math.hypot(p.tx - p.sx, p.tz - p.sz) * 0.08,
        y = p.sy + (p.ty + 0.5 - p.sy) * u + apex * 4 * u * (1 - u);
      const m = p.slot.ms[p.type];
      m.position.set(x, y, z);
      m.rotation.set(p.t * p.spin, p.t * 7, p.t * 3);
      const k = 0.45 + 0.55 * u;
      p.slot.warn.children[1].scale.setScalar(k);
      p.slot.warn.children[0].material.opacity = 0.55 + 0.4 * Math.abs(Math.sin(p.t * 12));
      p.slot.shadow.scale.setScalar(0.5 + u * 1.5);
      p.slot.shadow.position.set(x - p.tx, 0.01, z - p.tz);
      if (u >= 1) {
        land(p);
        freeProj(p);
      }
    }
    if (!isHost() || state !== 'race' || !MG.on || G.gmode !== 'race') return;
    if (st.visit) {
      const V = st.visit;
      for (const pl of V.plan)
        if (!pl.done && V.t >= pl.at) {
          pl.done = true;
          throwOne(pl);
        }
      return;
    }
    st.cd -= dt;
    if (st.cd > 0) return;
    const rk = ranked();
    if (rk.length < 2) {
      st.cd = MG.retry;
      return;
    }
    const gap = ((rk[0].prog - rk[1].prog) * lapLen()) | 0;
    if (gap < MG.minGap) {
      st.cd = MG.retry;
      return;
    }
    const k = Math.min(1, (gap - MG.minGap) / (MG.fullGap - MG.minGap));
    startVisit(rk[0], 1 + Math.round(k * (MG.maxThrows - 1)));
    st.cd = MG.cdMax + (MG.cdMin - MG.cdMax) * k;
  }
  function animVisit(dt) {
    const V = st.visit;
    V.t += dt;
    const rise = Math.min(1, V.t / 0.55),
      fall = V.t > V.end ? Math.max(0, 1 - (V.t - V.end) / 0.5) : 1,
      h = 0.3 + (MG.liftH - 0.3) * Math.min(rise, fall) * (1 + 0.08 * Math.sin(Math.min(1, rise) * Math.PI));
    lift.set(h);
    man.root.position.y = h + 0.07;
    const tt = V.t;
    man.bob.position.y = Math.abs(Math.sin(tt * 7)) * 0.06;
    man.headG.rotation.z = Math.sin(tt * 5) * 0.12;
    man.mouth.scale.y = 0.5 + Math.abs(Math.sin(tt * 18)) * 0.9;
    man.armL.rotation.x = -1.6 + Math.sin(tt * 6) * 0.15; // megaphone to mouth
    V.armT = Math.max(0, (V.armT || 0) - dt);
    man.armR.rotation.x = V.armT > 0 ? 1.2 - (0.35 - V.armT) * 12 : -0.4 + Math.sin(tt * 4) * 0.4;
    man.armR.rotation.z = -0.3;
    // turn to face the target
    const nxt = V.plan.find(p => !p.done),
      tg = nxt ? nxt.tgt : V.plan.length ? V.plan[V.plan.length - 1].tgt : null;
    if (tg) {
      const want = Math.atan2(tg.x - V.x, tg.z - V.z);
      root.rotation.y += Math.atan2(Math.sin(want - root.rotation.y), Math.cos(want - root.rotation.y)) * Math.min(1, dt * 6);
    }
    if (V.t > V.end + 0.5) {
      st.visit = null;
      root.visible = false;
      if (isHost()) emit('hide');
    }
  }
  // ---------- network ----------
  function snap() {
    return { s: st.seq, e: st.log.filter(e => e[0] > st.seq - 12) };
  }
  function applySnap(m) {
    if (!m) return;
    if (!st.seen) st.seen = Math.max(0, m.s - (m.e || []).length); // replay what's still in the window
    for (const e of m.e || []) {
      if (e[0] <= st.seen) continue;
      st.seen = e[0];
      const [, kind, ...a] = e;
      if (kind === 'show') {
        st.visit = null;
        showVisit(a[0], a[1], a[2], a[3]);
        st.visit.end = 99;
      } else if (kind === 'throw') {
        const [id, type, sx, sy, sz, tx, tz, ti] = a;
        addProj(id, type, sx, sy, sz, tx, tz, ti, false);
        const tg = carts[ti];
        if (st.visit && tg) st.visit.plan = [{ tgt: tg, done: true }];
      } else if (kind === 'hit') {
        const [id, ci, type, bl] = a,
          c = carts[ci];
        if (!c || c === G.player) continue; // we resolved our own hit
        applyHit(c, type, !!bl, false);
      } else if (kind === 'hide' && st.visit) st.visit.end = Math.min(st.visit.end, st.visit.t);
    }
  }
  /** host: a guest reports a hit on its own cart */
  function remoteHit(i, m) {
    const c = carts[i];
    if (!c || !c.remote) return;
    if (m.sh) c.shieldT = 0;
    st.stats[m.sh ? 'blocks' : 'hits']++;
    if (MG_THROWS[m.ty] && m.ty === 'melon' && !m.sh) c.melonT = MG.melonT;
    applyHit(c, MG_THROWS[m.ty] ? m.ty : 'fish', !!m.sh, false);
    emit('hit', m.id, i, MG_THROWS[m.ty] ? m.ty : 'fish', m.sh ? 1 : 0);
  }
  function reset() {
    for (const p of [...st.projs]) freeProj(p);
    st.visit = null;
    root.visible = false;
    st.cd = MG.firstDelay;
    st.log.length = 0;
    st.seen = 0;
    segLen = 0;
    for (const c of carts) {
      c.melonT = 0;
      c.mgOv = null;
    }
    if (mgfx) {
      mgfx.className = '';
      mgfx.innerHTML = '';
    }
  }
  function dispose() {
    reset();
    carts.forEach((c, i) => c.g.root.remove(melonOn[i]));
  }
  /** AI avoidance: warning circles some bots "noticed" */
  const obs = () => st.projs.filter(p => p.see).map(p => ({ x: p.tx, z: p.tz, r: MG.hitR + 0.3 }));
  /** debug/test: make him visit now and throw `type` (or random) at cart index `ti` (default: leader). */
  function force(type, ti, n = 1) {
    if (!isHost()) return false;
    const c = ti != null ? carts[ti] : ranked()[0];
    if (!c) return false;
    st.visit = null;
    for (const p of [...st.projs]) freeProj(p);
    startVisit(c, n, type && MG_THROWS[type] ? type : null);
    return true;
  }
  return {
    update,
    snap,
    applySnap,
    remoteHit,
    reset,
    dispose,
    obs,
    force,
    st,
    get visible() {
      return root.visible;
    },
    get pos() {
      return st.visit ? { x: st.visit.x, z: st.visit.z } : null;
    },
    get projs() {
      return st.projs.map(p => ({ id: p.id, type: p.type, tx: p.tx, tz: p.tz, t: p.t, ti: p.ti }));
    },
    lapLen: () => lapLen() * TR.path.length,
  };
}
