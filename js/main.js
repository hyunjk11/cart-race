import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { HX, HZ, HW, LAPS, buildPath, shelfStrips, buildWorld } from './track.js';
import { makeCart, makePerson } from './models.js';

const $ = id => document.getElementById(id);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0xbfd4e6); scene.fog = new THREE.Fog(0xbfd4e6, 40, 110);
const camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.1, 300);
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
scene.add(new THREE.HemisphereLight(0xffffff, 0x887766, 1.1));
const dl = new THREE.DirectionalLight(0xffffff, 1.2); dl.position.set(20, 40, 10); scene.add(dl);

const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -20, 0) });
world.allowSleep = true; world.broadphase = new CANNON.SAPBroadphase(world);
world.defaultContactMaterial.friction = 0.4; world.defaultContactMaterial.restitution = 0.2;

const path = buildPath(), N = path.length;
const strips = shelfStrips();
buildWorld(scene, world, strips);

// ---------- input ----------
const keys = {};
addEventListener('keydown', e => { keys[e.code] = true; if (e.code === 'KeyR') location.reload(); if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault(); });
addEventListener('keyup', e => { keys[e.code] = false; });
$('restart').onclick = () => location.reload();

// ---------- stats ----------
const stats = { knocked: 0, spilled: 0 };
let msgT = 0; function flash(t) { $('msg').textContent = t; msgT = 1.5; }

// ---------- carts ----------
const CART_R = 1.3;
const carts = [];
function addCart(color, name, lane, row, ai) {
  const g = makeCart(color, ai ? 0x37474f : 0x1565c0); scene.add(g.root);
  const body = new CANNON.Body({ mass: 0, type: CANNON.Body.KINEMATIC, shape: new CANNON.Box(new CANNON.Vec3(0.7, 0.7, 1.6)) });
  world.addBody(body);
  const c = { g, body, name, ai, x: -4 - row * 5, z: -HZ + lane, h: Math.PI / 2, v: 0, idx: 0, lap: 0, finished: false, time: 0,
    maxV: ai ? 17 + Math.random() * 2.5 : 20, offset: lane * 0.6, boost: 1, stuck: 0, prog: 0 };
  c.idx = nearestIdx(c.x, c.z, 0, N); c.lap = c.idx > N / 2 ? -1 : 0; carts.push(c); return c;
}
function nearestIdx(x, z, from, span) {
  let bi = from, bd = 1e9;
  for (let k = 0; k < span; k++) { const i = (from + k + N) % N; const d = (path[i].x - x) ** 2 + (path[i].y - z) ** 2; if (d < bd) { bd = d; bi = i; } }
  return bi;
}
const player = addCart(0xd32f2f, '나', -2.5, 0, false);
addCart(0x2e7d32, '초록 카트', 2.5, 0, true);
addCart(0xf9a825, '노랑 카트', -2.5, 1, true);
addCart(0x6a1b9a, '보라 카트', 2.5, 1, true);

