import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { HX, HZ, HW, LAPS, buildPath, shelfStrips, buildWorld, textSprite } from './track.js';
import { createFun, ITEMS } from './fun.js';
import { makeCart, makePerson } from './models.js';
import { initAudio, sound, setEngine, setDrift, setMuted, isMuted, onMuteChange } from './audio.js';

const $ = id => document.getElementById(id);
const renderer = new THREE.WebGLRenderer({ antialias: true });
const MOBILE = matchMedia('(pointer: coarse)').matches || Math.min(innerWidth, innerHeight) < 600;
renderer.setPixelRatio(Math.min(devicePixelRatio, MOBILE ? 1 : 1.5)); renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0xbfd4e6); scene.fog = new THREE.Fog(0xbfd4e6, 40, 110);
const camera = new THREE.PerspectiveCamera(innerWidth < innerHeight ? 80 : 65, innerWidth / innerHeight, 0.1, 300);
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
const hemi = new THREE.HemisphereLight(0xfffaf0, 0x8a8070, 1.25); scene.add(hemi);
const dl2 = new THREE.DirectionalLight(0xdfefff, 0.5); dl2.position.set(-30, 30, -20); scene.add(dl2);
const dl = new THREE.DirectionalLight(0xffffff, 1.2); dl.position.set(20, 40, 10); scene.add(dl);

const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -20, 0) });
world.allowSleep = true; world.broadphase = new CANNON.SAPBroadphase(world);
world.defaultContactMaterial.friction = 0.4; world.defaultContactMaterial.restitution = 0.2;

const path = buildPath(), N = path.length;
const strips = shelfStrips();
const shelf = buildWorld(scene, world, strips);
const _m4 = new THREE.Matrix4().makeScale(0, 0, 0);
function removeShelfItems(x, z, n) { // hide products near impact
  let removed = 0; for (let i = 0; i < shelf.items.length && removed < n; i++) { if (shelf.hidden[i]) continue; const it = shelf.items[i]; if (Math.abs(it[0] - x) < 1.6 && Math.abs(it[2] - z) < 1.6) { shelf.hidden[i] = 1; const im = shelf.meshes[it[3]]; im.setMatrixAt(it[4], _m4); im.instanceMatrix.needsUpdate = true; removed++; } }
  return removed; }

// ---------- input ----------
const keys = {};
const pressEdge = k => { if (k === 'Space') player.useN2O = true; if (k === 'KeyE' || k === 'ControlLeft' || k === 'ControlRight' || k === 'Item') player.useItem = true; };
addEventListener('keydown', e => { if (!e.repeat) pressEdge(e.code); keys[e.code] = true; if (e.code === 'KeyR') location.reload(); if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault(); });
addEventListener('keyup', e => { keys[e.code] = false; });
$('restart').onclick = () => location.reload();
function startGame() { initAudio(); $('title').classList.add('hidden'); if (state === 'title') { state = 'countdown'; cd = 3.99; } }
$('startBtn').addEventListener('click', startGame);
addEventListener('keydown', e => { if (state === 'title' && (e.code === 'Enter' || e.code === 'Space')) startGame(); });
const unlock = () => initAudio();
['pointerdown', 'keydown', 'touchstart'].forEach(ev => addEventListener(ev, unlock, { passive: true }));
const muteBtn = $('mute'); const showMute = m => muteBtn.textContent = m ? '🔇' : '🔊'; showMute(isMuted()); onMuteChange(showMute);
muteBtn.addEventListener('pointerdown', e => { e.stopPropagation(); initAudio(); setMuted(!isMuted()); });
addEventListener('keydown', e => { if (e.code === 'KeyM' && !e.repeat) setMuted(!isMuted()); });
const IS_TOUCH = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
if (IS_TOUCH) document.body.classList.add('touch');
document.querySelectorAll('#touch [data-key]').forEach(b => {
  const k = b.dataset.key, on = e => { e.preventDefault(); pressEdge(k); keys[k] = true; b.classList.add('on'); }, off = e => { e.preventDefault(); keys[k] = false; b.classList.remove('on'); };
  b.addEventListener('pointerdown', e => { b.setPointerCapture?.(e.pointerId); on(e); });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(ev => b.addEventListener(ev, off));
});
['touchmove', 'gesturestart', 'dblclick'].forEach(ev => document.addEventListener(ev, e => { if (!e.target.closest?.('button')) e.preventDefault(); }, { passive: false }));

// ---------- stats ----------
const stats = { knocked: 0, spilled: 0 };
let msgT = 0; function flash(t) { $('msg').textContent = t; msgT = 1.5; }

// ---------- carts ----------
const CART_R = 1.3;
const carts = [];
function addCart(color, name, lane, row, ai, pal) {
  const g = makeCart(color, pal); scene.add(g.root);
  const body = new CANNON.Body({ mass: 0, type: CANNON.Body.KINEMATIC, shape: new CANNON.Box(new CANNON.Vec3(0.7, 0.7, 1.6)) });
  world.addBody(body);
  const c = { g, body, name, ai, color, x: -4 - row * 5, z: -HZ + lane, h: Math.PI / 2, v: 0, idx: 0, lap: 0, finished: false, time: 0,
    maxV: ai ? 17 + Math.random() * 2.5 : 20, offset: lane * 0.6, vd: Math.PI / 2, n2o: 0, gauge: 0, combo: 0, item: null, stuck: 0, prog: 0 };
  c.idx = nearestIdx(c.x, c.z, 0, N); c.lap = c.idx > N / 2 ? -1 : 0; carts.push(c); return c;
}
function nearestIdx(x, z, from, span) {
  let bi = from, bd = 1e9;
  for (let k = 0; k < span; k++) { const i = (from + k + N) % N; const d = (path[i].x - x) ** 2 + (path[i].y - z) ** 2; if (d < bd) { bd = d; bi = i; } }
  return bi;
}
const player = addCart(0xff4f8b, '나', -2.5, 0, false, { shirt: 0xffd54f, hat: 0xff4f8b, hair: 0x6d3b1f, pants: 0x4fc3f7 });
addCart(0x43d17a, '초록 카트', 2.5, 0, true, { shirt: 0xb2ff59, hat: 0x2ecc71, hair: 0x3b2b20, pants: 0x8d6e63 });
addCart(0xffc107, '노랑 카트', -2.5, 1, true, { shirt: 0xff8a65, hat: 0xffc107, hair: 0xf4d03f, pants: 0x7e57c2 });
addCart(0x9c5cff, '보라 카트', 2.5, 1, true, { shirt: 0x80deea, hat: 0x9c5cff, hair: 0x222244, pants: 0xf06292 });

