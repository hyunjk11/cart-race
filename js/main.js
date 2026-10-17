/**
 * main.js — entry point and game loop: renderer/scene/physics setup, carts (player + bots), customers and spilled
 * products, race state machine (title → countdown → race → finished), driving model (updateCart), PA announcer,
 * map loading, intro sweep, finish cutscene, spectator mode, render loop. Shares state with the split-out modules
 * (hud, results, inputglue, netglue) through state.js. ?debug=1 exposes window.__game for tests.
 */
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import * as TR from './track.js';
import { MAP_IDS, setMap, buildWorld, textSprite, path, strips, hAt, zoneAt, inRect, atLane, tangentAt } from './track.js';
import { LAPS, CART, INTRO_S, SCOOP_P, MAXP, RIDE_S, CART_R, DIFFS } from './config/tuning.js';
import { MAPS } from './config/maps.js';
import { createFun, itemOdds } from './fun.js';
import { NET, pushLobby, setMyChar, setMyParts } from './net.js';
import { makeCart, makeCustomer } from './models.js';
import * as FX from './fx.js';
import { createShop } from './shop.js';
import { T_LIMIT } from './config/shop.js';
import { charOf } from './chars.js';
import { loadout, statMods, randomLoadout, cleanLoadout, addCoins, coins } from './parts.js';
import { ROSTER } from './config/characters.js';
import { openCharSel, tickCharPrev, setLineup } from './charsel.js';
import { openGarage, tickGarage, garagePreview } from './garage.js';
import { initAudio, sound, setEngine, setDrift } from './audio.js';
import { LS, DEBUG } from './store.js';
import { keys, analog } from './input.js';
import { motionOK, maybeShopTutorial } from './help.js';
import * as hudMod from './hud.js';
import { flash, say, chatter, updateBubbles, setupMinimap, drawMinimap, announce, specUi, updateHud, updCharBtns } from './hud.js';
import { endRace } from './results.js';
import * as inputMod from './inputglue.js';
import { startGame } from './inputglue.js';
import * as netMod from './netglue.js';
import { netFollow, applyRemote, mpFinish, guestBumps, mirror, guestCustomers, mpTick } from './netglue.js';
import { $, pick, r2, stripTags } from './util.js';
import { S, ctx } from './state.js';
// hoisted functions used by the split-out modules (hud/results/inputglue/netglue)
Object.assign(ctx, {
  circlePush,
  endCut,
  endSpectate,
  hopOut,
  loadMap,
  nameTag,
  onOpts,
  puff,
  pushOut,
  renderMaps,
  resetCart,
  retarget,
  ridePose,
  showIntro,
  spawnProduct,
  specCart,
  startCut,
  startSpectate,
  startRaceMP,
});

const QUALITY = LS.get('cartQuality') || 'auto'; // auto | low | high
Object.assign(ctx, { QUALITY });
const renderer = new THREE.WebGLRenderer({
  antialias: QUALITY === 'high' || (QUALITY === 'auto' && !matchMedia('(pointer: coarse)').matches),
  powerPreference: 'high-performance',
});
const MOBILE = matchMedia('(pointer: coarse)').matches || Math.min(innerWidth, innerHeight) < 600;
const PR_MAX =
  QUALITY === 'low'
    ? Math.min(devicePixelRatio, 0.75)
    : QUALITY === 'high'
      ? Math.min(devicePixelRatio, 2)
      : Math.min(devicePixelRatio, MOBILE ? 1 : 1.5);
let pr = PR_MAX;
renderer.setPixelRatio(pr);
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
Object.assign(ctx, { scene });
scene.background = new THREE.Color(0xbfd4e6);
scene.fog = new THREE.Fog(0xbfd4e6, 40, 110);
const camera = new THREE.PerspectiveCamera(innerWidth < innerHeight ? 80 : 65, innerWidth / innerHeight, 0.1, 300);
Object.assign(ctx, { camera });
const LOWFX = QUALITY === 'low';
FX.initFx({ low: LOWFX, camera });
if (LOWFX) document.body.classList.add('lowfx');
function fitView() {
  const w = innerWidth,
    h = innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  document.documentElement.style.setProperty('--vh', h + 'px');
}
addEventListener('resize', fitView);
addEventListener('orientationchange', () => setTimeout(fitView, 250));
if (window.visualViewport) visualViewport.addEventListener('resize', fitView);
fitView();
const hemi = new THREE.HemisphereLight(0xfffaf0, 0x8a8070, 1.25);
scene.add(hemi);
const dl2 = new THREE.DirectionalLight(0xdfefff, 0.5);
dl2.position.set(-30, 30, -20);
scene.add(dl2);
const dl = new THREE.DirectionalLight(0xffffff, 1.2);
dl.position.set(20, 40, 10);
scene.add(dl);

const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -20, 0) });
Object.assign(ctx, { world });
world.allowSleep = true;
world.broadphase = new CANNON.SAPBroadphase(world);
world.defaultContactMaterial.friction = 0.4;
world.defaultContactMaterial.restitution = 0.2;