// ---------- products (physics pool) ----------
const MAXP = 140, products = [];
const boxG = new THREE.BoxGeometry(0.4, 0.55, 0.4), canG = new THREE.CylinderGeometry(0.17, 0.17, 0.4, 10);
const pCols = [0xe53935, 0x43a047, 0x1e88e5, 0xfdd835, 0xfb8c00, 0x8e24aa, 0x00acc1];
const pMats = pCols.map(c => new THREE.MeshLambertMaterial({ color: c }));
function spawnProduct(x, y, z, vx, vy, vz) {
  let p;
  if (products.length >= MAXP) { p = products.shift(); }
  else {
    const can = Math.random() < 0.4;
    const mesh = new THREE.Mesh(can ? canG : boxG, pMats[(Math.random() * pMats.length) | 0]); scene.add(mesh);
    const shape = can ? new CANNON.Cylinder(0.17, 0.17, 0.4, 8) : new CANNON.Box(new CANNON.Vec3(0.2, 0.275, 0.2));
    const body = new CANNON.Body({ mass: 0.4, shape, linearDamping: 0.3, angularDamping: 0.3, sleepSpeedLimit: 0.3 });
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
function pickTarget(cu) {
  const i = (Math.random() * N) | 0, p = path[i], q = path[(i + 1) % N];
  const tx = q.x - p.x, tz = q.y - p.y, l = Math.hypot(tx, tz) || 1, off = (Math.random() * 2 - 1) * (HW - 1);
  cu.tx = p.x - tz / l * off; cu.tz = p.y + tx / l * off;
}
for (let k = 0; k < 16; k++) {
  const g = makePerson(shirt[k % shirt.length], Math.random() < 0.5 ? 0x3949ab : 0x5d4037);
  const holder = new THREE.Group(); g.root.position.y = -0.85; holder.add(g.root); scene.add(holder);
  const cu = { g, holder, state: 'walk', t: 0, x: 0, z: 0, tx: 0, tz: 0, sp: 1 + Math.random() * 0.8, body: null };
  let i = (Math.random() * N) | 0; if (i < 12 || i > N - 4) i += 20; // keep start area clear
  cu.x = path[i].x + (Math.random() * 2 - 1) * 4; cu.z = path[i].y + (Math.random() * 2 - 1) * 4; pickTarget(cu);
  customers.push(cu);
}
function knockCustomer(cu, c) {
  cu.state = 'down'; cu.t = 0; stats.knocked++; flash('손님을 넘어뜨렸다! 💥');
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
        const n = Math.min(10, Math.floor(impact / 2.2)); stats.spilled += n; c.lastHit = 0.4;
        if (!c.ai) flash('선반 충돌! 상품이 쏟아졌다 🥫');
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
let state = 'countdown', cd = 3.99, raceT = 0; const finishOrder = [];
const ang = a => Math.atan2(Math.sin(a), Math.cos(a));

function updateCart(c, dt) {
  c.lastHit = (c.lastHit || 0) - dt;
  let thr = 0, steer = 0, boosting = false;
  if (state !== 'race' || c.finished) { thr = c.finished ? -0.3 * Math.sign(c.v) : 0; }
  else if (!c.ai) {
    if (keys.ArrowUp || keys.KeyW) thr = 1; if (keys.ArrowDown || keys.KeyS) thr = -1;
    if (keys.ArrowLeft || keys.KeyA) steer += 1; if (keys.ArrowRight || keys.KeyD) steer -= 1;
    if (keys.Space && c.boost > 0) boosting = true;
  } else {
    const tgt = path[(c.idx + 4) % N], nxt = path[(c.idx + 5) % N];
    const tx = nxt.x - tgt.x, tz = nxt.y - tgt.y, l = Math.hypot(tx, tz) || 1;
    const gx = tgt.x - tz / l * c.offset, gz = tgt.y + tx / l * c.offset;
    const want = Math.atan2(gx - c.x, gz - c.z), da = ang(want - c.h);
    steer = Math.max(-1, Math.min(1, da * 2.5)); thr = Math.abs(da) > 0.6 && c.v > 10 ? 0.2 : 1;
    if (Math.abs(c.v) < 1.5) c.stuck += dt; else c.stuck = 0;
    if (c.stuck > 1.2) { c.reverse = 0.8; c.stuck = 0; }
    if (c.reverse > 0) { c.reverse -= dt; thr = -1; steer = -steer; }
    if (c.boost > 0.6 && Math.abs(da) < 0.1 && Math.random() < 0.01) c.boostT = 1;
    if (c.boostT > 0) { c.boostT -= dt; boosting = true; }
  }
  const maxV = c.maxV * (boosting ? 1.45 : 1);
  if (boosting) c.boost = Math.max(0, c.boost - dt * 0.5); else c.boost = Math.min(1, c.boost + dt * 0.08);
  if (thr > 0) c.v += (boosting ? 22 : 12) * dt * (1 - Math.max(0, c.v) / maxV);
  else if (thr < 0) c.v -= (c.v > 0 ? 30 : 8) * dt;
  c.v -= c.v * 0.6 * dt; if (c.v < -6) c.v = -6;
  if (thr === 0 && Math.abs(c.v) < 0.3) c.v = 0;
  c.h += steer * dt * 2.4 * Math.min(1, Math.abs(c.v) / 5) * Math.sign(c.v || 1);
  c.x += Math.sin(c.h) * c.v * dt; c.z += Math.cos(c.h) * c.v * dt;
  shelfCollide(c, dt);
  // progress
  const ni = nearestIdx(c.x, c.z, c.idx - 3, 14);
  if (c.idx > N - 8 && ni < 8) { c.lap++; if (c.lap >= LAPS && !c.finished) { c.finished = true; c.time = raceT; finishOrder.push(c); if (!c.ai) endRace(); } else if (!c.ai && c.lap < LAPS) flash(`랩 ${c.lap + 1}/${LAPS}!`); }
  else if (c.idx < 8 && ni > N - 8) c.lap--;
  c.idx = ni; c.prog = c.finished ? 1e6 - c.time : c.lap * N + c.idx;
}

function interactions(dt) {
  for (const c of carts) {
    const fx = Math.sin(c.h), fz = Math.cos(c.h);
    for (const o of carts) if (o !== c) circlePush(c, o.x, o.z, CART_R * 1.8, 0.985);
    for (const cu of customers) {
      if (cu.state === 'walk') {
        const cx = c.x + fx * 1.2, cz = c.z + fz * 1.2;
        if (Math.hypot(cx - cu.x, cz - cu.z) < 1.0 || Math.hypot(c.x - cu.x, c.z - cu.z) < 1.3) {
          if (Math.abs(c.v) > 9) { knockCustomer(cu, c); c.v *= 0.75; }
          else { c.v *= 0.5; cu.x += fx * 0.6; cu.z += fz * 0.6; if (!c.ai && (c.bump || 0) <= 0) { flash('앗, 죄송합니다! 🙇'); c.bump = 1; } }
        }
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
      if (d < 0.5 || cu.t > 25) { pickTarget(cu); cu.t = 0; }
      else { cu.x += dx / d * cu.sp * dt; cu.z += dz / d * cu.sp * dt; cu.holder.rotation.set(0, Math.atan2(dx, dz), 0); }
      cu.holder.position.set(cu.x, 0.85, cu.z); cu.g.walk(cu.t * cu.sp * 6);
    } else if (cu.state === 'down') {
      cu.holder.position.copy(cu.body.position); cu.holder.quaternion.copy(cu.body.quaternion); cu.g.walk(0);
      if (cu.t > 7) { cu.state = 'rise'; cu.t = 0; cu.q0 = cu.holder.quaternion.clone(); cu.x = cu.body.position.x; cu.z = cu.body.position.z; cu.y0 = cu.body.position.y; world.removeBody(cu.body); cu.body = null; cu.qUp = new THREE.Quaternion(); }
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

// ---------- loop ----------
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
let last = performance.now(), acc = 0;
function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.05, (now - last) / 1000); last = now;
  step(dt); render(dt);
}
function step(dt) {
  if (state === 'countdown') {
    cd -= dt; const n = Math.ceil(cd);
    $('countdown').textContent = cd > 0 ? n : '출발!';
    if (cd <= 0) { state = 'race'; setTimeout(() => { if ($('countdown').textContent === '출발!') $('countdown').textContent = ''; }, 800); }
  } else if (state === 'race' || state === 'finished') raceT += state === 'race' ? dt : 0;
  if (state === 'finished') for (const c of carts) if (!c.finished) { c.prog = c.lap * N + c.idx; }
  for (const c of carts) updateCart(c, dt);
  interactions(dt);
  updateCustomers(dt);
  for (const c of carts) { c.body.position.set(c.x, 0.7, c.z + 0); c.body.quaternion.setFromEuler(0, c.h, 0); c.body.velocity.set(Math.sin(c.h) * c.v, 0, Math.cos(c.h) * c.v); }
  acc += dt; let n = 0; while (acc >= 1 / 60 && n < 3) { world.step(1 / 60); acc -= 1 / 60; n++; } if (n === 3) acc = 0;
  for (const c of carts) { c.body.position.set(c.x, 0.7, c.z); }
  msgT -= dt; if (msgT <= 0) $('msg').textContent = '';
}
function render(dt) {
  for (const c of carts) { c.g.root.position.set(c.x, 0, c.z); c.g.root.rotation.y = c.h; c.g.update(c.v, dt); }
  for (const p of products) { p.mesh.position.copy(p.body.position); p.mesh.quaternion.copy(p.body.quaternion); }
  const p = player, fx = Math.sin(p.h), fz = Math.cos(p.h);
  const want = new THREE.Vector3(p.x - fx * 8, 4.2, p.z - fz * 8);
  for (let k = 0; k < 10; k++) { // keep camera out of shelves
    const inside = strips.some(st => want.x > st.x0 - 0.4 && want.x < st.x1 + 0.4 && want.z > st.z0 - 0.4 && want.z < st.z1 + 0.4);
    if (!inside) break; want.x += (p.x - want.x) * 0.2; want.z += (p.z - want.z) * 0.2; }
  camPos.lerp(want, 1 - Math.exp(-dt * 5)); if (camPos.lengthSq() === 0) camPos.copy(want);
  camLook.lerp(new THREE.Vector3(p.x + fx * 4, 1.2, p.z + fz * 4), 1 - Math.exp(-dt * 8));
  camera.position.copy(camPos); camera.lookAt(camLook);
  camera.fov = 65 + Math.max(0, p.v - 18) * 0.8; camera.updateProjectionMatrix();
  // HUD
  const sorted = [...carts].sort((a, b) => b.prog - a.prog);
  $('time').textContent = fmt(state === 'finished' ? p.time : raceT);
  $('lap').textContent = `${Math.min(LAPS, Math.max(1, p.lap + 1))}/${LAPS}`;
  $('rank').textContent = `${(p.finished ? finishOrder.indexOf(p) : sorted.indexOf(p)) + 1}/${carts.length}`;
  $('speed').textContent = `${Math.round(Math.abs(p.v) * 3.6)} km/h`;
  $('boostFill').style.width = `${p.boost * 100}%`;
  $('chaos').textContent = chaos(); $('knocked').textContent = stats.knocked; $('spilled').textContent = stats.spilled;
  renderer.render(scene, camera);
}
camPos.set(player.x - 8, 4.2, player.z); camLook.set(player.x + 4, 1.2, player.z);
requestAnimationFrame(frame);
window.__game = { carts, customers, products, stats, keys, get state() { return state; } };