// ---------- products (physics pool) ----------
const MAXP = 110, products = [];
const boxG = new THREE.BoxGeometry(0.4, 0.55, 0.4), canG = new THREE.CylinderGeometry(0.17, 0.17, 0.4, 10);
const pCols = [0xe53935, 0x43a047, 0x1e88e5, 0xfdd835, 0xfb8c00, 0x8e24aa, 0x00acc1];
const pMats = pCols.map(c => new THREE.MeshLambertMaterial({ color: c }));
const PKINDS = [ // spillable product kinds
  { g: boxG, s: () => new CANNON.Box(new CANNON.Vec3(0.2, 0.275, 0.2)), mass: 0.4 },
  { g: canG, s: () => new CANNON.Cylinder(0.17, 0.17, 0.4, 8), mass: 0.4 },
  { g: new THREE.CylinderGeometry(0.09, 0.11, 0.55, 8), s: () => new CANNON.Cylinder(0.09, 0.11, 0.55, 8), mass: 0.5 },
  { g: new THREE.SphereGeometry(0.33, 12, 9), m: new THREE.MeshLambertMaterial({ color: 0x2e7d32 }), s: () => new CANNON.Sphere(0.33), mass: 3, ld: 0.05 },
  { g: new THREE.CylinderGeometry(0.16, 0.16, 0.28, 10), m: new THREE.MeshLambertMaterial({ color: 0xffffff }), s: () => new CANNON.Cylinder(0.16, 0.16, 0.28, 8), mass: 0.15 },
  { g: new THREE.BoxGeometry(0.5, 0.16, 0.3), m: new THREE.MeshLambertMaterial({ color: 0xd7ccc8 }), s: () => new CANNON.Box(new CANNON.Vec3(0.25, 0.08, 0.15)), mass: 0.3 },
  { g: new THREE.BoxGeometry(0.38, 0.6, 0.16), s: () => new CANNON.Box(new CANNON.Vec3(0.19, 0.3, 0.08)), mass: 0.3 },
];
function spawnProduct(x, y, z, vx, vy, vz) {
  let p;
  if (products.length >= MAXP) { p = products.shift(); }
  else {
    const K = PKINDS[(Math.random() * PKINDS.length) | 0];
    const mesh = new THREE.Mesh(K.g, K.m || pMats[(Math.random() * pMats.length) | 0]); scene.add(mesh);
    const body = new CANNON.Body({ mass: K.mass, shape: K.s(), linearDamping: K.ld ?? 0.3, angularDamping: K.ld ?? 0.3, sleepSpeedLimit: 0.3 });
    world.addBody(body); p = { mesh, body };
  }
  p.body.position.set(x, y, z); p.body.velocity.set(vx, vy, vz);
  p.body.angularVelocity.set(Math.random() * 10 - 5, Math.random() * 10 - 5, Math.random() * 10 - 5); p.body.wakeUp();
  products.push(p);
}