let trk = null; // current map: path/strips live in track.js (mutated in place on map change)
const seeded = (seed, f) => {
  const r = Math.random;
  let a = seed | 0;
  Math.random = () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  try {
    return f();
  } finally {
    Math.random = r;
  }
};
const hashStr = t => {
  let h = 7;
  for (const ch of t) h = (Math.imul(h, 31) + ch.charCodeAt(0)) | 0;
  return h;
};
// shared seed: every client builds an identical store (shelves, products, displays)
const _rand = Math.random;
{
  let a = 20261016;
  Math.random = () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const _m4 = new THREE.Matrix4().makeScale(0, 0, 0);
function removeShelfItems(x, z, n) {
  // hide products near impact
  let removed = 0;
  for (let i = 0; i < trk.items.length && removed < n; i++) {
    if (trk.hidden[i]) continue;
    const it = trk.items[i];
    if (Math.abs(it[0] - x) < 1.6 && Math.abs(it[2] - z) < 1.6) {
      trk.hidden[i] = 1;
      if (it[4] >= 0) {
        const im = trk.meshes[it[3]];
        im.setMatrixAt(it[4], _m4);
        im.instanceMatrix.needsUpdate = true;
      }
      removed++;
    }
  }
  return removed;
}

// ---------- input ----------
inputMod.init0();

const IS_TOUCH = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
Object.assign(ctx, { IS_TOUCH });
inputMod.init1();

// block page zoom/scroll gestures only on the game itself; menus/overlays keep native touch scrolling

// ---------- stats ----------
const stats = { knocked: 0, spilled: 0 };
Object.assign(ctx, { stats });

// ---------- carts ----------
const carts = [];
Object.assign(ctx, { carts });
function addCart(color, name, lane, row, ai, charId) {
  const g = makeCart(color, charId, { low: LOWFX });
  scene.add(g.root);
  const body = new CANNON.Body({ mass: 0, type: CANNON.Body.KINEMATIC, shape: new CANNON.Box(new CANNON.Vec3(0.7, 0.7, 1.6)) });
  world.addBody(body);
  const c = {
    g,
    body,
    name,
    baseName: name,
    ai,
    color,
    char: charId,
    st: charOf(charId).st,
    lines: charOf(charId).lines,
    x: 0,
    z: 0,
    h: Math.PI / 2,
    v: 0,
    idx: 0,
    lap: 0,
    finished: false,
    time: 0,
    maxV: ai ? 17 + Math.random() * 2.5 : 20,
    offset: lane * 0.6,
    vd: Math.PI / 2,
    n2o: 0,
    gauge: 0,
    combo: 0,
    item: null,
    stuck: 0,
    prog: 0,
  };
  g.root.rotation.order = 'YXZ';
  carts.push(c);
  c.color = charOf(charId).color;
  return c;
}
function setCartChar(c, id) {
  const d = charOf(id);
  c.char = d.id;
  c.g.setChar(d.id);
  c.color = d.color;
  c.st = d.st;
  c.lines = d.lines;
}
S.MYCHAR = charOf(LS.get('cartChar') || 'mango').id;
/** Equip a parts loadout on a cart: model changes always; stat tweaks only when `stats`. */
function setCartParts(c, lo, stats) {
  c.lo = cleanLoadout(lo);
  c.g.setParts(c.lo);
  c.pm = stats ? statMods(c.lo) : null;
}
Object.assign(ctx, { setCartParts });
const cline = (c, k, fb) => {
  const a = (c.lines && c.lines[k]) || fb;
  return a[(Math.random() * a.length) | 0];
};
function nearestIdx(x, z, from, span) {
  let bi = from,
    bd = 1e9;
  for (let k = 0; k < span; k++) {
    const i = (from + k + S.N) % S.N;
    const d = (path[i].x - x) ** 2 + (path[i].y - z) ** 2;
    if (d < bd) {
      bd = d;
      bi = i;
    }
  }
  return bi;
}
S.player = addCart(0xff4f8b, '나', -2.5, 0, false, S.MYCHAR);
{
  const others = ROSTER.filter(r => r.id !== S.MYCHAR);
  [
    [2.5, 0],
    [-2.5, 1],
    [2.5, 1],
  ].forEach(([l, r], k) => addCart(0x888888, others[k].name, l, r, true, others[k].id));
  carts.forEach((c, i) => setCartParts(c, i ? randomLoadout() : loadout(), true));
}

// ---------- products (physics pool) ----------
const products = [];
Object.assign(ctx, { products });
const boxG = new THREE.BoxGeometry(0.4, 0.55, 0.4),
  canG = new THREE.CylinderGeometry(0.17, 0.17, 0.4, 10);
const pCols = [0xe53935, 0x43a047, 0x1e88e5, 0xfdd835, 0xfb8c00, 0x8e24aa, 0x00acc1];
const pMats = pCols.map(c => new THREE.MeshLambertMaterial({ color: c }));
Object.assign(ctx, { pMats });
const PKINDS = [
  // spillable product kinds
  { g: boxG, s: () => new CANNON.Box(new CANNON.Vec3(0.2, 0.275, 0.2)), mass: 0.4 },
  { g: canG, s: () => new CANNON.Cylinder(0.17, 0.17, 0.4, 8), mass: 0.4 },
  { g: new THREE.CylinderGeometry(0.09, 0.11, 0.55, 8), s: () => new CANNON.Cylinder(0.09, 0.11, 0.55, 8), mass: 0.5 },
  {
    g: new THREE.SphereGeometry(0.33, 12, 9),
    m: new THREE.MeshLambertMaterial({ color: 0x2e7d32 }),
    s: () => new CANNON.Sphere(0.33),
    mass: 3,
    ld: 0.05,
  },
  {
    g: new THREE.CylinderGeometry(0.16, 0.16, 0.28, 10),
    m: new THREE.MeshLambertMaterial({ color: 0xffffff }),
    s: () => new CANNON.Cylinder(0.16, 0.16, 0.28, 8),
    mass: 0.15,
  },
  {
    g: new THREE.BoxGeometry(0.5, 0.16, 0.3),
    m: new THREE.MeshLambertMaterial({ color: 0xd7ccc8 }),
    s: () => new CANNON.Box(new CANNON.Vec3(0.25, 0.08, 0.15)),
    mass: 0.3,
  },
  { g: new THREE.BoxGeometry(0.38, 0.6, 0.16), s: () => new CANNON.Box(new CANNON.Vec3(0.19, 0.3, 0.08)), mass: 0.3 },
  {
    g: new THREE.CylinderGeometry(0.22, 0.17, 0.26, 12),
    m: new THREE.MeshLambertMaterial({ color: 0xf8bbd0 }),
    s: () => new CANNON.Cylinder(0.22, 0.17, 0.26, 8),
    mass: 0.4,
  }, // ice cream tub
  {
    g: new THREE.BoxGeometry(0.5, 0.08, 0.45),
    m: new THREE.MeshLambertMaterial({ color: 0xe53935 }),
    s: () => new CANNON.Box(new CANNON.Vec3(0.25, 0.04, 0.225)),
    mass: 0.3,
  }, // frozen pizza
  {
    g: new THREE.BoxGeometry(0.42, 0.5, 0.22),
    m: new THREE.MeshLambertMaterial({ color: 0xb3e5fc, transparent: true, opacity: 0.85 }),
    s: () => new CANNON.Box(new CANNON.Vec3(0.21, 0.25, 0.11)),
    mass: 0.8,
  }, // ice bag
  { g: new THREE.BoxGeometry(0.12, 0.42, 0.06), s: () => new CANNON.Box(new CANNON.Vec3(0.06, 0.21, 0.03)), mass: 0.1 }, // popsicle
];
Object.assign(ctx, { PKINDS });
function spawnProduct(x, y, z, vx, vy, vz) {
  if (S.MODE === 'guest') {
    NET.send({ t: 'spawn', a: [x, y, z, vx, vy, vz].map(r2) });
    return;
  }
  let p;
  if (products.length >= MAXP) {
    p = products.shift();
  } else {
    const SP = TR.MAP.spill,
      K = PKINDS[SP[(Math.random() * SP.length) | 0]];
    const mesh = new THREE.Mesh(K.g, K.m || pMats[(Math.random() * pMats.length) | 0]);
    scene.add(mesh);
    const body = new CANNON.Body({
      mass: K.mass,
      shape: K.s(),
      linearDamping: K.ld ?? 0.3,
      angularDamping: K.ld ?? 0.3,
      sleepSpeedLimit: 0.3,
    });
    world.addBody(body);
    p = { mesh, body, k: PKINDS.indexOf(K) };
  }
  p.body.position.set(x, y, z);
  p.body.velocity.set(vx, vy, vz);
  p.body.angularVelocity.set(Math.random() * 10 - 5, Math.random() * 10 - 5, Math.random() * 10 - 5);
  p.body.wakeUp();
  products.push(p);
}

// ---------- customers ----------
const customers = [];
Object.assign(ctx, { customers });
const custShape = new CANNON.Box(new CANNON.Vec3(0.3, 0.85, 0.2));
function pickTarget(cu) {
  // walk along the aisle (path index), never across the inner shelf block
  if (cu.pi === undefined) {
    cu.pi = nearestIdx(cu.x, cu.z, 0, S.N);
    cu.dir = Math.random() < 0.5 ? 1 : -1;
    cu.lane = (Math.random() * 2 - 1) * (TR.HW - 1.5);
  }
  if (Math.random() < 0.15) cu.dir = -cu.dir;
  if (Math.random() < 0.3) cu.lane = (Math.random() * 2 - 1) * (TR.HW - 1.5);
  cu.pi = (cu.pi + cu.dir * 2 + S.N) % S.N;
  const p = path[cu.pi],
    q = path[(cu.pi + 1) % S.N];
  const tx = q.x - p.x,
    tz = q.y - p.y,
    l = Math.hypot(tx, tz) || 1;
  cu.tx = p.x - (tz / l) * cu.lane;
  cu.tz = p.y + (tx / l) * cu.lane;
  if (Math.random() < 0.12) cu.pause = 1 + Math.random() * 3;
}
function pushOut(o, r) {
  let any = false;
  for (let k = 0; k < 3; k++) {
    if (!pushOut1(o, r)) break;
    any = true;
  }
  return any;
}
function pushOut1(o, r) {
  // keep a point out of shelf bounds; returns true if it was inside
  let hit = false;
  for (const s of strips) {
    if (s.off) continue;
    if (o.x > s.x0 && o.x < s.x1 && o.z > s.z0 && o.z < s.z1) {
      // center inside: exit through nearest face
      const pen = [
        [o.x - s.x0, -1, 0],
        [s.x1 - o.x, 1, 0],
        [o.z - s.z0, 0, -1],
        [s.z1 - o.z, 0, 1],
      ].sort((a, b) => a[0] - b[0])[0];
      o.x += pen[1] * (pen[0] + r);
      o.z += pen[2] * (pen[0] + r);
      hit = true;
    }
    const px = Math.max(s.x0, Math.min(o.x, s.x1)),
      pz = Math.max(s.z0, Math.min(o.z, s.z1));
    const dx = o.x - px,
      dz = o.z - pz,
      d = Math.hypot(dx, dz);
    if (d < r) {
      hit = true;
      const nx = d > 1e-4 ? dx / d : s.nx,
        nz = d > 1e-4 ? dz / d : s.nz;
      o.x = px + nx * r;
      o.z = pz + nz * r;
    }
  }
  return hit;
}
const nRiders = c => (c.riders && c.riders.length ? c.riders.length : c.riderN || 0);
Object.assign(ctx, { nRiders });
function ridePose(cu, c, seat, n) {
  // sit in the basket: hips on the basket floor, legs dangling over the front, wobble with the cart
  const fx = Math.sin(c.h),
    fz = Math.cos(c.h),
    back = n > 1 && seat === 1,
    side = n === 1 || back ? 0 : seat === 0 ? -0.27 : 0.27,
    f = back ? 0.3 : 0.92;
  const spd = Math.min(1, Math.abs(c.v) / 16),
    sc = RIDE_S * (cu.g.scale || 1),
    bounce = Math.abs(Math.sin(cu.t * 11 + seat * 2)) * 0.06 * spd;
  cu.holder.position.set(c.x + fx * f + fz * side, hAt(c.x, c.z) + 0.6 + 0.85 * RIDE_S - 0.5 * sc + bounce, c.z + fz * f - fx * side);
  const acc = (c.v - (cu.lastV ?? c.v)) / Math.max(1e-3, cu.dtLast || 0.016);
  cu.lastV = c.v;
  cu.pitch = (cu.pitch || 0) + (Math.max(-0.35, Math.min(0.35, -acc * 0.02)) - (cu.pitch || 0)) * 0.15;
  cu.holder.rotation.order = 'YXZ';
  cu.holder.rotation.set(
    cu.pitch + Math.sin(cu.t * 9 + seat) * 0.04 * spd,
    c.h + (back ? Math.sin(cu.t * 1.3) * 0.5 : Math.sin(cu.t * 1.7 + seat) * 0.18),
    -(c.steerIn || 0) * 0.25 * spd + (c.drifting ? (c.driftDir || 0) * 0.3 : 0) + Math.sin(cu.t * 7 + seat) * 0.05 * spd,
  );
  cu.holder.scale.setScalar(RIDE_S);
  const mood =
    c.spin > 0
      ? 'dizzy'
      : c.drifting || Math.abs(c.slip || 0) > 0.45
        ? 'shock'
        : c.boostT > 0 || c.instT > 0 || Math.abs(c.v) > 14
          ? 'happy'
          : 'normal';
  cu.g.sit(cu.t, mood, spd);
  cu.g.face(mood);
  cu.g.stars(mood === 'dizzy', cu.t);
  if (mood !== cu.mood) {
    if (S.MODE !== 'guest' && Math.random() < 0.35)
      say(
        cu,
        mood === 'happy'
          ? pick(['와아~ 신난다!', '더 빨리~!', '꺄르르~'])
          : mood === 'shock'
            ? pick(['꺄아악!', '떨어진다~!', '으아아~'])
            : mood === 'dizzy'
              ? pick(['빙글빙글…', '어지러워~'])
              : pick(['휴…', '장 보러 왔는데…']),
        1.4,
      );
    cu.mood = mood;
  }
}
function retarget(cu) {
  delete cu.pi;
  pickTarget(cu);
}
const insideShelf = (x, z) => strips.some(s => !s.off && x > s.x0 && x < s.x1 && z > s.z0 && z < s.z1);
for (let k = 0; k < 16; k++) {
  const g = makeCustomer({ low: LOWFX });
  const holder = new THREE.Group();
  g.root.position.y = -0.85;
  holder.add(g.root);
  scene.add(holder);
  const cu = { g, holder, state: 'walk', t: 0, x: 0, z: 0, tx: 0, tz: 0, sp: 1 + Math.random() * 0.8, body: null };
  customers.push(cu);
}
const SCOOP = DEBUG && new URLSearchParams(location.search).has('scoop') ? +new URLSearchParams(location.search).get('scoop') : SCOOP_P;
function scoop(cu, c) {
  c.riders = c.riders || [];
  cu.state = 'ride';
  cu.cart = c;
  cu.rideT = 0;
  cu.seat = c.riders.length;
  c.riders.push(cu);
  stats.knocked++;
  cu.holder.scale.setScalar(RIDE_S);
  cu.g.walk(0);
  cu.mood = null;
  say(cu, pick(['어? 여기 어디야?!', '태워줘서 고마워요?!', '으아 빨라!', '내 장 보는 중인데!']), 2.2, true);
  if (c === S.player) {
    flash(`손님이 카트에 탔다! 🛒 (${c.riders.length}/3)`);
    sound.oof();
  }
  puff(cu.x, 1.2, cu.z, 0xffc1e3, 6);
}
function hopOut(c, why) {
  if (!c.riders) return;
  for (const cu of c.riders) {
    cu.state = 'walk';
    cu.cart = null;
    cu.holder.scale.setScalar(1);
    cu.holder.rotation.set(0, 0, 0);
    const a = c.h + (cu.seat % 2 ? 1.6 : -1.6);
    cu.x = c.x + Math.sin(a) * 1.8;
    cu.z = c.z + Math.cos(a) * 1.8;
    pushOut(cu, 0.5);
    retarget(cu);
    cu.t = 0;
    say(
      cu,
      why === 'crash'
        ? pick(['으악 떨어진다!', '아야야…'])
        : why === 'drift'
          ? pick(['어지러워…', '살려줘~!'])
          : pick(['내려줄게요~', '재밌었어요!', '다음엔 안 타요…']),
      1.8,
      true,
    );
  }
  c.riders = [];
  if (c === S.player && why) flash('손님이 내렸다!');
}
function knockCustomer(cu, c) {
  if (Math.random() < SCOOP && (c.riders || []).length < 3) {
    scoop(cu, c);
    return;
  }
  cu.state = 'down';
  cu.t = 0;
  stats.knocked++;
  flash('손님을 넘어뜨렸다! 💥');
  if (c === S.player || Math.hypot(cu.x - S.player.x, cu.z - S.player.z) < 25)
    FX.comic(cu.x, 1.6 + hAt(cu.x, cu.z), cu.z, pick(['POW!', '쾅!', '퍽!', 'BAM!']), '#ff5252');
  if (c === S.player) FX.screenFlash('#fff', 0.3);
  say(cu, pick(['으악!', '내 장바구니!', '꺄악!', '아야!']), 2, true);
  puff(cu.x, 1, cu.z, 0xffffff, 8);
  if (c === S.player) {
    S.shake = 0.6;
    if (Math.random() < 0.6) say(c, pick(['미안해요~!', '앗 죄송!', '으앗!']), 1.6, true);
  }
  const body = new CANNON.Body({ mass: 60, shape: custShape, linearDamping: 0.2, angularDamping: 0.4 });
  body.position.set(cu.x, 0.9 + hAt(cu.x, cu.z), cu.z);
  const fx = Math.sin(c.h),
    fz = Math.cos(c.h),
    s = Math.abs(c.v);
  body.velocity.set(fx * s * 0.6, 3 + s * 0.15, fz * s * 0.6);
  body.angularVelocity.set(fz * 6, Math.random() * 2 - 1, -fx * 6);
  world.addBody(body);
  cu.body = body;
}

// ---------- collisions vs shelves ----------
function shelfCollide(c, dt) {
  for (const s of strips) {
    if (s.off) continue;
    const px = Math.max(s.x0, Math.min(c.x, s.x1)),
      pz = Math.max(s.z0, Math.min(c.z, s.z1));
    const dx = c.x - px,
      dz = c.z - pz,
      d = Math.hypot(dx, dz);
    if (d < CART_R) {
      const nx = d > 1e-4 ? dx / d : s.nx,
        nz = d > 1e-4 ? dz / d : s.nz;
      c.x = px + nx * CART_R;
      c.z = pz + nz * CART_R;
      const fx = Math.sin(c.h),
        fz = Math.cos(c.h);
      const impact = Math.abs(c.v) * Math.max(0, -(fx * nx + fz * nz) * Math.sign(c.v));
      if (impact > 7 && (c.lastHit || 0) <= 0 && !(s.kind === 'shelf' || s.kind === 'freezer' || s.kind === 'stand')) {
        // hard non-shelf obstacle: bounce, no spill
        c.lastHit = 0.4;
        if (!c.ai) {
          sound.bump(0.9);
          S.shake = Math.min(1, impact / 15);
          flash(
            s.kind === 'car'
              ? '🚨 삐뽀삐뽀! 자동차 경보!'
              : s.kind === 'counter'
                ? '계산대에 쾅! 계산원이 놀랐다 😱'
                : s.kind === 'door'
                  ? '쾅! 냉동고 문에 부딪혔다 🧊'
                  : s.kind === 'pillar'
                    ? '기둥에 쾅! 💫'
                    : '꽝! 벽에 부딪혔다',
          );
          if (s.kind === 'car') sound.honk();
        }
        if (s.kind === 'door') {
          s.off = true;
          s.slam = 2;
          sound.door();
        }
        if (c.riders && c.riders.length) hopOut(c, 'crash');
        if (S.MODE === 'guest' && c === S.player && (nRiders(c) || S.GMODE === 'shop')) NET.send({ t: 'crash', k: Math.round(impact) });
        if (SHOPON() && S.MODE !== 'guest' && S.state === 'race') S.shop.crash(c, impact);
        puff(px + nx * 0.6, 1, pz + nz * 0.6, 0xdddddd, 5);
        if (!c.ai) FX.comic(px + nx, 2 + hAt(c.x, c.z), pz + nz, pick(['쿵!', 'BONK!', '꽝!']), '#ffffff');
      } else if (impact > 7 && (c.lastHit || 0) <= 0) {
        const n = Math.min(10, Math.floor(impact / 2.2));
        stats.spilled += n;
        c.lastHit = 0.4;
        if (!c.ai) {
          sound.clatter(n);
          sound.bump(0.8);
        }
        if (!c.ai) {
          flash('선반 충돌! 상품이 쏟아졌다 🥫');
          S.shake = Math.min(1, impact / 15);
          say(c, cline(c, 'crash', ['으앗!']), 1.4);
        } else if (Math.random() < 0.5) say(c, cline(c, 'crash', ['이런!']), 1.4);
        if (c.riders && c.riders.length) hopOut(c, 'crash');
        if (S.MODE === 'guest' && c === S.player && (nRiders(c) || S.GMODE === 'shop')) NET.send({ t: 'crash', k: Math.round(impact) });
        if (SHOPON() && S.MODE !== 'guest' && S.state === 'race') S.shop.crash(c, impact);
        removeShelfItems(px - nx * 0.6, pz - nz * 0.6, n);
        puff(px + nx * 0.6, 1, pz + nz * 0.6, 0xffe0a0, 6);
        if (!c.ai || Math.hypot(c.x - S.player.x, c.z - S.player.z) < 22) {
          for (let k = 0; k < (LOWFX ? 1 : 3); k++)
            puff(
              px + nx * 0.8,
              0.8 + k * 0.5,
              pz + nz * 0.8,
              [0xff5252, 0xffeb3b, 0x40c4ff, 0x69f0ae][(Math.random() * 4) | 0],
              LOWFX ? 3 : 6,
            );
          FX.comic(px + nx, 2.2 + hAt(c.x, c.z), pz + nz, pick(['와장창!', 'CRASH!', '쾅!', '우르르!']), '#ffeb3b');
        }
        if (!c.ai) FX.screenFlash('#fff', 0.35);
        for (let k = 0; k < n; k++)
          spawnProduct(
            px + nx * 0.5 + (Math.random() - 0.5) * 2.5 * (nz ? 1 : 0),
            0.8 + Math.random() * 1.8 + hAt(px + nx, pz + nz),
            pz + nz * 0.5 + (Math.random() - 0.5) * 2.5 * (nx ? 1 : 0),
            nx * (2 + Math.random() * 3) + fx * impact * 0.3,
            1 + Math.random() * 2,
            nz * (2 + Math.random() * 3) + fz * impact * 0.3,
          );
      }
      c.v *= impact > 3 ? 0.55 : 0.97;
      // slide along: steer heading to tangent a bit
      const dot = fx * nx + fz * nz;
      if (dot * Math.sign(c.v) < 0) {
        const tx = fx - dot * nx,
          tz = fz - dot * nz;
        c.h += ((Math.atan2(tx, tz) - c.h + Math.PI * 3) % (Math.PI * 2)) - Math.PI > 0 ? dt * 2 : -dt * 2;
      }
    }
  }
}
function circlePush(c, ox, oz, r, slow) {
  const dx = c.x - ox,
    dz = c.z - oz,
    d = Math.hypot(dx, dz);
  if (d < r && d > 1e-4) {
    c.x = ox + (dx / d) * r;
    c.z = oz + (dz / d) * r;
    c.v *= slow;
    return true;
  }
  return false;
}

// ---------- race state ----------

const finishOrder = [];
Object.assign(ctx, { finishOrder });
const ang = a => Math.atan2(Math.sin(a), Math.cos(a));
Object.assign(ctx, { ang });

function updateCart(c, dt) {
  if (c.inactive) return;
  if (c.net) return netFollow(c, dt);
  if (c.remote) return applyRemote(c, dt);
  c.lastHit = (c.lastHit || 0) - dt;
  let thr = 0,
    steer = 0,
    boosting = false;
  if (S.state !== 'race' || c.finished) {
    thr = c.finished ? -0.3 * Math.sign(c.v) : 0;
  } else if (!c.ai) {
    if (S.autoAccel) thr = 1;
    if (keys.ArrowUp || keys.KeyW) {
      thr = 1;
      c.push = true;
    } else c.push = false;
    if (keys.ArrowDown || keys.KeyS) thr = -1;
    if (keys.ArrowLeft || keys.KeyA) steer += 1;
    if (keys.ArrowRight || keys.KeyD) steer -= 1;
    if (analog.active) steer = analog.steer;
    const down = keys.ArrowDown || keys.KeyS;
    c.wantDrift = !!(keys.ShiftLeft || keys.ShiftRight || keys.Drift || (IS_TOUCH && down && steer !== 0 && c.v > 7));
    if (IS_TOUCH && c.wantDrift && down) thr = 1;
    const up = keys.ArrowUp || keys.KeyW;
    c.upEdge = up && !c.upPrev;
    c.upPrev = up;
  } else {
    const tgt = path[(c.idx + 4) % S.N],
      nxt = path[(c.idx + 5) % S.N];
    const tx = nxt.x - tgt.x,
      tz = nxt.y - tgt.y,
      l = Math.hypot(tx, tz) || 1;
    let off = c.offset; // steer around obstacles a bit
    const fx = Math.sin(c.h),
      fz = Math.cos(c.h);
    for (const o of S.fun.obstacles) {
      const rx = o.x - c.x,
        rz = o.z - c.z,
        ahead = rx * fx + rz * fz;
      if (ahead > 0 && ahead < 12) {
        const side = rx * fz - rz * fx,
          R = o.r + 1.2;
        if (Math.abs(side) < R) off += (side > 0 ? 1 : -1) * (R - Math.abs(side)) * 1.2;
      }
    }
    for (const cu of customers) {
      const ox = cu.body ? cu.body.position.x : cu.x,
        oz = cu.body ? cu.body.position.z : cu.z,
        rx = ox - c.x,
        rz = oz - c.z,
        ahead = rx * fx + rz * fz;
      if (ahead > 0 && ahead < 10) {
        const side = rx * fz - rz * fx;
        if (Math.abs(side) < 2.2) {
          off += (side > 0 ? 1 : -1) * (2.5 - Math.abs(side)) * 1.4;
          if (!cu.body && ahead < 5 && Math.random() < 0.02) say(c, pick(['비켜비켜!', '길 좀 비켜주세요!', '실례합니다~!']), 1.3);
        }
      }
    }
    off = Math.max(-TR.HW + 1.6, Math.min(TR.HW - 1.6, off));
    let goal = null;
    if (SHOPON() && S.state === 'race') {
      const gg = S.shop.aiGoal(c);
      if (gg && gg.d < 16) goal = gg;
    }
    const gx = tgt.x - (tz / l) * off,
      gz = tgt.y + (tx / l) * off;
    const want = Math.atan2(gx - c.x, gz - c.z),
      da = ang(want - c.h);
    steer = Math.max(-1, Math.min(1, da * 2.5));
    thr = Math.abs(da) > 0.6 && c.v > 10 ? 0.2 : 1;
    if (goal && goal.d < 3.2) c.aiGrab = true;
    if (goal) {
      const d2 = ang(Math.atan2(goal.s.x - c.x, goal.s.z - c.z) - c.h);
      if (Math.abs(d2) < 1.5) {
        steer = Math.max(-1, Math.min(1, d2 * 2.5));
        thr = goal.d < 10 ? (c.v > 6.5 ? -0.7 : 0.7) : c.v > 11 ? 0.2 : 1;
      }
    }
    if (Math.abs(c.v) < 1.5) c.stuck += dt;
    else c.stuck = 0;
    if (c.stuck > 1.2) {
      c.reverse = 0.8;
      c.stuck = 0;
    }
    // watchdog: an AI that makes no track progress for 7s (wedged on a shelf/other cart) is put back on the racing line
    if (S.state === 'race' && !c.finished) {
      if (c.wdP === undefined || c.prog - c.wdP >= 3 || c.prog < c.wdP - S.N / 2) {
        c.wdP = c.prog;
        c.wdT = 0;
      } else if ((c.wdT += dt) > 7) {
        const a = path[(c.idx + 2) % S.N],
          b2 = path[(c.idx + 3) % S.N];
        c.x = a.x;
        c.z = a.y;
        c.h = c.vd = Math.atan2(b2.x - a.x, b2.y - a.y);
        c.v = 0;
        c.reverse = 0;
        c.stuck = 0;
        c.wdT = 0;
        c.wdP = c.prog;
        c.unstuck = (c.unstuck || 0) + 1;
      }
    }
    if (c.reverse > 0) {
      c.reverse -= dt;
      thr = -1;
      steer = -steer;
    }
    c.wantDrift = !goal && Math.abs(da) > 0.32 && c.v > 11 && !(c.reverse > 0);
    if (c.n2o > 0 && Math.abs(da) < 0.1 && (c.boostT || 0) <= 0 && Math.random() < 0.02) c.useN2O = true;
  }
  if (!c.ai) {
    if (boosting && !c.wasBoost) {
      sound.whoosh();
      if (Math.random() < 0.5) say(c, cline(c, 'boost', ['간다~!']), 1.2);
    }
    c.wasBoost = boosting;
    setEngine(c.v, boosting);
    setDrift(c.drifting ? Math.abs(c.slip || 0) * 2 : c.slipT > 0 ? 0.3 : 0);
  }
  if (c.useN2O) {
    c.useN2O = false;
    if (S.state === 'race' && !c.finished) {
      if (c.n2o > 0) {
        c.n2o--;
        c.boostT = CART.n2oTime;
        c.v += 2;
        if (c.ai && Math.random() < 0.3) say(c, cline(c, 'boost', ['간다~!']), 1.2);
      } else if (!c.ai) {
        c.emptyTries = (c.emptyTries || 0) + 1;
        sound.empty();
        flash('N2O 없음! 드리프트로 충전하세요');
        const n = $('n2o');
        n.classList.remove('empty');
        void n.offsetWidth;
        n.classList.add('empty');
      }
    }
  }
  if (c.boostT > 0) {
    c.boostT -= dt;
    boosting = true;
  }
  if (c.instT > 0) {
    c.instT -= dt;
    boosting = true;
  }
  if (c.spin > 0) {
    c.spin -= dt;
    steer = 0;
    thr = 0;
    c.h += dt * 11;
    c.wantDrift = false;
  }
  if (c.wantDrift && !c.drifting && Math.abs(c.v) > 8 && steer !== 0) {
    c.drifting = true;
    c.driftDir = Math.sign(steer);
    c.driftT = 0;
    if (S.state === 'race' && Math.random() < (c.ai ? 0.06 : 0.2)) say(c, cline(c, 'drift', ['슝~']), 1.2);
    c.v *= 0.97;
  }
  if (c.drifting) {
    c.driftT += dt;
    if (!c.wantDrift || c.v < 5) {
      c.drifting = false;
      c.instWin = 0.5;
      c.lastDir = c.driftDir;
      if (c.driftT > 0.5) {
        c.combo++;
        if (S.state === 'race') c.drifts = (c.drifts || 0) + 1;
        c.comboT = 3;
      }
    }
  }
  if (!c.drifting && c.instWin > 0) {
    c.instWin -= dt;
    const counter = steer === -c.lastDir,
      upHit = !c.ai && c.upEdge,
      aiHit = c.ai && Math.random() < 0.04;
    if ((counter || upHit || aiHit) && c.driftT > 0.3) {
      c.instWin = 0;
      c.instT = 0.7;
      c.v += 3.5;
      c.instCount = (c.instCount || 0) + 1;
      if (!c.ai) {
        flash('⚡ 순간 부스트!');
        sound.whoosh();
      }
    }
  }
  c.comboT = (c.comboT || 0) - dt;
  if (c.comboT <= 0) c.combo = 0;
  c.steerIn = steer;
  let maxV =
    c.maxV *
    (c.st ? c.st.spd : 1) *
    (c.pm ? c.pm.spd : 1) *
    (c.ai && S.state === 'race' ? rubber(c) : 1) *
    (boosting ? CART.boostSpeed : 1) *
    (c.push && S.autoAccel ? CART.autoPushSpeed : 1) *
    (c.magnetT > 0 ? CART.magnetSpeed : 1) *
    (1 - CART.riderSlow * nRiders(c));
  const zn = zoneAt(c.x, c.z);
  c.bumpT = (c.bumpT || 0) - dt;
  if (zn) {
    if (zn.t === 'ice') c.slipT = Math.max(c.slipT || 0, 0.3);
    else if (zn.t === 'walk') {
      const dot = Math.sin(c.vd) * zn.dx + Math.cos(c.vd) * zn.dz;
      if (dot > 0.5) {
        maxV *= CART.walkwaySpeed;
        c.v += 6 * dt;
        c.beltT = (c.beltT || 0) + dt;
      } else if (dot < -0.5) c.v -= 6 * dt * Math.sign(c.v || 1);
    } else if (zn.t === 'esc') maxV *= CART.escalatorSpeed;
    else if (zn.t === 'bump' && Math.abs(c.v) > 7 && c.bumpT <= 0) {
      c.bumpT = 0.7;
      c.v *= 0.72;
      c.bumps = (c.bumps || 0) + 1;
      if (!c.ai) {
        sound.bump(1);
        S.shake = Math.max(S.shake, 0.5);
        flash('덜컹! 과속방지턱 🚧');
      }
      if (Math.abs(c.v) > 10 && c.riders && c.riders.length) hopOut(c, 'crash');
    }
    if (!c.ai && zn !== c.lastZone && S.state === 'race') {
      if (zn.t === 'ice') flash('❄ 빙판! 미끄러워요');
      else if (zn.t === 'walk') flash('⏩ 무빙워크! 같은 방향이면 가속');
      else if (zn.t === 'esc') flash('🛗 에스컬레이터 옆 지름길!');
    }
  }
  c.lastZone = zn;
  if (thr > 0) c.v += (boosting ? CART.boostAccel : CART.accel) * (1 - CART.riderSlow * nRiders(c)) * dt * (1 - Math.max(0, c.v) / maxV);
  else if (thr < 0) c.v -= (c.v > 0 ? 30 : 8) * dt;
  c.v -= c.v * CART.drag * dt;
  if (c.v < -6) c.v = -6;
  if (thr === 0 && Math.abs(c.v) < 0.3) c.v = 0;
  const sf = Math.min(1, Math.abs(c.v) / 5) * Math.sign(c.v || 1);
  if (c.drifting) {
    c.h += (c.driftDir * 0.8 + steer * 0.6) * 2.5 * dt * sf;
    c.v -= c.v * 0.18 * dt;
  } else c.h += steer * dt * CART.steerRate * sf * (c.st ? c.st.hdl : 1) * (c.pm ? c.pm.hdl : 1);
  const grip = c.drifting ? 1.6 : c.slipT > 0 ? 0.9 : c.spin > 0 ? 0.5 : 9;
  let slip = ang(c.h - c.vd);
  c.vd += slip * Math.min(1, grip * dt);
  slip = ang(c.h - c.vd);
  if (Math.abs(slip) > 1.0) {
    c.vd = c.h - Math.sign(slip) * 1.0;
    slip = Math.sign(slip) * 1.0;
  }
  c.slip = slip;
  if (c.drifting && Math.abs(slip) > 0.75 && c.riders && c.riders.length && c.driftT > 0.8) hopOut(c, 'drift');
  if (c.drifting && S.state === 'race') {
    c.gauge += Math.abs(slip) * Math.abs(c.v) * dt * CART.driftCharge * (c.st ? c.st.drf : 1) * (c.pm ? c.pm.drf : 1);
    if (c.gauge >= 1) {
      c.gauge = 0;
      if (c.n2o < 2) {
        c.n2o++;
        if (!c.ai) {
          flash('🔥 N2O 충전!');
          sound.charge();
        }
      }
    }
  }
  c.x += Math.sin(c.vd) * c.v * dt;
  c.z += Math.cos(c.vd) * c.v * dt;
  shelfCollide(c, dt);
  // progress
  const ni = nearestIdx(c.x, c.z, c.idx - 3, TR.MAP.win || 14);
  if (c.idx > S.N - 8 && ni < 8) {
    c.lap++;
    if (S.state === 'race') {
      if (S.GMODE !== 'shop') lapDone(c);
      if (checkout && c.lap >= 1) {
        checkout.react('cheer', FIN(c) ? 4 : 1.4);
        if (FIN(c) && (c === S.player || !finishOrder.length)) {
          const cs = checkout.cashiers[0];
          if (cs) say(cs, finishOrder.length ? '수고하셨어요~!' : '축하합니다~! 🎉', 2.2, true);
        }
      }
      if (S.GMODE !== 'shop') paLap(c);
      else if (FIN(c) && !finishOrder.length) paSay(`${stripTags(c.name)} 고객님 1등으로 계산 완료~! 축하드립니다!`);
    }
    if (FIN(c) && !c.finished && S.state === 'race') {
      c.finished = true;
      c.time = S.raceT;
      finishOrder.push(c);
      if (S.MODE !== 'guest' || c === S.player) say(c, cline(c, 'win', ['야호~!']), 2.2, true);
      if (c === S.player) {
        sound.fanfare();
        if (S.GMODE === 'shop') startSpectate();
        else if (S.MODE === 'solo') endRace();
        else mpFinish();
      }
    } else if (!c.ai && S.GMODE === 'shop' && S.state === 'race') {
      flash(`🧾 아직 목록이 남았어요 (${S.shop.got(c)}/${S.shop.S(c).list.length})! 한 바퀴 더~`);
      sound.lap();
    } else if (!c.ai && c.lap < LAPS) {
      flash(`랩 ${c.lap + 1}/${LAPS}!`);
      sound.lap();
    }
  } else if (c.idx < 8 && ni > S.N - 8) c.lap--;
  c.idx = ni;
  c.prog = c.finished ? 1e6 - c.time : c.lap * S.N + c.idx;
}

// per-map best lap (localStorage)
const bestKey = () => 'cartBest_' + TR.MAP_ID,
  getBest = id => +LS.get('cartBest_' + id) || 0;
Object.assign(ctx, { getBest });
function lapDone(c) {
  if (c.finished || c.lap <= (c.lapMax ?? -9)) return;
  c.lapMax = c.lap;
  if (c.lap >= 1 && c.lapT0 != null) {
    const lt = S.raceT - c.lapT0;
    c.laps = (c.laps || []).concat(lt);
    if (c === S.player) {
      const b = getBest(TR.MAP_ID);
      if (!b || lt < b) {
        LS.set(bestKey(), lt.toFixed(2));
        c.newBest = true;
        setTimeout(() => flash(`🏅 최고 랩 갱신! ${fmt(lt)}`), 900);
      }
    }
  }
  c.lapT0 = S.raceT;
}
// ---------- store PA announcer ----------
const PA_LINES = {
  _: [
    '고객 여러분, 카트는 천천히 밀어 주세요~ (아마도요)',
    '오늘 계산대 3번 오픈했습니다!',
    '미아 방지 안내: 카트에 탄 손님은 잠시 후 내려 드립니다',
    '상품 파손 시 혼돈 지수가 올라갑니다. 열심히 해 주세요?!',
    '시식 코너에서 만두 드셔 보세요~',
  ],
  mart: ['라면 대전! 오늘만 1+1 행사 중입니다', '신선 코너 수박이 아주 달아요~'],
  freezer: ['냉동 코너 바닥이 미끄럽습니다. 주의해 주세요!', '냉동고 문은 꼭 닫아 주세요~', '아이스크림 1+1 행사 중!'],
  parking: ['주차장 내 서행 바랍니다. 차량 통행 주의!', 'B1 출구는 오른쪽입니다', '카트는 카트 보관소에 반납해 주세요'],
  skywalk: ['무빙워크에서 뛰지 마세요!', '2층 의류 매장 30% 세일 중!', '에스컬레이터 옆 통로는 지름길이… 아닙니다?'],
};
let paT = 14,
  paLeader = null,
  paLeadT = 0,
  paFinal = false;
const paSay = t => FX.pa(t, () => sound.pa());
function paTick(dt) {
  if (S.state !== 'race') return;
  paT -= dt;
  paLeadT -= dt;
  if (paT <= 0) {
    paT = 22 + Math.random() * 14;
    paSay(pick([...PA_LINES._, ...(PA_LINES[TR.MAP_ID] || [])]));
  }
  const act = carts.filter(c => !c.inactive),
    lead = act.sort((a, b) => b.prog - a.prog)[0];
  if (lead && lead !== paLeader && S.raceT > 8 && paLeadT <= 0) {
    paLeadT = 14;
    paSay(`현재 1위는 ${lead.name.replace(/[<>&]/g, '')} 고객님입니다!`);
  }
  if (lead) paLeader = lead;
}
function paLap(c) {
  if (!paFinal && c.lap === LAPS - 1 && !c.finished) {
    paFinal = true;
    paSay('마지막 바퀴입니다! 계산대 앞이 결승선이에요~');
  }
  if (c.lap >= LAPS && finishOrder.length === 0) paSay(`${c.name.replace(/[<>&]/g, '')} 고객님 1등으로 계산 완료~! 축하드립니다!`);
}
function interactions(dt) {
  for (const c of carts) {
    if (c.inactive) continue;
    const fx = Math.sin(c.h),
      fz = Math.cos(c.h);
    for (const o of carts)
      if (o !== c && !o.inactive) {
        const rel = Math.abs(c.v) - Math.abs(o.v),
          fast = Math.abs(c.v);
        if (circlePush(c, o.x, o.z, CART_R * 1.8, 0.985)) {
          if (c === S.player && (c.cbump || 0) <= 0) {
            sound.bump(0.7);
            c.cbump = 0.5;
          }
          if (SHOPON() && S.MODE !== 'guest' && S.state === 'race' && rel > 5 && fast > 9 && (o.ramT || 0) <= 0) {
            o.ramT = 1.5;
            S.shop.hit(o, 'ram');
            FX.comic(o.x, 2.2 + hAt(o.x, o.z), o.z, pick(['쾅!', 'BAM!']), '#ff7043');
            if (c === S.player) flash(`${stripTags(o.name)} 카트를 들이받았다! 물건이 떨어졌다 💥`);
          }
        }
      }
    c.ramT = (c.ramT || 0) - dt;
    c.cbump = (c.cbump || 0) - dt;
    if (S.MODE === 'guest') {
      guestBumps(c);
      c.bump = (c.bump || 0) - dt;
      continue;
    }
    for (const cu of customers) {
      if (cu.state === 'walk') {
        const cx = c.x + fx * 1.2,
          cz = c.z + fz * 1.2;
        if (Math.hypot(cx - cu.x, cz - cu.z) < 1.0 || Math.hypot(c.x - cu.x, c.z - cu.z) < 1.3) {
          if (Math.abs(c.v) > 9) {
            knockCustomer(cu, c);
            c.v *= 0.75;
            if (!c.ai || Math.hypot(c.x - S.player.x, c.z - S.player.z) < 25) sound.oof();
          } else {
            const side = Math.sign((cu.x - c.x) * fz - (cu.z - c.z) * fx) || 1;
            c.v *= c.ai ? 0.8 : 0.5;
            cu.x += fz * side * 0.5 + fx * 0.2;
            cu.z -= fx * side * 0.5 - fz * 0.2;
            cu.pause = 0;
            cu.shockT = 1; // sidestep instead of being bulldozed along
            if (c === S.player && (c.bump || 0) <= 0) {
              flash('앗, 죄송합니다! 🙇');
              sound.bump(0.6);
              c.bump = 1;
            }
          }
        } else if (Math.abs(c.v) > 8 && Math.hypot(c.x - cu.x, c.z - cu.z) < 3.2 && Math.random() < 0.05) {
          say(cu, pick(['조심해요!', '어머나!', '천천히 좀!', '위험해요!']), 1.5);
          cu.shockT = 1;
        }
      } else if (cu.body) circlePush(c, cu.body.position.x, cu.body.position.z, 1.7, 0.9); // fallen customers block
    }
    c.bump = (c.bump || 0) - dt;
    for (const p of products) {
      const b = p.body.position;
      if (b.y - hAt(b.x, b.z) < 0.6 && Math.abs(b.x - c.x) < 1.4 && Math.abs(b.z - c.z) < 1.4) c.v *= 0.993;
    }
  }
}

function customerFx(dt) {
  for (const cu of customers) {
    if (cu.prevSt === 'rise' && cu.state === 'walk') cu.angryT = 4.5;
    if (cu.prevSt !== cu.state && cu.state === 'ride') cu.mood = null;
    cu.prevSt = cu.state;
    cu.angryT = (cu.angryT || 0) - dt;
    cu.shockT = (cu.shockT || 0) - dt;
    cu.fxT = (cu.fxT || 0) + dt;
    if (cu.state === 'ride') continue;
    if (cu.state === 'down') {
      cu.g.face('dizzy');
      cu.g.stars(!LOWFX || true, cu.fxT);
    } else if (cu.state === 'rise') {
      cu.g.face('angry');
      cu.g.stars(false);
      cu.g.pose('fist', cu.fxT);
    } else {
      cu.g.face(cu.shockT > 0 ? 'shock' : cu.angryT > 0 ? 'angry' : 'normal');
      cu.g.stars(false);
    }
  }
}
function updateCustomers(dt) {
  for (const cu of customers) {
    cu.t += dt;
    if (cu.state === 'walk') {
      const dx = cu.tx - cu.x,
        dz = cu.tz - cu.z,
        d = Math.hypot(dx, dz);
      if (cu.rush) {
        cu.rush.t -= dt;
        cu.baseSp = cu.baseSp || cu.sp;
        cu.tx = cu.rush.x;
        cu.tz = cu.rush.z;
        cu.pause = 0;
        cu.sp = Math.hypot(cu.tx - cu.x, cu.tz - cu.z) < 0.6 ? 0.0001 : 3.2;
        if (cu.rush.t <= 0) {
          delete cu.rush;
          cu.sp = cu.baseSp;
          retarget(cu);
        }
      }
      if (cu.pause > 0) {
        cu.pause -= dt;
        cu.t = 0;
      } else if (!cu.rush && (d < 0.6 || cu.t > 12)) {
        pickTarget(cu);
        cu.t = 0;
      } else {
        cu.x += (dx / d) * cu.sp * dt;
        cu.z += (dz / d) * cu.sp * dt;
        cu.holder.rotation.set(0, Math.atan2(dx, dz), 0);
      }
      if (pushOut(cu, 0.5) && !cu.rush) pickTarget(cu);
      if (Math.random() < dt * 0.05) chatter(cu);
      cu.holder.position.set(cu.x, 0.85 + hAt(cu.x, cu.z), cu.z);
      cu.g.walk(cu.pause > 0 ? 0 : cu.t * cu.sp * 6);
    } else if (cu.state === 'ride') {
      const c = cu.cart;
      ridePose(cu, c, cu.seat, c.riders.length);
      cu.rideT += dt;
      if (cu.rideT > 4 && Math.random() < dt * 0.15) say(cu, pick(['언제 내려줘요?', '와 신난다~', '계산대는 저쪽이에요!']), 1.6);
      if (c.riders[0] === cu && cu.rideT > 8.5 + cu.seat) hopOut(c, 'time');
    } else if (cu.state === 'down') {
      {
        const bp = cu.body.position,
          o = { x: bp.x, z: bp.z };
        if (pushOut(o, 0.45)) {
          bp.x = o.x;
          bp.z = o.z;
          cu.body.velocity.x *= -0.3;
          cu.body.velocity.z *= -0.3;
        }
      }
      cu.holder.position.copy(cu.body.position);
      cu.holder.quaternion.copy(cu.body.quaternion);
      cu.g.walk(0);
      if (cu.t > 7) {
        cu.state = 'rise';
        cu.t = 0;
        cu.q0 = cu.holder.quaternion.clone();
        cu.x = cu.body.position.x;
        cu.z = cu.body.position.z;
        cu.y0 = cu.body.position.y;
        world.removeBody(cu.body);
        cu.body = null;
        cu.qUp = new THREE.Quaternion();
        pushOut(cu, 0.5);
        say(cu, pick(['아이고 허리야…', '누가 카트를 저렇게 몰아!', '진짜 화나네!', '매니저 불러요!']), 2.5, true);
      }
    } else if (cu.state === 'rise') {
      const k = Math.min(1, cu.t / 1.2);
      cu.holder.quaternion.slerpQuaternions(cu.q0, cu.qUp, k);
      cu.holder.position.set(cu.x, cu.y0 + (0.85 + hAt(cu.x, cu.z) - cu.y0) * k + Math.sin(k * Math.PI) * 0.35, cu.z);
      if (k >= 1) {
        cu.state = 'walk';
        cu.t = 0;
        cu.holder.quaternion.identity();
        pickTarget(cu);
      }
    }
  }
}

const chaos = () => stats.knocked * 100 + stats.spilled * 10;
Object.assign(ctx, { chaos });
const fmt = t => `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}`;
Object.assign(ctx, { fmt });

// ---------- auto-accel ----------
S.autoAccel = LS.get('cartAuto', IS_TOUCH ? '1' : '0') === '1';
inputMod.init2();

// ---------- speech bubbles (HTML overlay projected to screen) ----------
const bubbleLayer = $('bubbles'),
  bubbles = [];
Object.assign(ctx, { bubbleLayer, bubbles });
hudMod.init0();

// rival taunts / rank chatter

// ---------- particle puffs ----------
const puffs = [],
  puffG = new THREE.SphereGeometry(0.25, 6, 5);
function puff(x, y, z, col, n) {
  for (let i = 0; i < n; i++) {
    let p = puffs.find(q => q.life <= 0);
    if (!p) {
      if (puffs.length > (LOWFX ? 14 : 60)) return;
      p = {
        m: new THREE.Mesh(puffG, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false })),
        life: 0,
        v: new THREE.Vector3(),
      };
      scene.add(p.m);
      puffs.push(p);
    }
    p.m.material.color.setHex(col);
    p.m.visible = true;
    p.m.position.set(x, y + hAt(x, z), z);
    p.v.set(Math.random() * 4 - 2, Math.random() * 3, Math.random() * 4 - 2);
    p.life = 0.6 + Math.random() * 0.3;
  }
}
function updatePuffs(dt) {
  for (const p of puffs) {
    if (p.life <= 0) continue;
    p.life -= dt;
    p.m.position.addScaledVector(p.v, dt);
    p.v.multiplyScalar(0.92);
    p.m.scale.setScalar(1 + (1 - p.life) * 2);
    p.m.material.opacity = Math.max(0, p.life);
    if (p.life <= 0) p.m.visible = false;
  }
}
// ---------- minimap ----------
hudMod.init1();

