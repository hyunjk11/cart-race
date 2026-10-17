// Drift visuals, item boxes & items, displays (props), and random mart events.
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import * as TR from './track.js';
const { hAt, atLane: tAtLane, straightAt } = TR;
import { makeCart } from './models.js';

export const ITEMS = {
  banana: { icon: '🍌', name: '바나나 껍질' }, puddle: { icon: '🪣', name: '물 양동이' }, sign: { icon: '⚠️', name: '미끄럼 주의' },
  bag: { icon: '🛍️', name: '장바구니 미사일' }, shield: { icon: '🛡️', name: '실드' }, magnet: { icon: '🧲', name: '자석' },
};
const ITEM_KEYS = Object.keys(ITEMS);
// item odds by race position: leaders get mostly defensive/drop items, the back of the pack gets catch-up items
//                 banana puddle sign  bag  shield magnet
const W_FRONT = [ 3,     2,     2,   0.6, 3,     0.4 ], W_BACK = [ 0.8, 0.8, 0.4, 3, 1, 3 ];
export function itemOdds(t) { const w = W_FRONT.map((f, i) => f + (W_BACK[i] - f) * t), s = w.reduce((a, b) => a + b, 0); return w.map(x => x / s); }
const lm = c => new THREE.MeshLambertMaterial({ color: c });