// ---------- customers ----------
const shirt = [0xef5350, 0x42a5f5, 0x66bb6a, 0xffa726, 0xab47bc, 0x26c6da, 0x8d6e63, 0xec407a];
const customers = [];
const custShape = new CANNON.Box(new CANNON.Vec3(0.3, 0.85, 0.2));
function pickTarget(cu) { // walk along the aisle (path index), never across the inner shelf block
  if (cu.pi === undefined) { cu.pi = nearestIdx(cu.x, cu.z, 0, N); cu.dir = Math.random() < 0.5 ? 1 : -1; cu.lane = (Math.random() * 2 - 1) * (HW - 1.5); }
  if (Math.random() < 0.15) cu.dir = -cu.dir; if (Math.random() < 0.3) cu.lane = (Math.random() * 2 - 1) * (HW - 1.5);
  cu.pi = (cu.pi + cu.dir * 2 + N) % N; const p = path[cu.pi], q = path[(cu.pi + 1) % N];
  const tx = q.x - p.x, tz = q.y - p.y, l = Math.hypot(tx, tz) || 1;
  cu.tx = p.x - tz / l * cu.lane; cu.tz = p.y + tx / l * cu.lane;
  if (Math.random() < 0.12) cu.pause = 1 + Math.random() * 3;
}
function pushOut(o, r) { // keep a point out of shelf bounds; returns true if it was inside
  let hit = false;
  for (const s of strips) {
    if (o.x > s.x0 && o.x < s.x1 && o.z > s.z0 && o.z < s.z1) { // center inside: exit through nearest face
      const pen = [[o.x - s.x0, -1, 0], [s.x1 - o.x, 1, 0], [o.z - s.z0, 0, -1], [s.z1 - o.z, 0, 1]].sort((a, b) => a[0] - b[0])[0];
      o.x += pen[1] * (pen[0] + r); o.z += pen[2] * (pen[0] + r); hit = true; }
    const px = Math.max(s.x0, Math.min(o.x, s.x1)), pz = Math.max(s.z0, Math.min(o.z, s.z1)); const dx = o.x - px, dz = o.z - pz, d = Math.hypot(dx, dz);
    if (d < r) { hit = true; const nx = d > 1e-4 ? dx / d : s.nx, nz = d > 1e-4 ? dz / d : s.nz; o.x = px + nx * r; o.z = pz + nz * r; } }
  return hit;
}
function retarget(cu) { delete cu.pi; pickTarget(cu); }
const insideShelf = (x, z) => strips.some(s => x > s.x0 && x < s.x1 && z > s.z0 && z < s.z1);
for (let k = 0; k < 16; k++) {
  const g = makePerson(shirt[k % shirt.length], Math.random() < 0.5 ? 0x3949ab : 0x5d4037);
  const holder = new THREE.Group(); g.root.position.y = -0.85; holder.add(g.root); scene.add(holder);
  const cu = { g, holder, state: 'walk', t: 0, x: 0, z: 0, tx: 0, tz: 0, sp: 1 + Math.random() * 0.8, body: null };
  let i = (Math.random() * N) | 0; if (i < 12 || i > N - 4) i = (i + 20) % N; // keep start area clear
  cu.x = path[i].x + (Math.random() * 2 - 1) * 4; cu.z = path[i].y + (Math.random() * 2 - 1) * 4; pushOut(cu, 0.5); pickTarget(cu);
  customers.push(cu);
}
const SCOOP = +(new URLSearchParams(location.search).get('scoop') ?? 0.3), pick0 = 0;
function scoop(cu, c) {
  c.riders = c.riders || []; cu.state = 'ride'; cu.cart = c; cu.rideT = 0; cu.seat = c.riders.length; c.riders.push(cu); stats.knocked++;
  cu.holder.scale.setScalar(0.72); cu.g.walk(0);
  say(cu, pick(['어? 여기 어디야?!', '태워줘서 고마워요?!', '으아 빨라!', '내 장 보는 중인데!']), 2.2, true);
  if (c === player) { flash(`손님이 카트에 탔다! 🛒 (${c.riders.length}/3)`); sound.oof(); } puff(cu.x, 1.2, cu.z, 0xffc1e3, 6);
}
function hopOut(c, why) {
  if (!c.riders) return;
  for (const cu of c.riders) { cu.state = 'walk'; cu.cart = null; cu.holder.scale.setScalar(1); cu.holder.rotation.set(0, 0, 0);
    const a = c.h + (cu.seat % 2 ? 1.6 : -1.6); cu.x = c.x + Math.sin(a) * 1.8; cu.z = c.z + Math.cos(a) * 1.8; pushOut(cu, 0.5); retarget(cu); cu.t = 0;
    say(cu, why === 'crash' ? pick(['으악 떨어진다!', '아야야…']) : why === 'drift' ? pick(['어지러워…', '살려줘~!']) : pick(['내려줄게요~', '재밌었어요!', '다음엔 안 타요…']), 1.8, true); }
  c.riders = []; if (c === player && why) flash('손님이 내렸다!');
}
function knockCustomer(cu, c) {
  if (Math.random() < SCOOP && (c.riders || []).length < 3) { scoop(cu, c); return; }
  cu.state = 'down'; cu.t = 0; stats.knocked++; flash('손님을 넘어뜨렸다! 💥'); say(cu, pick(['으악!', '내 장바구니!', '꺄악!', '아야!']), 2, true); puff(cu.x, 1, cu.z, 0xffffff, 8); if (c === player) { shake = 0.6; if (Math.random() < 0.6) say(c, pick(['미안해요~!', '앗 죄송!', '으앗!']), 1.6, true); }
  const body = new CANNON.Body({ mass: 60, shape: custShape, linearDamping: 0.2, angularDamping: 0.4 });
  body.position.set(cu.x, 0.9, cu.z);
  const fx = Math.sin(c.h), fz = Math.cos(c.h), s = Math.abs(c.v);
  body.velocity.set(fx * s * 0.6, 3 + s * 0.15, fz * s * 0.6);
  body.angularVelocity.set(fz * 6, Math.random() * 2 - 1, -fx * 6);
  world.addBody(body); cu.body = body;
}

// ---------- collisions vs shelves ----------
function shelfCollide(c, dt) {
  for (const s of strips) {
    const px = Math.max(s.x0, Math.min(c.x, s.x1)), pz = Math.max(s.z0, Math.min(c.z, s.z1));
    const dx = c.x - px, dz = c.z - pz, d = Math.hypot(dx, dz);
    if (d < CART_R) {
      const nx = d > 1e-4 ? dx / d : s.nx, nz = d > 1e-4 ? dz / d : s.nz;
      c.x = px + nx * CART_R; c.z = pz + nz * CART_R;
      const fx = Math.sin(c.h), fz = Math.cos(c.h); const impact = Math.abs(c.v) * Math.max(0, -(fx * nx + fz * nz) * Math.sign(c.v));
      if (impact > 7 && (c.lastHit || 0) <= 0) {
        const n = Math.min(10, Math.floor(impact / 2.2)); stats.spilled += n; c.lastHit = 0.4; if (!c.ai) { sound.clatter(n); sound.bump(0.8); }
        if (!c.ai) { flash('선반 충돌! 상품이 쏟아졌다 🥫'); shake = Math.min(1, impact / 15); say(c, pick(['으앗!', '내 카트!', '이크!']), 1.4); } else if (Math.random() < 0.5) say(c, pick(['비켜비켜!', '이런!', '으악 선반!']), 1.4);
        if (c.riders && c.riders.length) hopOut(c, 'crash');
        removeShelfItems(px - nx * 0.6, pz - nz * 0.6, n); puff(px + nx * 0.6, 1, pz + nz * 0.6, 0xffe0a0, 6);
        for (let k = 0; k < n; k++) spawnProduct(px + nx * 0.5 + (Math.random() - .5) * 2.5 * (nz ? 1 : 0), 0.8 + Math.random() * 1.8,
          pz + nz * 0.5 + (Math.random() - .5) * 2.5 * (nx ? 1 : 0), nx * (2 + Math.random() * 3) + fx * impact * 0.3, 1 + Math.random() * 2, nz * (2 + Math.random() * 3) + fz * impact * 0.3);
      }
      c.v *= impact > 3 ? 0.55 : 0.97;
      // slide along: steer heading to tangent a bit
      const dot = fx * nx + fz * nz; if (dot * Math.sign(c.v) < 0) { const tx = fx - dot * nx, tz = fz - dot * nz; c.h += (Math.atan2(tx, tz) - c.h + Math.PI * 3) % (Math.PI * 2) - Math.PI > 0 ? dt * 2 : -dt * 2; }
    }
  }
}
function circlePush(c, ox, oz, r, slow) {
  const dx = c.x - ox, dz = c.z - oz, d = Math.hypot(dx, dz);
  if (d < r && d > 1e-4) { c.x = ox + dx / d * r; c.z = oz + dz / d * r; c.v *= slow; return true; } return false;
}