// ---------- fun systems: drift FX, items, events ----------

// watchdog for every toast/banner (wall clock, independent of the game loop / timer throttling)

let funOwned = null,
  checkout = null;
const QS = new URLSearchParams(location.search);
let DIFF = DIFFS[QS.get('diff') || LS.get('cartDiff')] ? QS.get('diff') || LS.get('cartDiff') : 'normal';
const botMaxV = () => {
  const d = DIFFS[DIFF];
  return d[2] + Math.random() * d[3];
};
function rubber(c) {
  // mild rubber-banding vs the best human: bots far behind get a little faster, bots far ahead ease off
  let ref = -1e9;
  for (const o of carts) if ((!o.ai || o === S.player) && !o.inactive && !o.finished && o.prog > ref) ref = o.prog;
  if (ref < -1e8 || c.finished) return 1;
  const d = DIFFS[DIFF],
    g = (ref - c.prog) / S.N; // laps behind (+) / ahead (-)
  return g > 0 ? 1 + Math.min(d[4], g * d[4] * 2.5) : 1 - Math.min(d[5], -g * d[5] * 2.5);
}
S.GMODE = (QS.get('mode') || LS.get('cartMode')) === 'shop' ? 'shop' : 'race';
S.TLIM = QS.has('notime') ? false : LS.get('cartTlim') !== '0';
const SHOPON = () => S.GMODE === 'shop' && !!S.shop;
Object.assign(ctx, { SHOPON });
const FIN = c => (S.GMODE === 'shop' ? !!S.shop && S.shop.complete(c) && c.lap >= 1 : c.lap >= LAPS);
const solidAt = (x, z) => strips.some(s => x > s.x0 - 0.2 && x < s.x1 + 0.2 && z > s.z0 - 0.2 && z < s.z1 + 0.2);
function shopFx(c, f) {
  const [kind, k, why] = f,
    g = S.shop.GOODS[S.shop.GI[k]],
    near = c === S.player || Math.hypot(c.x - S.player.x, c.z - S.player.z) < 22,
    y = hAt(c.x, c.z);
  if (kind === 'grab') {
    if (near) {
      FX.comic(
        c.x,
        2.4 + y,
        c.z,
        why === 'wrong' ? `${g.i}?` : `+${g.i}`,
        why === 'wrong' ? '#9e9e9e' : why === 'sale' ? '#ff1744' : '#69f0ae',
      );
      puff(c.x, 1.3, c.z, why === 'sale' ? 0xff1744 : 0xfff176, LOWFX ? 3 : 6);
    }
    if (c === S.player) {
      if (why === 'wrong') {
        flash(`앗, 목록에 없는 ${g.n}… (-100점)`);
        sound.empty();
      } else {
        const n = S.shop.got(c),
          L = S.shop.S(c).list.length;
        flash(why === 'sale' ? `🏷️ 할인 ${g.n}! (${n}/${L})` : `🛒 ${g.n} 담았다! (${n}/${L})`);
        sound.charge();
        if (S.shop.complete(c)) {
          setTimeout(() => {
            if (!c.finished) flash('🧾 목록 완료! 계산대(결승선)로 가세요!');
          }, 900);
          say(c, cline(c, 'grab', ['다 샀다~!']), 1.6, true);
        }
      }
    } else if (near && Math.random() < 0.3 && S.MODE !== 'guest') say(c, cline(c, 'grab', ['찾았다~']), 1.2);
  } else if (kind === 'drop') {
    if (near) {
      FX.comic(c.x, 2.2 + y, c.z, `${g.i} 툭!`, '#ffab40');
      puff(c.x, 1, c.z, g.c, LOWFX ? 3 : 6);
    }
    if (S.MODE !== 'guest' && products.length < MAXP)
      spawnProduct(c.x, 1.4 + y, c.z, (Math.random() - 0.5) * 4, 3, (Math.random() - 0.5) * 4);
    if (c === S.player) {
      flash(`${g.i} ${g.n}이(가) 카트에서 떨어졌다! 다시 담아요`);
      S.shake = Math.max(S.shake, 0.4);
    }
  } else if (kind === 'break') {
    if (near) {
      FX.comic(c.x, 2.3 + y, c.z, '🥚 깨졌다!', '#ffd54f');
      puff(c.x, 1.1, c.z, 0xffd54f, LOWFX ? 3 : 7);
    }
    if (c === S.player) {
      flash('🥚 계란이 깨졌다! 다시 담아야 해요 (-150점)');
      sound.clatter(3);
    }
  }
}