function disposeObj(o) { o.traverse(n => { if (n.isSprite && n.material.map) { n.material.map.dispose(); n.material.dispose(); } }); }
export function createFun(G) {
  const { scene, world, carts, path, N, strips, customers, sound } = G; const HW = TR.HW, MAP = TR.MAP;
  const ang = a => Math.atan2(Math.sin(a), Math.cos(a));
  const tangent = i => { const p = path[i % N], q = path[(i + 1) % N]; const tx = q.x - p.x, tz = q.y - p.y, l = Math.hypot(tx, tz) || 1; return [tx / l, tz / l]; };
  const atLane = (i, lat) => { const p = path[((i % N) + N) % N], [tx, tz] = tangent(((i % N) + N) % N); return { x: p.x - tz * lat, z: p.y + tx * lat }; };
  const obstacles = [], fixedObs = []; // for AI avoidance: {x,z,r}

  // ---------- skid marks (instanced, fading by shrinking) ----------
  const SK = 300, skG = new THREE.PlaneGeometry(0.16, 0.5); skG.rotateX(-Math.PI / 2);
  const skids = new THREE.InstancedMesh(skG, new THREE.MeshBasicMaterial({ color: 0x222222, transparent: true, opacity: 0.55, depthWrite: false }), SK);
  skids.frustumCulled = false; const skAge = new Float32Array(SK).fill(99), skPos = []; let skI = 0;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v3 = new THREE.Vector3(), s3 = new THREE.Vector3();
  for (let i = 0; i < SK; i++) { skPos.push([0, 0, 0, 0]); skids.setMatrixAt(i, m4.makeScale(0, 0, 0)); }
  scene.add(skids);
  function skid(c) {
    const fx = Math.sin(c.h), fz = Math.cos(c.h);
    for (const s of [-1, 1]) { const x = c.x - fx * 0.2 + fz * 0.45 * s, z = c.z - fz * 0.2 - fx * 0.45 * s; skPos[skI] = [x, z, c.vd, hAt(x, z)]; skAge[skI] = 0; skI = (skI + 1) % SK; }
  }
  function updateSkids(dt) {
    for (let i = 0; i < SK; i++) { if (skAge[i] > 6) continue; skAge[i] += dt; const k = Math.max(0, 1 - skAge[i] / 6);
      e.set(0, skPos[i][2], 0); q.setFromEuler(e); m4.compose(v3.set(skPos[i][0], 0.03 + skPos[i][3], skPos[i][1]), q, s3.set(k, 1, k > 0 ? 1 : 0)); skids.setMatrixAt(i, m4); }
    skids.instanceMatrix.needsUpdate = true;
  }

  // ---------- props: can pyramids, fruit stands w/ watermelons, water pack stacks ----------
  const props = [];
  function addProp(mesh, shape, mass, x, y, z, lin = 0.2, angD = 0.3) {
    scene.add(mesh); y += hAt(x, z); const b = new CANNON.Body({ mass, shape, linearDamping: lin, angularDamping: angD, sleepSpeedLimit: 0.25 }); b.position.set(x, y, z); b.allowSleep = true; world.addBody(b); b.sleep(); props.push({ mesh, body: b }); mesh.position.set(x, y, z);
  }
  const canG = new THREE.CylinderGeometry(0.17, 0.17, 0.36, 10), canMats = [lm(0xd32f2f), lm(0xfbc02d), lm(0x1976d2)];
  function pyramid(x, z, alongX) {
    let k = 0; for (let row = 0; row < 4; row++) for (let i = 0; i < 4 - row; i++) {
      const o = (i - (3 - row) / 2) * 0.36; addProp(new THREE.Mesh(canG, canMats[(k++) % 3]), new CANNON.Cylinder(0.17, 0.17, 0.36, 8), 0.3, x + (alongX ? o : 0), 0.18 + row * 0.36, z + (alongX ? 0 : o));
    }
    const sign = G.textSprite(MAP.pyrLabel || '통조림 특가', '#d32f2f'); sign.position.set(x, 2.1 + hAt(x, z), z); sign.scale.set(2.4, 0.6, 1); scene.add(sign);
  }
  const melonG = new THREE.SphereGeometry(0.34, 14, 10), melonM = lm(0x2e7d32), tubG = new THREE.CylinderGeometry(0.26, 0.2, 0.32, 12), tubM = lm(0xf8bbd0);
  const tableM = lm(0x8d6e63);
  function stand(x, z, w, d, label) {
    const st = { x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2, nx: 0, nz: 0, kind: 'stand' }; strips.push(st); const y0 = hAt(x, z);
    const t = new THREE.Mesh(new THREE.BoxGeometry(w, 0.9, d), tableM); t.position.set(x, 0.45 + y0, z); scene.add(t);
    const body = new CANNON.Body({ mass: 0, shape: new CANNON.Box(new CANNON.Vec3(w / 2, 0.45, d / 2)) }); body.position.set(x, 0.45 + y0, z); world.addBody(body);
    const sg = G.textSprite(label, '#2e7d32'); sg.position.set(x, 2.2 + y0, z); sg.scale.set(2.4, 0.6, 1); scene.add(sg);
    const ob = { x, z, r: Math.max(w, d) / 2 + 0.5 }; fixedObs.push(ob);
    return { st, t, body, sg, ob };
  }
  function melons(x, z, alongX, n = 4, tub) { for (let i = 0; i < n; i++) { const o = (i - (n - 1) / 2) * 0.72; addProp(tub ? new THREE.Mesh(tubG, tubM) : new THREE.Mesh(melonG, melonM), tub ? new CANNON.Cylinder(0.26, 0.2, 0.32, 8) : new CANNON.Sphere(0.34), tub ? 0.6 : 3, x + (alongX ? o : 0), 1.25, z + (alongX ? 0 : o), 0.05, 0.05); } }
  const waterG = new THREE.BoxGeometry(0.6, 0.32, 0.4), waterM = new THREE.MeshLambertMaterial({ color: MAP.waterCol || 0x81d4fa, transparent: true, opacity: 0.85 });
  function waterStack(x, z) { for (let y = 0; y < 3; y++) for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) addProp(new THREE.Mesh(waterG, waterM), new CANNON.Box(new CANNON.Vec3(0.3, 0.16, 0.2)), 1.5, x + (i - 0.5) * 0.62, 0.16 + y * 0.33, z + (j - 0.5) * 0.42); }
  // map displays: snapped onto straights, against the outer (or inner) wall
  for (const D of MAP.displays || []) {
    let i = Math.round(N * D.f); for (let k = 0; k < 40 && !straightAt(i, 4); k++) i++;
    const sideS = (D.side === 'in' ? 1 : -1) * MAP.inSign, [tx] = tangent(((i % N) + N) % N), ax = Math.abs(tx) > 0.5;
    if (D.t === 'pyramid') { const p = tAtLane(i, sideS * (HW - 0.9)); pyramid(p.x, p.z, ax); }
    else if (D.t === 'water') { const p = tAtLane(i, sideS * (HW - 0.7)); waterStack(p.x, p.z); }
    else if (D.t === 'stand') { const p = tAtLane(i, sideS * (HW - 1.0)); stand(p.x, p.z, ax ? 3 : 1.2, ax ? 1.2 : 3, D.label); melons(p.x, p.z, ax, D.n || 4, D.fruit === 'tub'); }
  }

  // ---------- item boxes ----------
  const qc = document.createElement('canvas'); qc.width = qc.height = 64; const qg = qc.getContext('2d');
  const grd = qg.createLinearGradient(0, 0, 64, 64); grd.addColorStop(0, '#ff5ec4'); grd.addColorStop(0.5, '#ffd84d'); grd.addColorStop(1, '#4dd0ff');
  qg.fillStyle = grd; qg.fillRect(0, 0, 64, 64); qg.fillStyle = '#fff'; qg.font = 'bold 48px sans-serif'; qg.textAlign = 'center'; qg.textBaseline = 'middle'; qg.fillText('?', 32, 36);
  const qMat = new THREE.MeshLambertMaterial({ map: new THREE.CanvasTexture(qc), transparent: true, opacity: 0.9, emissive: 0x332233 });
  const boxes = [], boxGeo = new THREE.BoxGeometry(0.9, 0.9, 0.9);
  for (const f of [0.18, 0.47, 0.76]) for (const lat of [-HW * 0.53, 0, HW * 0.53]) { let i = Math.round(N * f), p = atLane(i, lat); for (let k = 0; k < 10 && strips.some(s => p.x > s.x0 - 1.6 && p.x < s.x1 + 1.6 && p.z > s.z0 - 1.6 && p.z < s.z1 + 1.6); k++) p = atLane(++i, lat); const m = new THREE.Mesh(boxGeo, qMat); const y = hAt(p.x, p.z); m.position.set(p.x, 1.1 + y, p.z); scene.add(m); boxes.push({ x: p.x, z: p.z, y, m, cd: 0 }); }

  // ---------- hazards & projectiles ----------
  const hazards = [], projs = []; let hid = 0;
  const banG = new THREE.TorusGeometry(0.25, 0.08, 6, 10, Math.PI * 1.3), banM = lm(0xffe135);
  const pudM = new THREE.MeshBasicMaterial({ color: 0x4fc3f7, transparent: true, opacity: 0.55, depthWrite: false });
  function signMesh() { const g = new THREE.Group(); const a = new THREE.Mesh(new THREE.ConeGeometry(0.4, 1.0, 4, 1, true), new THREE.MeshLambertMaterial({ color: 0xffd600, side: THREE.DoubleSide })); a.position.y = 0.5; g.add(a);
    const t = G.textSprite('⚠ 미끄럼 주의', '#f9a825'); t.position.y = 1.35; t.scale.set(1.6, 0.4, 1); g.add(t); return g; }
  function addHazard(type, x, z, life, r, owner) {
    let mesh;
    if (type === 'banana') { mesh = new THREE.Mesh(banG, banM); mesh.rotation.x = -Math.PI / 2; mesh.position.set(x, 0.1 + hAt(x, z), z); }
    else if (type === 'puddle') { mesh = new THREE.Mesh(new THREE.CircleGeometry(r, 20), pudM); mesh.rotation.x = -Math.PI / 2; mesh.position.set(x, 0.04 + hAt(x, z), z); }
    else { mesh = signMesh(); mesh.position.set(x, hAt(x, z), z); }
    scene.add(mesh); const h = { id: ++hid, type, x, z, life, r, owner, mesh, arm: 0.5 }; hazards.push(h); return h;
  }
  function removeHazard(h) { scene.remove(h.mesh); if (h.type === 'puddle') h.mesh.geometry.dispose(); else if (h.type === 'sign') disposeObj(h.mesh); hazards.splice(hazards.indexOf(h), 1); }
  const bagG = new THREE.BoxGeometry(0.5, 0.55, 0.3), bagM = lm(0xff7043);
  function rollItem(c) { // t = 0 for the leader .. 1 for last place
    const act = carts.filter(o => !o.inactive), rank = act.filter(o => o !== c && o.prog > c.prog).length, t = act.length > 1 ? rank / (act.length - 1) : 0.5;
    const p = itemOdds(t); let r = Math.random(); for (let i = 0; i < p.length; i++) { r -= p[i]; if (r <= 0) return ITEM_KEYS[i]; } return ITEM_KEYS[ITEM_KEYS.length - 1]; }
  function aheadOf(c) { let best = null, bd = 1e9; for (const o of carts) { if (o === c || o.finished) continue; const d = o.prog - c.prog; if (d > 0 && d < bd) { bd = d; best = o; } } return best; }
  function hit(c, by) {
    if (c.shieldT > 0) { c.shieldT = 0; G.say(c, '실드로 막았다!', 1.3, true); G.puff(c.x, 1, c.z, 0x80d8ff, 6); return; }
    if (G.onHit) G.onHit(c, by);
    c.hitSeq = (c.hitSeq || 0) + 1; c.spin = 1.1; c.v *= 0.35; c.drifting = false; G.puff(c.x, 0.8, c.z, 0xffffff, 6); if (G.comic && (c === G.player || by === G.player || Math.hypot(c.x - G.player.x, c.z - G.player.z) < 20)) G.comic(c.x, 2 + hAt(c.x, c.z), c.z, ['POW!', '퍽!', '빙글~', 'BAM!'][(Math.random() * 4) | 0], '#ff4081'); if (c === G.player && G.screenFlash) G.screenFlash('#fff', 0.45);
    { const L = (c.lines && c.lines.hit) || ['으아악~', '빙글빙글~', '누구야!']; G.say(c, L[(Math.random() * L.length) | 0], 1.5, true); }
    if (c === G.player) { G.shakeIt(0.7); G.flash('당했다! 🌀'); sound.bump(1); } else if (by === G.player) { G.flash(`${c.name} 명중! 🎯`); sound.oof(); }
  }
  function useItem(c) {
    const it = c.item; if (!it) return; c.item = null; c.itemHold = 0;
    const fx = Math.sin(c.h), fz = Math.cos(c.h);
    if (it === 'banana') addHazard('banana', c.x - fx * 2.4, c.z - fz * 2.4, 30, 1.2, c);
    else if (it === 'puddle') addHazard('puddle', c.x - fx * 3.5, c.z - fz * 3.5, 14, 2.2, c);
    else if (it === 'sign') addHazard('sign', c.x - fx * 2.6, c.z - fz * 2.6, 30, 1.0, c);
    else if (it === 'bag') { const m = new THREE.Mesh(bagG, bagM); m.position.set(c.x + fx * 2, 1.2 + hAt(c.x, c.z), c.z + fz * 2); scene.add(m); projs.push({ id: ++hid, m, x: c.x + fx * 2, z: c.z + fz * 2, h: c.h, life: 4, owner: c, target: aheadOf(c) }); sound.whoosh(); }
    else if (it === 'shield') { c.shieldT = 7; }
    else if (it === 'magnet') { c.magnetT = 3.5; c.magTarget = aheadOf(c); }
    if (c === G.player) G.flash(`${ITEMS[it].icon} ${ITEMS[it].name}!`);
    else if (Math.random() < 0.6) G.say(c, it === 'bag' ? '받아라!' : it === 'banana' ? '바나나 선물~' : '후후후', 1.3);
  }
  const shieldG = new THREE.SphereGeometry(1.6, 16, 12), shieldM = new THREE.MeshBasicMaterial({ color: 0x80d8ff, transparent: true, opacity: 0.25, depthWrite: false });
  for (const c of carts) { c.shieldMesh = new THREE.Mesh(shieldG, shieldM); c.shieldMesh.position.y = 1; c.shieldMesh.visible = false; c.g.root.add(c.shieldMesh); }

  // ---------- events ----------
  const ev = { name: null, t: 0, next: 18 + Math.random() * 8, objs: [], forced: new URLSearchParams(location.search).get('event'), log: [] };
  const lights = G.lights;
  const EVN = { timesale: '⏰ 타임세일! 손님들이 몰려옵니다!', cleaning: '🧹 바닥 청소 중 — 미끄러우니 조심하세요', tasting: '🍢 시식 코너 오픈!', blackout: '💡 정전! 잠시만 기다려 주세요', vip: '👑 VIP 고객님 입장!', spill: '📦 물건 쏟아짐 — 운반 카트 통과 중!' };
  function spotAhead(dist, needStraight) {
    let i = (G.player.idx + dist) % N;
    if (needStraight) for (let k = 0; k < 40; k++) { const [tx, tz] = tangent(i); if (Math.abs(tx) > 0.999 || Math.abs(tz) > 0.999) break; i = (i + 1) % N; }
    return i;
  }
  function rushCustomers(x, z, n, dur) {
    const free = customers.filter(c => c.state === 'walk').sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z)).slice(0, n);
    free.forEach((cu, k) => { cu.rush = { x: x + Math.cos(k * 2.4) * (1 + k * 0.35), z: z + Math.sin(k * 2.4) * (1 + k * 0.35), t: dur }; });
    // teleport the far ones closer (they "arrive" from side aisles)
    free.forEach((cu, k) => { if (Math.hypot(cu.x - x, cu.z - z) > 30) { const p = atLane(G.player.idx + 50 + k * 3, (Math.random() * 2 - 1) * 3); cu.x = p.x; cu.z = p.z; } });
  }
  function startEvent(name, fi) {
    const SA = (d, st) => { const i = fi ?? spotAhead(d, st); ev.spotI = i; return i; };
    ev.name = name; ev.t = 0; ev.log.push(name); sound.chime(); G.announce(EVN[name]);
    if (name === 'timesale') { const i = SA(28), p = atLane(i, 0); ev.dur = 14; ev.spot = p; rushCustomers(p.x, p.z, 8, 13);
      const s = G.textSprite('⏰ 타임세일 50%', '#d50000'); s.position.set(p.x, 3.6, p.z); s.scale.set(5, 1.25, 1); scene.add(s); ev.objs.push(s); }
    else if (name === 'cleaning') { const i = SA(26), p = atLane(i, 0); ev.dur = 16; ev.objs.push(addHazard('puddle', p.x, p.z, 16, 4.2, null));
      for (const lat of [-4, 4]) { const q2 = atLane(i, lat); ev.objs.push(addHazard('sign', q2.x, q2.z, 16, 0.9, null)); } }
    else if (name === 'tasting') { const i = SA(30, true), [tx, tz] = tangent(i), lat = HW - 1.6, p = atLane(i, lat);
      const w = Math.abs(tx) > 0.5 ? 2.4 : 1.1, d = Math.abs(tx) > 0.5 ? 1.1 : 2.4; ev.stand = stand(p.x, p.z, w, d, '🍢 시식 코너'); ev.dur = 16;
      const c = atLane(i, lat - 2); rushCustomers(c.x, c.z, 6, 15); }
    else if (name === 'blackout') { ev.dur = 7; }
    else if (name === 'vip') { const i = SA(22); const g = makeCart(0xffd700, { shirt: 0x212121, hat: 0xffd700, hair: 0x111111, pants: 0x212121 }); g.root.scale.setScalar(2.1); scene.add(g.root);
      const crown = G.textSprite('👑 VIP', '#6a1b9a'); crown.position.y = 2.6; crown.scale.set(1.6, 0.5, 1); g.root.add(crown);
      ev.vip = { g, idx: i, x: path[i].x, z: path[i].y, h: 0 }; ev.dur = 28; G.say({ g }, '비켜라, VIP 나가신다!', 2.5, true); }
    else if (name === 'spill') { const i = SA(26, true), [tx, tz] = tangent(i); const g = new THREE.Group();
      const base = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.5, 2.2), lm(0xff6f00)); base.position.y = 0.4; g.add(base);
      for (let k = 0; k < 4; k++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.5, 0.6), lm(0xbcaaa4)); b.position.set((k % 2 - 0.5) * 0.65, 0.95, ((k >> 1) - 0.5) * 0.9); g.add(b); }
      const mast = new THREE.Mesh(new THREE.BoxGeometry(0.15, 2.2, 0.15), lm(0x424242)); mast.position.set(0, 1.4, -1.0); g.add(mast);
      scene.add(g); ev.fork = { g, i, nx: -tz, nz: tx, s: -(HW - 1), dir: 1, drop: 0 }; ev.dur = 11; }
  }
  function endEvent() {
    for (const o of ev.objs) { if (o.mesh) { if (hazards.includes(o)) removeHazard(o); } else { scene.remove(o); disposeObj(o); } } ev.objs = [];
    for (const cu of customers) if (cu.rush) { delete cu.rush; cu.sp = cu.baseSp || cu.sp; G.retarget(cu); }
    if (ev.stand) { const s = ev.stand; strips.splice(strips.indexOf(s.st), 1); scene.remove(s.t); scene.remove(s.sg); world.removeBody(s.body); fixedObs.splice(fixedObs.indexOf(s.ob), 1); ev.stand = null; }
    if (ev.vip) { scene.remove(ev.vip.g.root); disposeObj(ev.vip.g.root); ev.vip = null; }
    if (ev.fork) { scene.remove(ev.fork.g); ev.fork = null; }
    setDim(0); ev.name = null; ev.next = 25 + Math.random() * 15;
  }
  let dim = 0;
  const TH = MAP.theme, bg0 = new THREE.Color(TH.bg), fog0 = new THREE.Color(TH.fogCol ?? TH.bg);
  function setDim(k) { dim = k; lights.hemi.intensity = TH.hemi * (1 - k * 0.88); lights.dl.intensity = TH.dl * (1 - k * 0.9); lights.dl2.intensity = TH.dl2 * (1 - k); scene.background.copy(bg0).multiplyScalar(1 - k * 0.88); scene.fog.color.copy(fog0).multiplyScalar(1 - k * 0.88); }
  setDim(0);
  function updateEvents(dt, raceT) {
    if (!ev.name) {
      if (ev.forced && EVN[ev.forced] && raceT > 2) { const f = ev.forced; ev.forced = null; startEvent(f); return; }
      ev.next -= dt; if (ev.next <= 0) startEvent(Object.keys(EVN)[(Math.random() * 6) | 0]); return;
    }
    ev.t += dt;
    if (ev.name === 'blackout') { const k = ev.t < 0.6 ? (Math.random() < 0.5 ? 1 : 0.3) : ev.t > ev.dur - 0.8 ? (Math.random() < 0.5 ? 0.2 : 1) : 1; setDim(k); }
    if (ev.vip) { const V = ev.vip; const tgt = path[(V.idx + 3) % N]; const dx = tgt.x - V.x, dz = tgt.y - V.z, d = Math.hypot(dx, dz) || 1;
      V.x += dx / d * 7 * dt; V.z += dz / d * 7 * dt; V.h = Math.atan2(dx, dz); if (d < 2.5) V.idx = (V.idx + 1) % N;
      V.g.root.position.set(V.x, hAt(V.x, V.z), V.z); V.g.root.rotation.y = V.h; V.g.update(7, dt);
      for (const c of carts) G.circlePush(c, V.x, V.z, 3.4, 0.9);
      for (const cu of customers) if (cu.state === 'walk' && Math.hypot(cu.x - V.x, cu.z - V.z) < 3) { const a = Math.atan2(cu.x - V.x, cu.z - V.z); cu.x = V.x + Math.sin(a) * 3; cu.z = V.z + Math.cos(a) * 3; G.pushOut(cu, 0.5); }
      obstacles.vip = V; }
    if (ev.fork) { const F = ev.fork; F.s += F.dir * 2.6 * dt; if (Math.abs(F.s) > HW - 1) F.dir = -F.dir; const p = atLane(F.i, F.s);
      F.g.position.set(p.x, hAt(p.x, p.z), p.z); F.g.rotation.y = Math.atan2(F.nx * F.dir, F.nz * F.dir);
      F.drop -= dt; if (F.drop <= 0) { F.drop = 0.45; G.spawnProduct(p.x, 1.3 + hAt(p.x, p.z), p.z, (Math.random() - .5) * 3, 1, (Math.random() - .5) * 3); G.stats.spilled++; }
      for (const c of carts) G.circlePush(c, p.x, p.z, 2.2, 0.6); obstacles.fork = p; }
    if (ev.t > ev.dur) { endEvent(); delete obstacles.vip; delete obstacles.fork; }
  }

  // ---------- per-frame ----------
  function update(dt, state, raceT, guest) {
    updateSkids(dt);
    if (guest) return guestUpdate(dt);
    const t = performance.now() / 1000;
    for (const b of boxes) {
      b.cd -= dt; b.m.visible = b.cd <= 0; b.m.rotation.set(t * 0.7, t * 1.3, 0); b.m.position.y = 1.1 + b.y + Math.sin(t * 2 + b.x) * 0.15;
      if (b.cd > 0) continue;
      for (const c of carts) if (Math.hypot(c.x - b.x, c.z - b.z) < 1.7) { b.cd = 4; G.puff(b.x, 1.1, b.z, 0xffd84d, 5);
        if (!c.item) { c.item = rollItem(c); c.itemHold = 0; c.aiUseAt = 1.5 + Math.random() * 3; if (c === G.player) { sound.lap(); G.flash(`아이템 획득: ${ITEMS[c.item].icon} ${ITEMS[c.item].name}`); } }
        break; }
    }
    for (const c of carts) {
      c.shieldT = Math.max(0, (c.shieldT || 0) - dt); c.shieldMesh.visible = c.shieldT > 0;
      if (c.magnetT > 0) { c.magnetT -= dt; const T = c.magTarget; if (T) { c.x += (T.x - c.x) * Math.min(1, dt * 0.6); c.z += (T.z - c.z) * Math.min(1, dt * 0.6); if (Math.hypot(T.x - c.x, T.z - c.z) < 3) c.magnetT = 0; } }
      if (c.useItem) { c.useItem = false; useItem(c); }
      if (c.ai && c.item && state === 'race') { c.itemHold += dt; if (c.itemHold > c.aiUseAt) { if (c.item !== 'bag' || aheadOf(c)) useItem(c); else c.itemHold = 0; } }
      c.slipT = Math.max(0, (c.slipT || 0) - dt);
      for (let i = hazards.length - 1; i >= 0; i--) { const h = hazards[i]; const d = Math.hypot(c.x - h.x, c.z - h.z);
        if (h.type === 'puddle') { if (d < h.r) c.slipT = 0.35; continue; }
        if (h.owner === c && h.arm > 0) continue;
        if (c.remote) continue; // remote (guest) carts resolve sign/banana hits themselves and report them
        if (d < h.r + 0.4) { if (h.type === 'banana') { hit(c, h.owner); removeHazard(h); }
          else { c.v *= 0.55; G.puff(h.x, 0.6, h.z, 0xffd600, 5); if (c === G.player) { sound.bump(0.8); G.shakeIt(0.3); } removeHazard(h); } } }
    }
    for (let i = hazards.length - 1; i >= 0; i--) { const h = hazards[i]; h.arm -= dt; h.life -= dt; if (h.life <= 0 && !ev.objs.includes(h)) removeHazard(h); }
    for (let i = projs.length - 1; i >= 0; i--) { const p = projs[i]; p.life -= dt;
      if (p.target) { const want = Math.atan2(p.target.x - p.x, p.target.z - p.z); p.h += Math.max(-4 * dt, Math.min(4 * dt, ang(want - p.h))); }
      p.x += Math.sin(p.h) * 30 * dt; p.z += Math.cos(p.h) * 30 * dt; p.m.position.set(p.x, 1.2 + hAt(p.x, p.z), p.z); p.m.rotation.y += dt * 10;
      let done = p.life <= 0 || G.insideShelf(p.x, p.z);
      for (const c of carts) if (c !== p.owner && Math.hypot(c.x - p.x, c.z - p.z) < 1.7) { hit(c, p.owner); done = true; break; }
      if (done) { G.puff(p.x, 1.2, p.z, 0xff7043, 6); scene.remove(p.m); projs.splice(i, 1); } }
    for (const p of props) { p.mesh.position.copy(p.body.position); p.mesh.quaternion.copy(p.body.quaternion); }
    for (const c of carts) for (const p of props) { const b = p.body.position; if (Math.abs(b.x - c.x) < 1.4 && Math.abs(b.z - c.z) < 1.4) { c.v *= 0.99; if (p.body.sleepState) p.body.wakeUp(); } }
    if (state === 'race') updateEvents(dt, raceT);
    // obstacle list for AI avoidance
    obstacles.length = 0; obstacles.push(...fixedObs);
    for (const h of hazards) if (h.type !== 'puddle') obstacles.push({ x: h.x, z: h.z, r: 1.2 }); else obstacles.push({ x: h.x, z: h.z, r: h.r * 0.8 });
    if (obstacles.vip) obstacles.push({ x: obstacles.vip.x, z: obstacles.vip.z, r: 3.2 });
    if (obstacles.fork) obstacles.push({ x: obstacles.fork.x, z: obstacles.fork.z, r: 2 });
    if (G.extraObs) obstacles.push(...G.extraObs());
  }
  // ---------- network: host snapshot / guest mirror ----------
  function guestUpdate(dt) {
    const t = performance.now() / 1000, P = G.player;
    for (const b of boxes) { b.m.visible = b.cd <= 0; b.m.rotation.set(t * 0.7, t * 1.3, 0); b.m.position.y = 1.1 + b.y + Math.sin(t * 2 + b.x) * 0.15; }
    P.slipT = Math.max(0, (P.slipT || 0) - dt);
    for (const h of hazards) { h.arm -= dt; if (h.type === 'puddle' && Math.hypot(P.x - h.x, P.z - h.z) < h.r) P.slipT = 0.35; }
    for (const c of carts) c.shieldMesh.visible = (c.shieldT || 0) > 0;
    for (const p of projs) { p.m.position.set(p.x, 1.2 + hAt(p.x, p.z), p.z); p.m.rotation.y += dt * 10; }
    if (P.magnetT > 0) { P.magnetT -= dt; const T = P.magTarget; if (T) { P.x += (T.x - P.x) * Math.min(1, dt * 0.6); P.z += (T.z - P.z) * Math.min(1, dt * 0.6); } }
    for (const p of props) { const b = p.mesh.position; if (Math.abs(b.x - P.x) < 1.4 && Math.abs(b.z - P.z) < 1.4) P.v *= 0.99; }
    if (ev.vip && ev.vipT) { const V = ev.vip, k = Math.min(1, dt * 10); V.x += (ev.vipT[0] - V.x) * k; V.z += (ev.vipT[1] - V.z) * k; V.g.root.position.set(V.x, hAt(V.x, V.z), V.z); V.g.root.rotation.y = ev.vipT[2]; V.g.update(7, dt); }
    if (ev.fork && ev.forkT) { ev.fork.g.position.set(ev.forkT[0], hAt(ev.forkT[0], ev.forkT[1]), ev.forkT[1]); ev.fork.g.rotation.y = ev.forkT[2]; }
    if (ev.name === 'blackout') { ev.t += dt; setDim(ev.t < 0.6 ? (Math.random() < 0.5 ? 1 : 0.3) : 1); }
  }
  const r2 = v => Math.round(v * 100) / 100;
  function snap() {
    return { hz: hazards.map(h => [h.id, h.type, r2(h.x), r2(h.z), h.r]), pj: projs.map(p => [p.id, r2(p.x), r2(p.z)]), bx: boxes.map(b => b.cd > 0 ? 1 : 0),
      ev: ev.name ? { n: ev.name, i: ev.spotI, v: ev.vip ? [r2(ev.vip.x), r2(ev.vip.z), r2(ev.vip.h)] : null, f: ev.fork ? [r2(ev.fork.g.position.x), r2(ev.fork.g.position.z), r2(ev.fork.g.rotation.y)] : null } : null,
      pp: props.map(p => { const b = p.body; return [r2(b.position.x), r2(b.position.y), r2(b.position.z), r2(b.quaternion.x), r2(b.quaternion.y), r2(b.quaternion.z), r2(b.quaternion.w)]; }) };
  }
  let guestInit = false;
  function applySnap(S) {
    if (!guestInit) { guestInit = true; for (const p of props) world.removeBody(p.body); }
    const ids = new Set(S.hz.map(h => h[0]));
    for (let i = hazards.length - 1; i >= 0; i--) if (!ids.has(hazards[i].id)) removeHazard(hazards[i]);
    for (const [id, type, x, z, r] of S.hz) if (!hazards.find(h => h.id === id)) { const h = addHazard(type, x, z, 999, r, null); h.id = id; const P = G.player, behind = (x - P.x) * Math.sin(P.h) + (z - P.z) * Math.cos(P.h) < 0; h.arm = behind && Math.hypot(P.x - x, P.z - z) < 4 ? 0.6 : 0; } // own drops land behind
    const pids = new Set(S.pj.map(p => p[0]));
    for (let i = projs.length - 1; i >= 0; i--) if (!pids.has(projs[i].id)) { G.puff(projs[i].x, 1.2, projs[i].z, 0xff7043, 5); scene.remove(projs[i].m); projs.splice(i, 1); }
    for (const [id, x, z] of S.pj) { let p = projs.find(q => q.id === id); if (!p) { p = { id, m: new THREE.Mesh(bagG, bagM), x, z }; scene.add(p.m); projs.push(p); } p.x = x; p.z = z; }
    S.bx.forEach((v, i) => { if (boxes[i]) boxes[i].cd = v ? 1 : 0; });
    (S.pp || []).forEach((a, i) => { const p = props[i]; if (!p) return; p.mesh.position.set(a[0], a[1], a[2]); p.mesh.quaternion.set(a[3], a[4], a[5], a[6]); });
    if (S.ev && ev.name !== S.ev.n) {
      if (ev.name) endEvent();
      const before = new Set(hazards); startEvent(S.ev.n, S.ev.i);
      for (const h of [...hazards]) if (!before.has(h)) removeHazard(h); // event hazards come from the host mirror instead
      ev.objs = ev.objs.filter(o => !o.type);
    } else if (!S.ev && ev.name) endEvent();
    if (S.ev) { ev.vipT = S.ev.v; ev.forkT = S.ev.f; }
  }
  function reset() { if (ev.name) endEvent(); for (const h of [...hazards]) removeHazard(h); for (const p of projs) scene.remove(p.m); projs.length = 0; for (const b of boxes) b.cd = 0; ev.next = 18 + Math.random() * 8; for (const c of carts) { c.shieldT = 0; c.magnetT = 0; c.item = null; } }
  function remoteHazardHit(c, id, shielded) { const h = hazards.find(h => h.id === id); if (!h) return; if (shielded) c.shieldT = 0; removeHazard(h); }
  return { remoteHazardHit, addHazard, update, snap, applySnap, reset, EVN, skid, useItem, obstacles, hazards, projs, boxes, props, ev, startEvent, ITEMS };
}