// ---------- race state ----------
let state = 'title', cd = 3.99, raceT = 0; const finishOrder = [];
const ang = a => Math.atan2(Math.sin(a), Math.cos(a));

function updateCart(c, dt) {
  c.lastHit = (c.lastHit || 0) - dt;
  let thr = 0, steer = 0, boosting = false;
  if (state !== 'race' || c.finished) { thr = c.finished ? -0.3 * Math.sign(c.v) : 0; }
  else if (!c.ai) {
    if (autoAccel) thr = 1; if (keys.ArrowUp || keys.KeyW) { thr = 1; c.push = true; } else c.push = false; if (keys.ArrowDown || keys.KeyS) thr = -1;
    if (keys.ArrowLeft || keys.KeyA) steer += 1; if (keys.ArrowRight || keys.KeyD) steer -= 1;
    const down = keys.ArrowDown || keys.KeyS;
    c.wantDrift = !!(keys.ShiftLeft || keys.ShiftRight || keys.Drift || (IS_TOUCH && down && steer !== 0 && c.v > 7));
    if (IS_TOUCH && c.wantDrift && down) thr = 1;
    const up = keys.ArrowUp || keys.KeyW; c.upEdge = up && !c.upPrev; c.upPrev = up;
  } else {
    const tgt = path[(c.idx + 4) % N], nxt = path[(c.idx + 5) % N];
    const tx = nxt.x - tgt.x, tz = nxt.y - tgt.y, l = Math.hypot(tx, tz) || 1;
    let off = c.offset; // steer around obstacles a bit
    const fx = Math.sin(c.h), fz = Math.cos(c.h);
    for (const o of fun.obstacles) { const rx = o.x - c.x, rz = o.z - c.z, ahead = rx * fx + rz * fz; if (ahead > 0 && ahead < 12) { const side = rx * fz - rz * fx, R = o.r + 1.2; if (Math.abs(side) < R) off += (side > 0 ? 1 : -1) * (R - Math.abs(side)) * 1.2; } }
    for (const cu of customers) { const ox = cu.body ? cu.body.position.x : cu.x, oz = cu.body ? cu.body.position.z : cu.z, rx = ox - c.x, rz = oz - c.z, ahead = rx * fx + rz * fz;
      if (ahead > 0 && ahead < 10) { const side = rx * fz - rz * fx; if (Math.abs(side) < 2.2) { off += (side > 0 ? 1 : -1) * (2.5 - Math.abs(side)) * 1.4; if (!cu.body && ahead < 5 && Math.random() < 0.02) say(c, pick(['비켜비켜!', '길 좀 비켜주세요!', '실례합니다~!']), 1.3); } } }
    off = Math.max(-HW + 1.6, Math.min(HW - 1.6, off));
    const gx = tgt.x - tz / l * off, gz = tgt.y + tx / l * off;
    const want = Math.atan2(gx - c.x, gz - c.z), da = ang(want - c.h);
    steer = Math.max(-1, Math.min(1, da * 2.5)); thr = Math.abs(da) > 0.6 && c.v > 10 ? 0.2 : 1;
    if (Math.abs(c.v) < 1.5) c.stuck += dt; else c.stuck = 0;
    if (c.stuck > 1.2) { c.reverse = 0.8; c.stuck = 0; }
    if (c.reverse > 0) { c.reverse -= dt; thr = -1; steer = -steer; }
    c.wantDrift = Math.abs(da) > 0.32 && c.v > 11 && !(c.reverse > 0);
    if (c.n2o > 0 && Math.abs(da) < 0.1 && (c.boostT || 0) <= 0 && Math.random() < 0.02) c.useN2O = true;
  }
  if (!c.ai) { if (boosting && !c.wasBoost) { sound.whoosh(); if (Math.random() < 0.5) say(c, pick(['간다~!', '부스트!', '슝~!']), 1.2); } c.wasBoost = boosting; setEngine(c.v, boosting); setDrift(c.drifting ? Math.abs(c.slip || 0) * 2 : (c.slipT > 0 ? 0.3 : 0)); }
  if (c.useN2O) { c.useN2O = false; if (state === 'race' && !c.finished) {
    if (c.n2o > 0) { c.n2o--; c.boostT = 1.7; c.v += 2; }
    else if (!c.ai) { c.emptyTries = (c.emptyTries || 0) + 1; sound.empty(); flash('N2O 없음! 드리프트로 충전하세요'); const n = $('n2o'); n.classList.remove('empty'); void n.offsetWidth; n.classList.add('empty'); } } }
  if (c.boostT > 0) { c.boostT -= dt; boosting = true; }
  if (c.instT > 0) { c.instT -= dt; boosting = true; }
  if (c.spin > 0) { c.spin -= dt; steer = 0; thr = 0; c.h += dt * 11; c.wantDrift = false; }
  if (c.wantDrift && !c.drifting && Math.abs(c.v) > 8 && steer !== 0) { c.drifting = true; c.driftDir = Math.sign(steer); c.driftT = 0; c.v *= 0.97; }
  if (c.drifting) { c.driftT += dt; if (!c.wantDrift || c.v < 5) { c.drifting = false; c.instWin = 0.5; c.lastDir = c.driftDir; if (c.driftT > 0.5) { c.combo++; c.comboT = 3; } } }
  if (!c.drifting && c.instWin > 0) { c.instWin -= dt; const counter = steer === -c.lastDir, upHit = !c.ai && c.upEdge, aiHit = c.ai && Math.random() < 0.04;
    if ((counter || upHit || aiHit) && c.driftT > 0.3) { c.instWin = 0; c.instT = 0.7; c.v += 3.5; c.instCount = (c.instCount || 0) + 1; if (!c.ai) { flash('⚡ 순간 부스트!'); sound.whoosh(); } } }
  c.comboT = (c.comboT || 0) - dt; if (c.comboT <= 0) c.combo = 0;
  c.steerIn = steer;
  const maxV = c.maxV * (boosting ? 1.45 : 1) * (c.push && autoAccel ? 1.1 : 1) * (c.magnetT > 0 ? 1.15 : 1) * (1 - 0.12 * (c.riders ? c.riders.length : 0));
  if (thr > 0) c.v += (boosting ? 22 : 12) * (1 - 0.12 * (c.riders ? c.riders.length : 0)) * dt * (1 - Math.max(0, c.v) / maxV);
  else if (thr < 0) c.v -= (c.v > 0 ? 30 : 8) * dt;
  c.v -= c.v * 0.6 * dt; if (c.v < -6) c.v = -6;
  if (thr === 0 && Math.abs(c.v) < 0.3) c.v = 0;
  const sf = Math.min(1, Math.abs(c.v) / 5) * Math.sign(c.v || 1);
  if (c.drifting) { c.h += (c.driftDir * 0.8 + steer * 0.6) * 2.5 * dt * sf; c.v -= c.v * 0.18 * dt; }
  else c.h += steer * dt * 2.4 * sf;
  const grip = c.drifting ? 1.6 : c.slipT > 0 ? 0.9 : c.spin > 0 ? 0.5 : 9;
  let slip = ang(c.h - c.vd); c.vd += slip * Math.min(1, grip * dt);
  slip = ang(c.h - c.vd); if (Math.abs(slip) > 1.0) { c.vd = c.h - Math.sign(slip) * 1.0; slip = Math.sign(slip) * 1.0; }
  c.slip = slip; if (c.drifting && Math.abs(slip) > 0.75 && c.riders && c.riders.length && c.driftT > 0.8) hopOut(c, 'drift');
  if (c.drifting && state === 'race') { c.gauge += Math.abs(slip) * Math.abs(c.v) * dt * 0.2; if (c.gauge >= 1) { c.gauge = 0; if (c.n2o < 2) { c.n2o++; if (!c.ai) { flash('🔥 N2O 충전!'); sound.charge(); } } } }
  c.x += Math.sin(c.vd) * c.v * dt; c.z += Math.cos(c.vd) * c.v * dt;
  shelfCollide(c, dt);
  // progress
  const ni = nearestIdx(c.x, c.z, c.idx - 3, 14);
  if (c.idx > N - 8 && ni < 8) { c.lap++; if (c.lap >= LAPS && !c.finished) { c.finished = true; c.time = raceT; finishOrder.push(c); if (!c.ai) { sound.fanfare(); endRace(); } } else if (!c.ai && c.lap < LAPS) { flash(`랩 ${c.lap + 1}/${LAPS}!`); sound.lap(); } }
  else if (c.idx < 8 && ni > N - 8) c.lap--;
  c.idx = ni; c.prog = c.finished ? 1e6 - c.time : c.lap * N + c.idx;
}