function renderModes() {
  const host = NET.mode === 'host',
    guest = NET.mode === 'guest';
  for (const [elId, lobby] of [
    ['modeRow', false],
    ['lobbyModes', true],
  ]) {
    const el = $(elId);
    if (!el) continue;
    const locked = lobby && guest;
    el.innerHTML =
      [
        ['race', '🏁', '레이스', '3바퀴 먼저 완주'],
        ['shop', '🛒', '장보기', '목록 담고 계산대로'],
      ]
        .map(
          ([id, ic, n, d]) =>
            `<button class="mapc modec ${S.GMODE === id ? 'sel' : ''}" data-mode="${id}" ${locked ? 'disabled' : ''}><span class="mi">${ic}</span><b>${n}</b><small>${d}</small></button>`,
        )
        .join('') +
      (S.GMODE === 'shop'
        ? `<button class="mapc modec ${S.TLIM ? 'sel' : ''}" data-tlim="1" ${locked ? 'disabled' : ''}><span class="mi">⏱</span><b>2분 제한</b><small>${S.TLIM ? '켜짐' : '꺼짐'}</small></button>`
        : '');
    el.querySelectorAll('button').forEach(
      b =>
        (b.onclick = () => {
          if (locked || !(S.state === 'title' || S.state === 'lobby')) return;
          if (b.dataset.mode) S.GMODE = b.dataset.mode;
          else S.TLIM = !S.TLIM;
          LS.set('cartMode', S.GMODE);
          LS.set('cartTlim', S.TLIM ? '1' : '0');
          if (S.shop) S.shop.setActive(S.GMODE === 'shop');
          renderModes();
          if (host) {
            NET.opts = optsNow();
            pushLobby();
          }
        }),
    );
  }
  for (const [elId, lobby] of [
    ['diffRow', false],
    ['lobbyDiff', true],
  ]) {
    const el = $(elId);
    if (!el) continue;
    const locked = lobby && guest;
    el.innerHTML =
      `<span class="dl">🤖 봇 난이도</span>` +
      Object.entries(DIFFS)
        .map(
          ([id, [n, ic]]) =>
            `<button class="${DIFF === id ? 'on' : ''}" data-diff="${id}" aria-pressed="${DIFF === id}" ${locked ? 'disabled' : ''}>${ic} ${n}</button>`,
        )
        .join('') +
      (lobby
        ? `<button class="${S.PSTATS ? 'on' : ''}" data-pst="1" aria-pressed="${!!S.PSTATS}" ${locked ? 'disabled' : ''} title="켜면 파츠 능력치(±5%)가 적용돼요. 끄면 외형만">🔧 파츠 능력치 ${S.PSTATS ? '켬' : '끔'}</button>`
        : '');
    el.querySelectorAll('button').forEach(
      b =>
        (b.onclick = () => {
          if (locked || !(S.state === 'title' || S.state === 'lobby')) return;
          if (b.dataset.pst) S.PSTATS = !S.PSTATS;
          else {
            DIFF = b.dataset.diff;
            LS.set('cartDiff', DIFF);
          }
          renderModes();
          if (host) {
            NET.opts = optsNow();
            pushLobby();
          }
        }),
    );
  }
  const d = $('modeDesc');
  if (d)
    d.textContent =
      S.GMODE === 'shop'
        ? '🛒 빛나는 진열대를 천천히 지나가거나 아이템 키로 목록의 물건을 담고 계산대(결승선)로! 🏷️할인 보너스 · 계란 파손/목록 외 물건 감점'
        : '🏁 마트를 3바퀴 먼저 도는 사람이 승리!';
  const ln = $('lobbyModeNote');
  if (ln)
    ln.textContent = guest
      ? `모드: ${S.GMODE === 'shop' ? '🛒 장보기' + (S.TLIM ? ' (2분 제한)' : '') + ` · 봇 ${DIFFS[DIFF][0]}` : '🏁 레이스'} (호스트가 선택)`
      : '';
}
const optsNow = () => ({ gmode: S.GMODE, tlim: S.TLIM, diff: DIFF, pst: !!S.PSTATS });
Object.assign(ctx, { optsNow });
function onOpts(o) {
  if (!o) return;
  S.GMODE = o.gmode === 'shop' ? 'shop' : 'race';
  S.TLIM = !!o.tlim;
  if (DIFFS[o.diff]) DIFF = o.diff;
  S.PSTATS = !!o.pst;
  if (S.shop) S.shop.setActive(S.GMODE === 'shop');
  renderModes();
}
function makeFun() {
  const s0 = new Set(scene.children),
    b0 = new Set(world.bodies);
  S.fun = createFun({
    low: LOWFX,
    scene,
    world,
    carts,
    path,
    N: S.N,
    strips,
    customers,
    sound,
    get player() {
      return S.player;
    },
    textSprite,
    say,
    puff,
    flash,
    spawnProduct,
    stats,
    insideShelf,
    circlePush,
    announce,
    retarget,
    pushOut,
    shakeIt: k => {
      S.shake = Math.max(S.shake, k);
    },
    lights: { hemi, dl, dl2 },
    extraObs,
    comic: FX.comic,
    screenFlash: FX.screenFlash,
    onHit: (c, by) => {
      if (SHOPON() && S.MODE !== 'guest' && S.state === 'race') S.shop.hit(c, 'hit');
    },
  });
  funOwned = { objs: scene.children.filter(o => !s0.has(o)), bodies: world.bodies.filter(b => !b0.has(b)) };
}
function disposeFun() {
  S.fun.reset();
  const freeMat = m => {
    if (!m) return;
    for (const x of Array.isArray(m) ? m : [m]) {
      if (x.map) x.map.dispose();
      x.dispose();
    }
  };
  for (const o of funOwned.objs) {
    scene.remove(o);
    o.traverse(n => {
      if (n.geometry) n.geometry.dispose();
      freeMat(n.material);
    });
  }
  for (const b of funOwned.bodies) world.removeBody(b);
  for (const c of carts)
    if (c.shieldMesh) {
      c.g.root.remove(c.shieldMesh);
      c.shieldMesh.geometry.dispose();
      c.shieldMesh.material.dispose();
      c.shieldMesh = null;
    }
}
// ---------- map-specific moving things: freezer doors (strips toggled on a shared clock) & parking-lot traffic ----------
const traffic = [];
Object.assign(ctx, { traffic });
let honkCd = 0;
function makeCar(col) {
  const g = new THREE.Group(),
    body = new THREE.Mesh(new THREE.BoxGeometry(2, 0.8, 4.2), new THREE.MeshLambertMaterial({ color: col }));
  body.position.y = 0.65;
  g.add(body);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.6, 2.2), new THREE.MeshLambertMaterial({ color: 0x263238 }));
  cab.position.set(0, 1.3, -0.2);
  g.add(cab);
  const hl = new THREE.MeshBasicMaterial({ color: 0xfff59d });
  for (const s of [-0.65, 0.65]) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, 0.05), hl);
    l.position.set(s, 0.7, 2.11);
    g.add(l);
  }
  const wm = new THREE.MeshLambertMaterial({ color: 0x111111 });
  for (const sx2 of [-1, 1])
    for (const sz2 of [-1.35, 1.35]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.25, 10), wm);
      w.rotation.z = Math.PI / 2;
      w.position.set(sx2 * 0.95, 0.33, sz2);
      g.add(w);
    }
  scene.add(g);
  return g;
}
function mapClock() {
  return S.state === 'race' || S.state === 'finished' ? S.raceT : S.state === 'countdown' ? 0 : performance.now() / 1000;
}
function updateMapFx(dt) {
  const T = mapClock();
  honkCd -= dt;
  for (const d of trk.doors) {
    const s = d.strip;
    if (s.slam > 0) s.slam -= dt;
    const open = !(s.slam > 0) && (T + d.phase) % d.period < 2.2;
    if (open && s.off && Math.hypot(d.x - S.player.x, d.z - S.player.z) < 18) sound.door();
    s.off = !open;
    d.ang += ((open ? d.openRot : 0) - d.ang) * Math.min(1, dt * 12);
    d.pivot.rotation.y = d.ang;
  }
  for (const C of traffic) {
    const f = (((C.off * S.N - T * 4.5) % S.N) + S.N) % S.N,
      i0 = Math.floor(f),
      k = f - i0,
      lat = TR.MAP.inSign * 6.3;
    const a = atLane(i0, lat),
      b = atLane(i0 + 1, lat);
    C.x = a.x + (b.x - a.x) * k;
    C.z = a.z + (b.z - a.z) * k;
    C.h = Math.atan2(a.x - b.x, a.z - b.z);
    C.g.position.set(C.x, hAt(C.x, C.z), C.z);
    C.g.rotation.y = C.h;
    for (const c of carts)
      if (!c.inactive && !c.net && circlePush(c, C.x, C.z, 2.7, 0.5) && c === S.player && (c.carHit || 0) < performance.now()) {
        c.carHit = performance.now() + 900;
        sound.honk();
        sound.bump(1);
        S.shake = 0.7;
        FX.comic(c.x, 2 + hAt(c.x, c.z), c.z, '빵빵! 💥', '#ff9100');
        FX.screenFlash('#ffcc80', 0.35);
        flash('빵빵! 🚗 차에 부딪혔다!');
        if (c.riders && c.riders.length) hopOut(c, 'crash');
      }
    const dp = Math.hypot(C.x - S.player.x, C.z - S.player.z);
    if (dp < 16 && honkCd <= 0 && S.state === 'race') {
      honkCd = 4;
      sound.honk();
      say(C.ent, pick(['빵빵! 비켜요~', '카트는 인도로!', '주차장에서 레이스라니!']), 1.6);
    }
    if (S.MODE !== 'guest')
      for (const cu of customers)
        if (cu.state === 'walk' && Math.hypot(cu.x - C.x, cu.z - C.z) < 2.8) {
          const a2 = Math.atan2(cu.x - C.x, cu.z - C.z);
          cu.x = C.x + Math.sin(a2) * 2.8;
          cu.z = C.z + Math.cos(a2) * 2.8;
          pushOut(cu, 0.5);
          if (Math.random() < 0.02) say(cu, pick(['어머, 차다!', '천천히 가요!']), 1.4);
        } // pedestrians jump aside
  }
}
function extraObs() {
  const o = [];
  for (const C of traffic) o.push({ x: C.x, z: C.z, r: 2.6 });
  if (trk) for (const d of trk.doors) if (!d.strip.off) o.push({ x: d.x, z: d.z, r: 1.1 });
  return o;
}
// ---------- map loading (title / lobby only) ----------
function loadMap(id) {
  if (!MAPS[id]) id = 'mart';
  if (S.fun) disposeFun();
  if (trk) trk.dispose();
  for (const C of traffic) {
    scene.remove(C.g);
    C.g.traverse(n => {
      if (n.geometry) n.geometry.dispose();
    });
  }
  traffic.length = 0;
  for (const p of products) {
    scene.remove(p.mesh);
    world.removeBody(p.body);
  }
  products.length = 0;
  for (const m of mirror) m.mesh.visible = false;
  for (const b of bubbles.splice(0)) b.el.remove();
  seeded(hashStr(id) + 20261016, () => {
    setMap(id);
    S.N = path.length;
    trk = buildWorld(scene, world, { low: LOWFX });
    const T = TR.MAP.theme;
    scene.background.set(T.bg);
    scene.fog.color.set(T.fogCol ?? T.bg);
    scene.fog.near = T.fog[0] * (LOWFX ? 0.6 : 1);
    scene.fog.far = T.fog[1] * (LOWFX ? 0.7 : 1);
    camera.far = LOWFX ? scene.fog.far + 4 : 300;
    camera.updateProjectionMatrix();
    hemi.intensity = T.hemi;
    dl.intensity = T.dl;
    dl2.intensity = T.dl2;
    if (checkout) checkout.dispose();
    checkout = FX.buildCheckout(scene, { path, strips, HW: TR.HW, inSign: TR.MAP.inSign, hAt, textSprite, tangentAt });
    makeFun();
    if (S.shop) S.shop.dispose();
    S.shop = createShop({
      scene,
      carts,
      path,
      N: S.N,
      HW: TR.HW,
      atLane,
      insideShelf: solidAt,
      hAt,
      low: LOWFX,
      mapId: TR.MAP_ID,
      obstacles: () => S.fun.obstacles,
      paSay: t => paSay(t),
      onFx: shopFx,
    });
    S.shop.setActive(S.GMODE === 'shop');
    if (TR.MAP.traffic)
      for (let k = 0; k < 2; k++) {
        const g = makeCar([0x1e88e5, 0xeeeeee][k]);
        traffic.push({ g, off: 0.3 + k * 0.5, x: 0, z: 0, h: 0, ent: { g: { root: g } } });
      }
    for (const cu of customers) {
      if (cu.body) {
        world.removeBody(cu.body);
        cu.body = null;
      }
      Object.assign(cu, { state: 'walk', cart: null, rush: null, nt: null, pause: 0, t: 0 });
      cu.holder.scale.setScalar(1);
      cu.holder.quaternion.identity();
      let i = (Math.random() * S.N) | 0;
      if (i < 12 || i > S.N - 4) i = (i + 20) % S.N;
      const p = atLane(i, (Math.random() * 2 - 1) * (TR.HW - 1.5));
      cu.x = p.x;
      cu.z = p.z;
      pushOut(cu, 0.5);
      retarget(cu);
      cu.holder.position.set(cu.x, 0.85 + hAt(cu.x, cu.z), cu.z);
    }
  });
  carts.forEach((c, i) => {
    const was = c.inactive;
    c.riders = [];
    resetCart(c, i);
    c.inactive = was;
    if (was) {
      c.x = c.z = 999;
    }
  });
  setupMinimap();
  camPos.set(0, 0, 0);
  S.shake = 0;
  LS.set('cartMap', TR.MAP_ID);
  renderMaps();
}
function renderMaps() {
  const host = NET.mode === 'host',
    guest = NET.mode === 'guest';
  for (const [elId, lobby] of [
    ['mapRow', false],
    ['lobbyMaps', true],
  ]) {
    const el = $(elId);
    if (!el) continue;
    const locked = lobby && guest;
    el.innerHTML = MAP_IDS.map(id => {
      const M = MAPS[id],
        b = getBest(id);
      return `<button class="mapc ${id === TR.MAP_ID ? 'sel' : ''}" data-map="${id}" ${locked ? 'disabled' : ''}><span class="mi">${M.icon}</span><b>${M.name}</b><small>${b ? '🏅 ' + fmt(b) : '기록 없음'}</small></button>`;
    }).join('');
    el.querySelectorAll('[data-map]').forEach(
      btn =>
        (btn.onclick = () => {
          if (locked || !(S.state === 'title' || S.state === 'lobby')) return;
          loadMap(btn.dataset.map);
          if (host) {
            NET.map = TR.MAP_ID;
            pushLobby();
          }
        }),
    );
  }
  renderModes();
  const d = $('mapDesc');
  if (d) d.textContent = TR.MAP.desc;
  const ld = $('lobbyMapNote');
  if (ld)
    ld.textContent = guest ? `맵: ${TR.MAP.icon} ${TR.MAP.name} (호스트가 선택)` : host ? '맵을 선택하세요 (게스트에게 자동 동기화)' : '';
}
Math.random = _rand;

// ---------- multiplayer glue (host-authoritative; see net.js) ----------

const GRID = i => {
  const p = path[0],
    [tx, tz] = tangentAt(0),
    back = 4 + (i >> 1) * 5,
    lat = i % 2 ? 2.5 : -2.5;
  return { x: p.x - tx * back - tz * lat, z: p.y - tz * back + tx * lat, h: Math.atan2(tx, tz) };
};
const CU_ST = ['walk', 'down', 'rise', 'ride'];
Object.assign(ctx, { CU_ST });
function resetCart(c, i) {
  if (c.riders && c.riders.length) hopOut(c);
  const g = GRID(i);
  Object.assign(c, {
    x: g.x,
    z: g.z,
    h: g.h,
    vd: g.h,
    v: 0,
    lapT0: null,
    lapMax: null,
    laps: [],
    newBest: false,
    lastZone: null,
    bumpT: 0,
    finished: false,
    time: 0,
    n2o: 0,
    gauge: 0,
    combo: 0,
    drifts: 0,
    lateSpec: false,
    item: null,
    spin: 0,
    boostT: 0,
    instT: 0,
    drifting: false,
    slip: 0,
    riderN: 0,
    stuck: 0,
    reverse: 0,
    magnetT: 0,
    shieldT: 0,
    hitSeq: 0,
    hitSeqSeen: 0,
    rs: null,
    ns: null,
    net: false,
    remote: false,
    inactive: false,
    useItem: false,
    useN2O: false,
  });
  c.idx = nearestIdx(c.x, c.z, 0, S.N);
  c.lap = c.idx > S.N / 2 ? -1 : 0;
  c.prog = c.lap * S.N + c.idx;
}
function nameTag(c, name) {
  if (c.tag) {
    c.g.root.remove(c.tag);
    c.tag.material.map.dispose();
    c.tag.material.dispose();
    c.tag = null;
  }
  if (!name) return;
  c.tag = textSprite(name, '#' + c.color.toString(16).padStart(6, '0'));
  c.tag.position.y = 2.7;
  c.tag.scale.set(1.5, 0.38, 1);
  c.g.root.add(c.tag);
}
function startRaceMP(slots, you, mode) {
  if (mode !== 'solo' && S.GMODE === 'shop') maybeShopTutorial(null); // first online shopping match: non-blocking explainer
  S.MODE = mode;
  S.fun.reset();
  for (const c of carts) if (c.ai) c.maxV = botMaxV();
  finishOrder.length = 0;
  S.raceT = 0;
  S.mpDone = false;
  S.coinsDone = null;
  S.firstFinT = 0;
  S.netAcc = 0;
  carts.forEach((c, i) => {
    resetCart(c, i);
    const s = slots[i];
    c.inactive = !s;
    c.g.root.visible = !!s;
    c.name = s ? s.name : c.baseName;
    c.ai = !!s && s.type === 'bot' && mode !== 'guest';
    c.remote = mode === 'host' && !!s && s.type === 'human' && i !== you;
    c.net = mode === 'guest' && i !== you;
    if (c.inactive) {
      c.x = 999;
      c.z = 999;
      c.prog = -1e9;
    }
    if (s && s.char) setCartChar(c, s.char);
    if (s) setCartParts(c, s.parts || (s.type === 'bot' ? randomLoadout() : null), mode === 'solo' || S.PSTATS);
    nameTag(c, s && i !== you ? s.name : null);
  });
  endSpectate();
  S.player = carts[you];
  S.player.ai = false;
  S.player.name = slots[you] ? slots[you].name : '나';
  if (S.shop) {
    S.shop.setActive(S.GMODE === 'shop');
    if (S.GMODE === 'shop') {
      if (mode !== 'guest') S.shop.newRace();
      else for (const c of carts) c.shop = { list: [], items: [] };
    }
  }
  $('lapLbl').textContent = S.GMODE === 'shop' ? '🧾 목록' : '🏁 랩';
  $('shopHud').classList.toggle('hidden', S.GMODE !== 'shop');
  S.shopHudSig = '';
  $('finish').classList.add('hidden');
  $('title').classList.add('hidden');
  camPos.set(0, 0, 0);
  camLook.set(S.player.x, 1.2 + hAt(S.player.x, S.player.z), S.player.z);
  S.state = 'countdown';
  S.cd = 3.99 + INTRO;
  introSkip = false;
  S.cut = null;
  paT = 14;
  paLeader = null;
  paFinal = false;
  FX.hidePodium();
  $('finish').classList.remove('pod');
  showIntro(true);
  initAudio();
}
// ---------- start-line intro sweep (part of the synced countdown; skip = camera only in multiplayer) ----------
const INTRO = new URLSearchParams(location.search).has('nointro') ? 0 : INTRO_S;
let introSkip = false;
const introOn = () => S.state === 'countdown' && S.cd > 3.99 && !introSkip;
function showIntro(on) {
  const el = $('intro');
  if (!on) {
    el.classList.remove('show');
    return;
  }
  if (!INTRO) return;
  el.innerHTML = `<div class="it">${TR.MAP.icon} ${TR.MAP.name}</div><div class="id">${TR.MAP.desc}</div><div class="sk">${IS_TOUCH ? '탭' : '아무 키나 누르면'} 건너뛰기 ▶</div>`;
  el.classList.add('show');
}
function skipIntro() {
  if (!introOn()) return;
  if (S.MODE === 'solo') S.cd = 3.99;
  else {
    introSkip = true;
    flash('곧 출발합니다… 준비!');
  }
  showIntro(false);
  camPos.set(0, 0, 0);
}
addEventListener('keydown', e => {
  if (introOn() && !e.repeat) skipIntro();
});
addEventListener('pointerdown', e => {
  if (introOn() && !e.target.closest?.('#mute,#auto')) skipIntro();
});
// ---------- finish cutscene: slow-mo (solo), orbit camera around the winner, confetti ----------