function interactions(dt) {
  for (const c of carts) {
    const fx = Math.sin(c.h), fz = Math.cos(c.h);
    for (const o of carts) if (o !== c && circlePush(c, o.x, o.z, CART_R * 1.8, 0.985) && !c.ai && (c.cbump || 0) <= 0) { sound.bump(0.7); c.cbump = 0.5; }
    c.cbump = (c.cbump || 0) - dt;
    for (const cu of customers) {
      if (cu.state === 'walk') {
        const cx = c.x + fx * 1.2, cz = c.z + fz * 1.2;
        if (Math.hypot(cx - cu.x, cz - cu.z) < 1.0 || Math.hypot(c.x - cu.x, c.z - cu.z) < 1.3) {
          if (Math.abs(c.v) > 9) { knockCustomer(cu, c); c.v *= 0.75; if (!c.ai || Math.hypot(c.x - player.x, c.z - player.z) < 25) sound.oof(); }
          else { c.v *= 0.5; cu.x += fx * 0.6; cu.z += fz * 0.6; if (!c.ai && (c.bump || 0) <= 0) { flash('앗, 죄송합니다! 🙇'); sound.bump(0.6); c.bump = 1; } }
        }
        else if (Math.abs(c.v) > 8 && Math.hypot(c.x - cu.x, c.z - cu.z) < 3.2 && Math.random() < 0.05) say(cu, pick(['조심해요!', '어머나!', '천천히 좀!', '위험해요!']), 1.5);
      } else if (cu.body) circlePush(c, cu.body.position.x, cu.body.position.z, 1.7, 0.9); // fallen customers block
    }
    c.bump = (c.bump || 0) - dt;
    for (const p of products) { const b = p.body.position; if (b.y < 0.6 && Math.abs(b.x - c.x) < 1.4 && Math.abs(b.z - c.z) < 1.4) c.v *= 0.993; }
  }
}

function updateCustomers(dt) {
  for (const cu of customers) {
    cu.t += dt;
    if (cu.state === 'walk') {
      const dx = cu.tx - cu.x, dz = cu.tz - cu.z, d = Math.hypot(dx, dz);
      if (cu.rush) { cu.rush.t -= dt; cu.baseSp = cu.baseSp || cu.sp; cu.tx = cu.rush.x; cu.tz = cu.rush.z; cu.pause = 0; cu.sp = Math.hypot(cu.tx - cu.x, cu.tz - cu.z) < 0.6 ? 0.0001 : 3.2; if (cu.rush.t <= 0) { delete cu.rush; cu.sp = cu.baseSp; retarget(cu); } }
      if (cu.pause > 0) { cu.pause -= dt; cu.t = 0; }
      else if (!cu.rush && (d < 0.6 || cu.t > 12)) { pickTarget(cu); cu.t = 0; }
      else { cu.x += dx / d * cu.sp * dt; cu.z += dz / d * cu.sp * dt; cu.holder.rotation.set(0, Math.atan2(dx, dz), 0); }
      if (pushOut(cu, 0.5) && !cu.rush) pickTarget(cu);
      if (Math.random() < dt * 0.05) chatter(cu);
      cu.holder.position.set(cu.x, 0.85, cu.z); cu.g.walk(cu.pause > 0 ? 0 : cu.t * cu.sp * 6);
    } else if (cu.state === 'ride') {
      const c = cu.cart, fx = Math.sin(c.h), fz = Math.cos(c.h), side = (cu.seat - (c.riders.length - 1) / 2) * 0.42;
      cu.holder.position.set(c.x + fx * (0.55 + (cu.seat === 1 ? -0.3 : 0)) + fz * side, 1.15 + Math.abs(Math.sin(cu.t * 9)) * 0.05 * Math.min(1, Math.abs(c.v) / 8), c.z + fz * (0.55 + (cu.seat === 1 ? -0.3 : 0)) - fx * side);
      cu.holder.rotation.set(0, c.h + Math.PI + Math.sin(cu.t * 2 + cu.seat) * 0.3, 0); cu.g.walk(Math.sin(cu.t * 3) * 0.6);
      cu.rideT += dt; if (cu.rideT > 4 && Math.random() < dt * 0.15) say(cu, pick(['언제 내려줘요?', '와 신난다~', '계산대는 저쪽이에요!']), 1.6);
      if (c.riders[0] === cu && cu.rideT > 8.5 + cu.seat) hopOut(c, 'time');
    } else if (cu.state === 'down') {
      { const bp = cu.body.position, o = { x: bp.x, z: bp.z }; if (pushOut(o, 0.45)) { bp.x = o.x; bp.z = o.z; cu.body.velocity.x *= -0.3; cu.body.velocity.z *= -0.3; } }
      cu.holder.position.copy(cu.body.position); cu.holder.quaternion.copy(cu.body.quaternion); cu.g.walk(0);
      if (cu.t > 7) { cu.state = 'rise'; cu.t = 0; cu.q0 = cu.holder.quaternion.clone(); cu.x = cu.body.position.x; cu.z = cu.body.position.z; cu.y0 = cu.body.position.y; world.removeBody(cu.body); cu.body = null; cu.qUp = new THREE.Quaternion(); pushOut(cu, 0.5); say(cu, pick(['아이고 허리야…', '누가 카트를 저렇게 몰아!', '진짜 화나네!', '매니저 불러요!']), 2.5, true); }
    } else if (cu.state === 'rise') {
      const k = Math.min(1, cu.t / 1.2); cu.holder.quaternion.slerpQuaternions(cu.q0, cu.qUp, k); cu.holder.position.set(cu.x, cu.y0 + (0.85 - cu.y0) * k, cu.z);
      if (k >= 1) { cu.state = 'walk'; cu.t = 0; pickTarget(cu); }
    }
  }
}

function endRace() {
  state = 'finished';
  setTimeout(() => {
    const rank = finishOrder.indexOf(player) + 1;
    $('finTitle').textContent = rank === 1 ? '🏆 우승!' : `결승! ${rank}위`;
    const rows = finishOrder.map((c, i) => `${i + 1}위 ${c.name} — ${fmt(c.time)}`).join('<br>');
    $('finBody').innerHTML = `${rows}<br><br>기록: <b>${fmt(player.time)}</b><br>넘어뜨린 손님: ${stats.knocked}명 · 떨어뜨린 상품: ${stats.spilled}개<br>혼돈 지수: <b>${chaos()}</b>`;
    $('finish').classList.remove('hidden');
  }, 1200);
}
const chaos = () => stats.knocked * 100 + stats.spilled * 10;
const fmt = t => `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}`;