function startCut(target) {
  if (S.cut) return;
  S.cut = { t: 0, target, dur: 4.6 };
  FX.confettiFloor(hAt(target.x, target.z));
  FX.confetti(scene, target.x, hAt(target.x, target.z) + 4, target.z, 180, 6);
  $('cutbar').classList.add('show');
  sound.fanfare();
}
function endCut() {
  if (!S.cut) return;
  S.cut = null;
  $('cutbar').classList.remove('show');
  camPos.set(0, 0, 0);
  if (S.cutDone) {
    const f = S.cutDone;
    S.cutDone = null;
    f();
  }
}

addEventListener('keydown', e => {
  if (S.cut && S.cut.t > 0.6 && !e.repeat && e.code !== 'ArrowUp') endCut();
});
addEventListener('pointerdown', e => {
  if (S.cut && S.cut.t > 0.6 && !e.target.closest?.('#mute,#auto,#finish')) endCut();
});

const SOLO_SLOTS = () => {
  const others = ROSTER.filter(r => r.id !== S.MYCHAR).sort(() => Math.random() - 0.5);
  return carts.map((c, i) =>
    i
      ? { type: 'bot', name: others[i - 1].name, char: others[i - 1].id, parts: randomLoadout() }
      : { type: 'human', name: '나', char: S.MYCHAR, parts: loadout() },
  );
};
Object.assign(ctx, { SOLO_SLOTS });
// ---------- spectator (shopping mode: after you check out, watch the others; solo can fast-forward) ----------