// ---------- auto-accel ----------
let autoAccel = IS_TOUCH || localStorage.getItem('cartAuto') === '1';
const autoBtn = $('auto'); const showAuto = () => autoBtn.textContent = autoAccel ? '자동가속 ON' : '자동가속 OFF'; showAuto();
autoBtn.addEventListener('pointerdown', e => { e.stopPropagation(); autoAccel = !autoAccel; localStorage.setItem('cartAuto', autoAccel ? '1' : '0'); showAuto(); });
addEventListener('keydown', e => { if (e.code === 'KeyT' && !e.repeat) autoBtn.dispatchEvent(new PointerEvent('pointerdown')); });
let shake = 0;
const pick = a => a[(Math.random() * a.length) | 0];
// ---------- speech bubbles (HTML overlay projected to screen) ----------
const bubbleLayer = $('bubbles'), bubbles = []; const MAXB = 4;
function say(ent, text, dur = 2, force = false) {
  const now = performance.now() / 1000; if (!force && (ent.sayCd || 0) > now) return;
  if (bubbles.length >= MAXB) { if (!force) return; const old = bubbles.shift(); old.el.remove(); }
  const pos = ent.holder ? ent.holder.position : ent.g.root.position; if (!force && pos.distanceTo(camera.position) > 30) return;
  const ex = bubbles.find(b => b.ent === ent); if (ex) { ex.el.remove(); bubbles.splice(bubbles.indexOf(ex), 1); }
  const el = document.createElement('div'); el.className = 'bubble' + (ent.g && ent.g.root && !ent.holder ? ' cart' : ''); el.textContent = text; bubbleLayer.appendChild(el);
  bubbles.push({ ent, el, t: 0, dur }); ent.sayCd = now + dur + 2.5;
}
function chatter(cu) { if (bubbles.length < 3) say(cu, pick(['두부가 어디 있더라…', '오늘 할인한대!', '우유 사야지~', '라면 1+1이네!', '애들 간식은…', '계산대 줄 길다…', '어? 이거 싸다!', '장바구니 어디 뒀지?'])); }
const _v = new THREE.Vector3();
function updateBubbles() {
  const now = performance.now() / 1000;
  for (let i = bubbles.length - 1; i >= 0; i--) {
    const b = bubbles[i]; b.t += 1 / 60;
    if (b.t > b.dur) { b.el.remove(); bubbles.splice(i, 1); continue; }
    const p = b.ent.holder ? b.ent.holder.position : b.ent.g.root.position;
    _v.set(p.x, (b.ent.holder ? (b.ent.body ? p.y + 1.2 : 2.3) : 2.6), p.z).project(camera);
    if (_v.z > 1) { b.el.style.display = 'none'; continue; }
    b.el.style.display = ''; b.el.style.opacity = Math.min(1, (b.dur - b.t) * 2, b.t * 6);
    b.el.style.transform = `translate(-50%,-100%) translate(${Math.max(60, Math.min(innerWidth - 60, (_v.x * 0.5 + 0.5) * innerWidth))}px,${(-_v.y * 0.5 + 0.5) * innerHeight}px)`;
  }
}
// rival taunts / rank chatter
setInterval(() => { if (state !== 'race') return; const sorted = [...carts].sort((a, b) => b.prog - a.prog);
  for (const c of carts) if (c.ai && Math.hypot(c.x - player.x, c.z - player.z) < 15 && Math.random() < 0.25)
    say(c, sorted[0] === c ? pick(['내가 1등이다!', '따라올 테면 따라와~', '느려 느려~']) : pick(['어림없지!', '추월한다!', '비켜비켜!', '내 차례야!'])); }, 1500);
// ---------- particle puffs ----------
const puffs = [], puffG = new THREE.SphereGeometry(0.25, 6, 5);
function puff(x, y, z, col, n) { for (let i = 0; i < n; i++) { let p = puffs.find(q => q.life <= 0);
  if (!p) { if (puffs.length > 60) return; p = { m: new THREE.Mesh(puffG, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false })), life: 0, v: new THREE.Vector3() }; scene.add(p.m); puffs.push(p); }
  p.m.material.color.setHex(col); p.m.visible = true; p.m.position.set(x, y, z); p.v.set(Math.random() * 4 - 2, Math.random() * 3, Math.random() * 4 - 2); p.life = 0.6 + Math.random() * 0.3; } }
function updatePuffs(dt) { for (const p of puffs) { if (p.life <= 0) continue; p.life -= dt; p.m.position.addScaledVector(p.v, dt); p.v.multiplyScalar(0.92);
  p.m.scale.setScalar(1 + (1 - p.life) * 2); p.m.material.opacity = Math.max(0, p.life); if (p.life <= 0) p.m.visible = false; } }
// ---------- minimap ----------
const mm = $('minimap'), mctx = mm.getContext('2d'); const MW = mm.width, MH = mm.height, sx = x => (x + HX + HW + 3) / (2 * (HX + HW + 3)) * MW, sz = z => (z + HZ + HW + 3) / (2 * (HZ + HW + 3)) * MH;
function drawMinimap() {
  mctx.clearRect(0, 0, MW, MH); mctx.fillStyle = 'rgba(0,0,0,.45)'; mctx.fillRect(0, 0, MW, MH);
  mctx.strokeStyle = 'rgba(255,255,255,.55)'; mctx.lineWidth = 7; mctx.beginPath(); path.forEach((p, i) => i ? mctx.lineTo(sx(p.x), sz(p.y)) : mctx.moveTo(sx(p.x), sz(p.y))); mctx.closePath(); mctx.stroke();
  mctx.fillStyle = '#fff'; mctx.fillRect(sx(0) - 1, sz(-HZ) - 5, 2, 10);
  for (const cu of customers) { const x = cu.body ? cu.body.position.x : cu.x, z = cu.body ? cu.body.position.z : cu.z; mctx.fillStyle = cu.state === 'walk' ? '#bbb' : '#f44'; mctx.fillRect(sx(x) - 1, sz(z) - 1, 2, 2); }
  for (const c of carts) { mctx.fillStyle = '#' + c.color.toString(16).padStart(6, '0'); mctx.beginPath(); mctx.arc(sx(c.x), sz(c.z), c === player ? 4.5 : 3.5, 0, 7); mctx.fill(); if (c === player) { mctx.strokeStyle = '#fff'; mctx.lineWidth = 1.5; mctx.stroke(); } }
}

// ---------- fun systems: drift FX, items, events ----------
let annT = null;
function announce(t) { const el = $('event'); el.textContent = '📢 ' + t; el.classList.add('show'); clearTimeout(annT); annT = setTimeout(() => el.classList.remove('show'), 3500); }
const fun = createFun({ scene, world, carts, path, N, strips, customers, sound, player, textSprite, say, puff, flash, spawnProduct, stats, insideShelf, circlePush, announce, retarget, pushOut,
  shakeIt: k => { shake = Math.max(shake, k); }, lights: { hemi, dl, dl2 } });

// ---------- loop ----------
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
let last = performance.now(), acc = 0;
function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.05, (now - last) / 1000); last = now;
  step(dt); render(dt);
}
function step(dt) {
  if (state === 'title') { $('countdown').textContent = ''; }
  else if (state === 'countdown') {
    const before = Math.ceil(cd); cd -= dt; const n = Math.ceil(cd); if (n !== before && n > 0) sound.beep();
    $('countdown').textContent = cd > 0 ? n : '출발!';
    if (cd <= 0) { state = 'race'; sound.go(); setTimeout(() => { if ($('countdown').textContent === '출발!') $('countdown').textContent = ''; }, 800); }
  } else if (state === 'race' || state === 'finished') raceT += state === 'race' ? dt : 0;
  if (state === 'finished') for (const c of carts) if (!c.finished) { c.prog = c.lap * N + c.idx; }
  for (const c of carts) updateCart(c, dt);
  interactions(dt);
  fun.update(dt, state, raceT);
  updateCustomers(dt);
  for (const c of carts) { c.body.position.set(c.x, 0.7, c.z + 0); c.body.quaternion.setFromEuler(0, c.h, 0); c.body.velocity.set(Math.sin(c.vd) * c.v, 0, Math.cos(c.vd) * c.v); }
  acc += dt; let n = 0; while (acc >= 1 / 60 && n < 3) { world.step(1 / 60); acc -= 1 / 60; n++; } if (n === 3) acc = 0;
  for (const c of carts) { c.body.position.set(c.x, 0.7, c.z); }
  for (const cu of customers) if (cu.body) { const bp = cu.body.position, o = { x: bp.x, z: bp.z }; if (pushOut(o, 0.45)) { bp.x = o.x; bp.z = o.z; cu.body.velocity.x *= -0.3; cu.body.velocity.z *= -0.3; } }
  msgT -= dt; if (msgT <= 0) $('msg').textContent = '';
}
function render(dt) {
  for (const c of carts) { c.g.root.position.set(c.x, 0, c.z); c.drift = (c.drift || 0) + ((c.steerIn || 0) * Math.min(1, Math.abs(c.v) / 18) * 0.28 - (c.drift || 0)) * Math.min(1, dt * 5); c.g.root.rotation.y = c.h + (c.drifting ? 0 : c.drift * 0.5); c.g.update(c.v, dt);
    if (Math.abs(c.slip || 0) > 0.12 && Math.abs(c.v) > 5) { c.skT = (c.skT || 0) - dt; if (c.skT <= 0) { c.skT = 0.04; fun.skid(c); if (c.drifting && Math.random() < 0.5) puff(c.x - Math.sin(c.h) * 0.6, 0.2, c.z - Math.cos(c.h) * 0.6, Math.random() < 0.5 ? 0xffb300 : 0xdddddd, 1); } } }
  updatePuffs(dt); updateBubbles(); drawMinimap();
  for (const p of products) { p.mesh.position.copy(p.body.position); p.mesh.quaternion.copy(p.body.quaternion); }
  const p = player, chd = p.vd + ang(p.h - p.vd) * 0.4, fx = Math.sin(chd), fz = Math.cos(chd);
  const want = new THREE.Vector3(p.x - fx * 8, 4.2, p.z - fz * 8);
  { const ci = nearestIdx(want.x, want.z, 0, N), cp = path[ci], dx = want.x - cp.x, dz = want.z - cp.y, d = Math.hypot(dx, dz), lim = HW - 0.7; // keep camera inside the aisle
    if (d > lim) { want.x = cp.x + dx / d * lim; want.z = cp.y + dz / d * lim; } }
  for (let k = 0; k < 10; k++) { // keep camera out of shelves
    const inside = strips.some(st => want.x > st.x0 - 0.4 && want.x < st.x1 + 0.4 && want.z > st.z0 - 0.4 && want.z < st.z1 + 0.4);
    if (!inside) break; want.x += (p.x - want.x) * 0.2; want.z += (p.z - want.z) * 0.2; }
  camPos.lerp(want, 1 - Math.exp(-dt * 5)); if (camPos.lengthSq() === 0) camPos.copy(want);
  camLook.lerp(new THREE.Vector3(p.x + fx * 4, 1.2, p.z + fz * 4), 1 - Math.exp(-dt * 8));
  camera.position.copy(camPos); camera.lookAt(camLook);
  if (shake > 0) { shake = Math.max(0, shake - dt * 2); camera.position.x += (Math.random() - .5) * shake; camera.position.y += (Math.random() - .5) * shake * 0.6; }
  camera.fov = (innerWidth < innerHeight ? 80 : 65) + Math.max(0, p.v - 18) * 0.8; camera.updateProjectionMatrix();
  // HUD
  const sorted = [...carts].sort((a, b) => b.prog - a.prog);
  $('time').textContent = fmt(state === 'finished' ? p.time : raceT);
  $('lap').textContent = `${Math.min(LAPS, Math.max(1, p.lap + 1))}/${LAPS}`;
  $('rank').textContent = `${(p.finished ? finishOrder.indexOf(p) : sorted.indexOf(p)) + 1}/${carts.length}`;
  $('speed').textContent = `${Math.round(Math.abs(p.v) * 3.6)} km/h`;
  $('boostFill').style.width = `${p.gauge * 100}%`;
  $('n2o').innerHTML = [0, 1].map(i => `<span class="slot ${i < p.n2o ? 'full' : ''}">N2O</span>`).join('');
  $('itemSlot').innerHTML = p.item ? `<span class="ic">${ITEMS[p.item].icon}</span><span>${ITEMS[p.item].name}</span>` : '<span class="ic">❔</span><span>아이템 없음</span>';
  $('driftTxt').textContent = p.drifting ? `드리프트!${p.combo > 0 ? ' x' + (p.combo + 1) : ''}` : (p.combo > 1 ? `콤보 x${p.combo}` : '');
  $('riders').textContent = p.riders && p.riders.length ? `🛒 탑승 손님 ${'🧍'.repeat(p.riders.length)} (-${p.riders.length * 12}% 속도)` : '';
  $('driftTxt').className = p.drifting ? 'on' : '';
  $('chaos').textContent = chaos(); $('knocked').textContent = stats.knocked; $('spilled').textContent = stats.spilled;
  renderer.render(scene, camera);
}
camPos.set(player.x - 8, 4.2, player.z); camLook.set(player.x + 4, 1.2, player.z);
requestAnimationFrame(frame);
window.__game = { knock: (i, c) => knockCustomer(customers[i], c || player), startGame, hopOut, fun, player, insideShelf, get autoAccel() { return autoAccel; }, carts, customers, products, stats, keys, get state() { return state; } };