const specList = () => carts.filter(c => !c.inactive && !c.finished && c !== S.player).sort((a, b) => b.prog - a.prog);
Object.assign(ctx, { specList });
function specCart() {
  if (!S.spec) return S.player;
  const L = specList();
  return L.length ? L[S.spec.i % L.length] : S.player;
}
function startSpectate() {
  S.spec = { i: 0, ff: false, t0: S.raceT };
  flash('🧾 계산 완료! 다른 손님을 기다리는 중…');
  S.msgT = 3;
  $('spec').classList.remove('hidden');
  $('specFF').classList.toggle('hidden', S.MODE !== 'solo');
  camPos.set(0, 0, 0);
  specUi();
}
function endSpectate() {
  if (!S.spec) return;
  S.spec = null;
  $('spec').classList.add('hidden');
  camPos.set(0, 0, 0);
}

hudMod.init2();

netMod.init();

// ---------- loop ----------
const camPos = new THREE.Vector3(),
  camLook = new THREE.Vector3();
Object.assign(ctx, { camPos });
let camY = 0;
S.last = performance.now();
let acc = 0;
let lowPhys = QUALITY === 'low',
  fpsN = 0,
  fpsT = performance.now(),
  fps = 60;
function adapt(now) {
  fpsN++;
  if (now - fpsT < 2000) return;
  fps = (fpsN * 1000) / (now - fpsT);
  fpsN = 0;
  fpsT = now;
  if (QUALITY !== 'auto') return;
  if (fps < 40 && pr > 0.6) {
    pr = Math.max(0.6, pr - 0.15);
    renderer.setPixelRatio(pr);
  } else if (fps > 56 && pr < PR_MAX) {
    pr = Math.min(PR_MAX, pr + 0.1);
    renderer.setPixelRatio(pr);
  }
  lowPhys = fps < 30;
}

function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.05, (now - S.last) / 1000);
  S.last = now;
  if (S.cut) {
    S.cut.t += dt;
    if (S.cut.t > S.cut.dur) endCut();
  }
  const ts = S.cut && S.MODE === 'solo' ? (S.cut.t < 2.6 ? 0.3 : 0.7) : 1;
  if (S.spec && S.spec.ff && S.MODE === 'solo' && S.state === 'race') {
    for (let k = 0; k < 12 && S.state === 'race'; k++) step(1 / 30);
  } else if (S.paused && S.MODE === 'solo') {
    /* help panel open: solo game paused */
  } else if (!FX.podiumActive()) step(dt * ts);
  else if (S.MODE === 'host') step(dt);
  render(dt);
  adapt(now);
  tickCharPrev(dt);
  tickGarage(dt);
}
// a hidden host tab gets no rAF; keep the room simulated & snapshots flowing (browsers throttle this to ~1Hz)
setInterval(() => {
  if (document.hidden && S.MODE === 'host') {
    const now = performance.now(),
      dt = Math.min(0.1, (now - S.last) / 1000);
    S.last = now;
    step(dt);
  }
}, 100);
function step(dt) {
  if (S.state === 'title' || S.state === 'lobby') {
    $('countdown').textContent = '';
  } else if (S.state === 'countdown') {
    const before = Math.ceil(S.cd);
    S.cd -= dt;
    const n = Math.ceil(S.cd);
    if (n !== before && n > 0 && n <= 3) sound.beep();
    if (S.cd <= 3.99) showIntro(false);
    $('countdown').textContent = S.cd > 3.99 ? '' : S.cd > 0 ? n : '출발!';
    $('countdown').className = S.cd <= 3.99 && S.cd > 0 ? 'n' + n : S.cd <= 0 ? 'go' : '';
    if (S.cd <= 0) {
      S.state = 'race';
      sound.go();
      carts.forEach((c, i) => {
        if (!c.inactive && (c === S.player || (S.MODE !== 'guest' && Math.random() < 0.6)))
          setTimeout(
            () => {
              if (S.state === 'race') say(c, cline(c, 'start', ['출발!']), 1.6);
            },
            400 + i * 450,
          );
      });
      setTimeout(() => {
        if (S.state === 'race')
          paSay(
            S.GMODE === 'shop'
              ? '딩동~ 장보기 대회 시작! 목록의 물건을 담아 계산대로 와 주세요~'
              : pick(['고객 여러분, 카트 레이스가 시작됩니다! 안전 운전 부탁드립니다~', '딩동~ 지금부터 마트 카트 레이스를 시작합니다!']),
          );
      }, 1200);
      setTimeout(() => {
        if ($('countdown').textContent === '출발!') $('countdown').textContent = '';
      }, 800);
    }
  } else if (S.state === 'race' || S.state === 'finished') S.raceT += S.state === 'race' ? dt : 0;
  if (S.state === 'finished')
    for (const c of carts)
      if (!c.finished) {
        c.prog = c.lap * S.N + c.idx;
      }
  for (const c of carts) updateCart(c, dt);
  interactions(dt);
  if (SHOPON() && S.MODE !== 'guest') S.shop.update(dt, S.state, S.raceT, S.MODE);
  if (SHOPON() && S.TLIM && S.state === 'race' && S.raceT >= T_LIMIT && S.MODE === 'solo') {
    flash('⏰ 영업 종료! 시간 초과');
    endRace();
  }
  if (
    SHOPON() &&
    S.MODE === 'solo' &&
    S.state === 'race' &&
    S.player.finished &&
    (carts.every(c => c.inactive || c.finished) || (!S.TLIM && S.raceT - S.player.time > 150))
  )
    endRace();
  S.fun.update(dt, S.state, S.raceT, S.MODE === 'guest');
  updateMapFx(dt);
  trk.tick(dt);
  if (S.MODE === 'guest') guestCustomers(dt);
  else updateCustomers(dt);
  for (const cu of customers) cu.dtLast = dt;
  customerFx(dt);
  if (checkout) checkout.update(dt, carts);
  paTick(dt);
  for (const c of carts) {
    c.body.position.set(c.x, 0.7 + hAt(c.x, c.z), c.z);
    c.body.quaternion.setFromEuler(0, c.h, 0);
    c.body.velocity.set(Math.sin(c.vd) * c.v, 0, Math.cos(c.vd) * c.v);
  }
  const PH = lowPhys ? 1 / 30 : 1 / 60;
  acc += dt;
  let n = 0;
  while (acc >= PH && n < 3) {
    world.step(PH);
    acc -= PH;
    n++;
  }
  if (n === 3) acc = 0;
  for (const c of carts) {
    c.body.position.set(c.x, 0.7 + hAt(c.x, c.z), c.z);
  }
  for (const cu of customers)
    if (cu.body) {
      const bp = cu.body.position,
        o = { x: bp.x, z: bp.z };
      if (pushOut(o, 0.45)) {
        bp.x = o.x;
        bp.z = o.z;
        cu.body.velocity.x *= -0.3;
        cu.body.velocity.z *= -0.3;
      }
    }
  mpTick(dt);
  S.msgT -= dt;
  if (S.msgT <= 0) $('msg').textContent = '';
}
function render(dt) {
  for (const c of carts) {
    if (c.inactive) continue;
    {
      const fx = Math.sin(c.h),
        fz = Math.cos(c.h);
      c.g.root.position.set(c.x, hAt(c.x, c.z), c.z);
      c.g.root.rotation.x = -Math.atan((hAt(c.x + fx, c.z + fz) - hAt(c.x - fx, c.z - fz)) / 2);
    }
    c.drift = (c.drift || 0) + ((c.steerIn || 0) * Math.min(1, Math.abs(c.v) / 18) * 0.28 - (c.drift || 0)) * Math.min(1, dt * 5);
    c.g.root.rotation.y = c.h + (c.drifting ? 0 : c.drift * 0.5);
    c.angryT = (c.angryT || 0) - dt;
    if ((c.hitSeq || 0) !== (c._hs || 0)) {
      c._hs = c.hitSeq || 0;
      c.angryT = 1.6;
    }
    if ((c.lastHit || 0) > 0.3) c.angryT = Math.max(c.angryT, 1.2);
    c.g.pose = c.finished || (S.cut && S.cut.target === c) ? 'win' : null;
    c.g.face(
      c.finished
        ? 'win'
        : c.spin > 0
          ? 'dizzy'
          : c.angryT > 0
            ? 'angry'
            : c.drifting
              ? 'focus'
              : c.boostT > 0 || c.instT > 0
                ? 'happy'
                : Math.abs(c.slip || 0) > 0.5
                  ? 'shock'
                  : 'normal',
    );
    {
      const b = (c.boostT > 0 || c.instT > 0) && !c.finished ? 1 : 0;
      c.g.boostK += (b - c.g.boostK) * Math.min(1, dt * 8);
      const tc = c.g.trail;
      if (tc && (c.drifting || b) && Math.abs(c.v) > 6) {
        c.trT = (c.trT || 0) - dt;
        if (c.trT <= 0) {
          c.trT = LOWFX ? 0.12 : 0.05;
          puff(c.x - Math.sin(c.h) * 1.1, 0.3 + hAt(c.x, c.z), c.z - Math.cos(c.h) * 1.1, pick(tc), 1);
        }
      }
    }
    c.g.update(c.v, dt);
    if (Math.abs(c.slip || 0) > 0.12 && Math.abs(c.v) > 5) {
      c.skT = (c.skT || 0) - dt;
      if (c.skT <= 0) {
        c.skT = 0.04;
        S.fun.skid(c);
        if (c.drifting && Math.random() < 0.5)
          puff(c.x - Math.sin(c.h) * 0.6, 0.2, c.z - Math.cos(c.h) * 0.6, Math.random() < 0.5 ? 0xffb300 : 0xdddddd, 1);
      }
    }
  }
  updatePuffs(dt);
  updateBubbles();
  drawMinimap();
  for (const p of products) {
    p.mesh.position.copy(p.body.position);
    p.mesh.quaternion.copy(p.body.quaternion);
  }
  const p = specCart(),
    chd = p.vd + ang(p.h - p.vd) * 0.4,
    fx = Math.sin(chd),
    fz = Math.cos(chd);
  const py = hAt(p.x, p.z);
  camY += (py - camY) * Math.min(1, dt * 6);
  const want = new THREE.Vector3(p.x - fx * 8, 4.2 + camY, p.z - fz * 8);
  if (!(TR.MAP.camOpen || []).some(r => inRect(r, want.x, want.z) || inRect(r, p.x, p.z))) {
    const ci = nearestIdx(want.x, want.z, 0, S.N),
      cp = path[ci],
      dx = want.x - cp.x,
      dz = want.z - cp.y,
      d = Math.hypot(dx, dz),
      lim = TR.HW - 0.7; // keep camera inside the aisle
    if (d > lim) {
      want.x = cp.x + (dx / d) * lim;
      want.z = cp.y + (dz / d) * lim;
    }
  }
  for (let k = 0; k < 10; k++) {
    // keep camera out of shelves
    const inside = strips.some(
      st => !st.off && st.kind !== 'door' && want.x > st.x0 - 0.4 && want.x < st.x1 + 0.4 && want.z > st.z0 - 0.4 && want.z < st.z1 + 0.4,
    );
    if (!inside) break;
    want.x += (p.x - want.x) * 0.2;
    want.z += (p.z - want.z) * 0.2;
  }
  camPos.lerp(want, 1 - Math.exp(-dt * 5));
  if (camPos.lengthSq() === 0) camPos.copy(want);
  camLook.lerp(new THREE.Vector3(p.x + fx * 4, 1.2 + py, p.z + fz * 4), 1 - Math.exp(-dt * 8));
  camera.position.copy(camPos);
  camera.lookAt(camLook);
  if (introOn() && INTRO) {
    const u = Math.min(1, 1 - (S.cd - 3.99) / INTRO),
      B = TR.MAP.bounds,
      cx = (B.x0 + B.x1) / 2,
      cz = (B.z0 + B.z1) / 2,
      Rr = Math.max(B.x1 - B.x0, B.z1 - B.z0) * 0.62;
    const a = -Math.PI * 0.5 + u * Math.PI * 1.1,
      o = new THREE.Vector3(cx + Math.cos(a) * Rr, 34 - u * 14, cz + Math.sin(a) * Rr),
      look = new THREE.Vector3(cx, 0, cz);
    const b = u < 0.72 ? 0 : (u - 0.72) / 0.28,
      e = b * b * (3 - 2 * b);
    camera.position.lerpVectors(o, want, e);
    camera.lookAt(look.lerp(camLook, e));
    camPos.copy(want);
  }
  if (S.cut) {
    const T = S.cut.target,
      ty = hAt(T.x, T.z),
      a = S.cut.t * 0.9 + T.h + Math.PI * 0.6,
      r = 5.5 - Math.min(1.5, S.cut.t * 0.4);
    camera.position.set(T.x + Math.sin(a) * r, ty + 2.2 + Math.sin(S.cut.t * 0.8) * 0.5, T.z + Math.cos(a) * r);
    camera.lookAt(T.x, ty + 1.1, T.z);
    if (Math.random() < dt * 2.5) FX.confetti(scene, T.x, ty + 5, T.z, 40, 7);
  }
  if (S.shake > 0 && !motionOK()) S.shake = 0;
  if (S.shake > 0) {
    S.shake = Math.max(0, S.shake - dt * 2);
    camera.position.x += (Math.random() - 0.5) * S.shake;
    camera.position.y += (Math.random() - 0.5) * S.shake * 0.6;
  }
  camera.fov =
    (innerWidth < innerHeight ? 80 : 65) + Math.max(0, p.v - 18) * 0.8 + ((p.boostT > 0 || p.instT > 0) && S.state === 'race' ? 6 : 0);
  camera.updateProjectionMatrix();
  FX.setSpeedLines(S.state === 'race' && !S.cut && (p.boostT > 0 || p.instT > 0) ? Math.min(1, 0.55 + Math.abs(p.v) / 40) : 0);
  FX.updateComic(dt);
  FX.updateConfetti(dt);
  updateHud(dt);
  specUi();
  document.body.classList.toggle('podium', FX.podiumActive());
  FX.setPodiumShift($('finish').classList.contains('shop') ? 0.2 : 0);
  if (LOWFX)
    for (const cu of customers) {
      const d = camera.position.distanceTo(cu.holder.position);
      cu.g.lod(d > 38 ? 2 : d > 13 ? 1 : 0);
    } // distance LOD (low quality)
  if (FX.podiumActive()) FX.renderPodium(renderer, dt);
  else renderer.render(scene, camera);
}

function chooseChar(id) {
  if (!id) return;
  S.MYCHAR = charOf(id).id;
  LS.set('cartChar', S.MYCHAR);
  if (S.state === 'title' || S.state === 'lobby') setCartChar(S.player, S.MYCHAR);
  updCharBtns();
  setMyChar(S.MYCHAR);
}
$('charBtn').onclick = () => openCharSel(chooseChar);
$('lobbyChar').onclick = () => openCharSel(chooseChar);
/** 🔧 차고 button labels show the coin balance. */
function updGarBtn() {
  const t = `🔧 차고 · 🪙 <b>${coins().toLocaleString('ko-KR')}</b>`;
  $('garBtn').innerHTML = t;
  $('lobbyGar').innerHTML = t;
}
Object.assign(ctx, { updGarBtn });
function openGar() {
  openGarage(S.MYCHAR, lo => {
    if (S.state === 'title' || S.state === 'lobby') setCartParts(S.player, lo, S.MODE === 'solo' || S.PSTATS);
    setMyParts(lo);
    updGarBtn();
  });
}
$('garBtn').onclick = openGar;
$('lobbyGar').onclick = openGar;
updGarBtn();
updCharBtns();
const boot = () => {
  loadMap(new URLSearchParams(location.search).get('map') || LS.get('cartMap') || 'mart');
  camLook.set(S.player.x + 4, 1.2, S.player.z);
  requestAnimationFrame(frame);
};
Promise.race([document.fonts ? document.fonts.load('64px Jua') : Promise.resolve(), new Promise(r => setTimeout(r, 1500))])
  .catch(() => {})
  .then(boot);
if (DEBUG)
  window.__game = {
    analog,
    grantCoins: n => (addCoins(n), updGarBtn(), coins()),
    garagePreview,
    get coins() {
      return coins();
    },
    setParts: (i, lo, st = true) => setCartParts(carts[i], lo, st),
    /** model fingerprint of cart i: mesh count, bbox size, material types, parts loadout, stat mods */
    cartInfo(i = 0) {
      const c = carts[i],
        r = c.g.root;
      let meshes = 0,
        verts = 0;
      const mats = new Set();
      r.updateMatrixWorld(true);
      const box = new THREE.Box3();
      r.traverse(o => {
        if ((o.isMesh || o.isLineSegments) && o.visible && o.parent.visible && o !== c.tag) {
          meshes++;
          verts += o.geometry.attributes.position.count;
          mats.add(o.material.type + (o.material.color ? ':' + o.material.color.getHexString() : ''));
          box.expandByObject(o);
        }
      });
      const sz = box.getSize(new THREE.Vector3());
      return { meshes, verts, mats: [...mats].sort(), size: [sz.x, sz.y, sz.z].map(v => +v.toFixed(2)), lo: c.lo, pm: c.pm, char: c.char };
    },
    itemOdds,
    get diff() {
      return DIFF;
    },
    get paused() {
      return S.paused;
    },
    podiumTest(ids) {
      FX.hidePodium?.();
      $('finish').classList.add('pod');
      $('finish').classList.remove('hidden');
      FX.showPodium(
        ids.map(id => ({ name: charOf(id).name, char: id, color: charOf(id).color })),
        textSprite,
      );
    },
    get perf() {
      return {
        fps: Math.round(fps),
        pr,
        calls: renderer.info.render.calls,
        tris: renderer.info.render.triangles,
        geos: renderer.info.memory.geometries,
        tex: renderer.info.memory.textures,
        quality: QUALITY,
      };
    },
    debugNearFinish() {
      const p = S.player,
        q = path[S.N - 4],
        [tx, tz] = tangentAt(S.N - 4);
      p.x = q.x;
      p.z = q.y;
      p.idx = S.N - 4;
      p.lap = LAPS - 1;
      p.h = p.vd = Math.atan2(tx, tz);
      p.v = 10;
    },
    loadMap,
    get MAP() {
      return TR.MAP_ID;
    },
    get N() {
      return S.N;
    },
    path,
    strips,
    traffic,
    get trk() {
      return trk;
    },
    hAt,
    getBest,
    get MODE() {
      return S.MODE;
    },
    NET,
    get player() {
      return S.player;
    },
    get raceT() {
      return S.raceT;
    },
    knock: (i, c) => knockCustomer(customers[i], c || S.player),
    startGame,
    hopOut,
    get fun() {
      return S.fun;
    },
    insideShelf,
    get autoAccel() {
      return S.autoAccel;
    },
    carts,
    customers,
    products,
    stats,
    keys,
    get state() {
      return S.state;
    },
    get cut() {
      return S.cut;
    },
    get cd() {
      return S.cd;
    },
    skipIntro,
    get podium() {
      return FX.podiumActive();
    },
    get checkout() {
      return checkout;
    },
    get shop() {
      return S.shop;
    },
    get spec() {
      return S.spec;
    },
    specFF(on = true) {
      if (S.spec) {
        S.spec.ff = on;
        S.specSig = '';
      }
    },
    ROSTER,
    chooseChar,
    paHide: FX.paHide,
    pa: t => paSay(t),
    announce: t => announce(t),
    flash: t => flash(t),
    openCharSel: () => openCharSel(chooseChar),
    setLineup,
    get MYCHAR() {
      return S.MYCHAR;
    },
    get GMODE() {
      return S.GMODE;
    },
    setMode(m, t) {
      S.GMODE = m;
      if (t != null) S.TLIM = t;
      if (S.shop) S.shop.setActive(S.GMODE === 'shop');
      renderModes();
    },
    simulate(sec) {
      const h = 1 / 30;
      for (let t = 0; t < sec; t += h) {
        step(h);
        if (SHOPON()) S.shop.render(h, S.player);
      }
    },
  };
// offline support / instant updates (see tools/stamp.py, sw.js)
if ('serviceWorker' in navigator && location.protocol === 'https:' && (!DEBUG || new URLSearchParams(location.search).has('sw')))
  addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
