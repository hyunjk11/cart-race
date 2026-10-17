import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
// Map system: each map is a rectilinear closed loop of vertices (travel order) with per-map aisle half-width,
// corner radius, wall style, zones (ice / moving walkway / speed bumps / escalator), elevation and obstacles.
export const SD = 1.6, SH = 3.2, LAPS = 3;
export let HW = 6, MAP = null, MAP_ID = 'mart';
export const path = [], strips = [];

const clamp01 = v => Math.max(0, Math.min(1, v));
export const MAPS = {
  mart: {
    name: '일반 매장', icon: '🛒', desc: '선반 사이를 달리는 기본 매장. 상품을 쏟고 손님을 피해라!',
    verts: [[-50, -30], [50, -30], [50, 30], [-50, 30]], hw: 6, r: 8, wall: 'shelf', floor: ['#e8e4da', '#d4cfc2'], decor: 'aisles',
    theme: { bg: 0xbfd4e6, fog: [40, 110], hemi: 1.25, dl: 1.2, dl2: 0.5, light: 0xffffff, ceil: 6.5 },
    kinds: ['cereal', 'bottle', 'can', 'tp', 'egg'], spill: [0, 1, 2, 3, 4, 5, 6],
    signs: [[0.1, '과자·음료'], [0.3, '신선식품'], [0.55, '생활용품'], [0.8, '라면 대전'], [0.42, '오늘의 특가'], [0.68, '1+1 행사'], [0.93, '반값 할인']],
    displays: [{ t: 'pyramid', f: 0.12 }, { t: 'water', f: 0.24 }, { t: 'pyramid', f: 0.36 }, { t: 'stand', f: 0.6, label: '수박 특가' }, { t: 'pyramid', f: 0.66 }, { t: 'water', f: 0.84 }, { t: 'stand', f: 0.9, label: '제철 과일', n: 3 }],
    pyrLabel: '통조림 특가', zones: [],
  },
  freezer: {
    name: '냉동 코너', icon: '🧊', desc: '꽁꽁 언 바닥은 미끄럽고, 냉동고 문이 갑자기 열린다!',
    verts: [[-55, -30], [30, -30], [30, -6], [55, -6], [55, 30], [-12, 30], [-12, 10], [-55, 10]], hw: 6, r: 6, wall: 'freezer', floor: ['#e6f2fb', '#d2e4f2'],
    theme: { bg: 0xd6ecfa, fog: [18, 75], fogCol: 0xe8f6ff, hemi: 1.15, dl: 0.9, dl2: 0.7, light: 0xd8f0ff, ceil: 6 },
    kinds: ['tub', 'pizza', 'icebag', 'dumpling', 'pop'], spill: [7, 8, 9, 2, 10],
    signs: [[0.08, '아이스크림'], [0.28, '냉동만두'], [0.5, '얼음·빙수'], [0.7, '냉동피자'], [0.88, '❄ 냉동식품 ❄']],
    displays: [{ t: 'stand', f: 0.14, label: '아이스크림 1+1', fruit: 'tub' }, { t: 'pyramid', f: 0.33 }, { t: 'water', f: 0.56 }, { t: 'stand', f: 0.8, label: '빙수 재료', fruit: 'tub', n: 3 }],
    pyrLabel: '냉동 특가', waterCol: 0xe3f6ff, doors: true,
    zones: [{ t: 'ice', x0: 0, x1: 22, z0: -36, z1: -24 }, { t: 'ice', x0: 49, x1: 61, z0: 2, z1: 22 }, { t: 'ice', x0: -46, x1: -20, z0: 4, z1: 16 }, { t: 'ice', x0: -61, x1: -49, z0: -20, z1: 0 }],
  },
  parking: {
    name: '지하 주차장', icon: '🅿️', desc: '넓은 코너, 기둥과 주차된 차, 과속방지턱, 경사로. 지나가는 차 조심!',
    verts: [[-60, -36], [60, -36], [60, 36], [-60, 36]], hw: 10, r: 14, wall: 'wall', floor: ['#4b4f55', '#45494f'],
    theme: { bg: 0x2a2e35, fog: [25, 95], hemi: 0.95, dl: 0.55, dl2: 0.35, light: 0xe8f4ff, ceil: 5 },
    kinds: [], spill: [0, 1, 2, 3, 6], pyrLabel: '카트 보관소', waterCol: 0xbcaaa4,
    signs: [[0.1, 'B1 주차장'], [0.3, '출구 →'], [0.5, '마트 입구 ↑'], [0.72, '서행 10km'], [0.9, '카트 보관소']],
    displays: [{ t: 'water', f: 0.22 }, { t: 'pyramid', f: 0.58 }, { t: 'water', f: 0.86 }],
    yAt: (x, z) => x > 48 ? 2.4 * clamp01(1 - Math.abs(z) / 18) : 0,
    ramps: [{ x0: 48, x1: 72, z0: -18, z1: 0, y0: 0, y1: 2.4 }, { x0: 48, x1: 72, z0: 0, z1: 18, y0: 2.4, y1: 0 }],
    traffic: true,
    zones: [{ t: 'bump', x0: 24.6, x1: 25.4, z0: -46, z1: -26 }, { t: 'bump', x0: -0.4, x1: 0.4, z0: 26, z1: 46 }, { t: 'bump', x0: -32.4, x1: -31.6, z0: 26, z1: 46 }, { t: 'bump', x0: -70, x1: -50, z0: -0.4, z1: 0.4 }],
    obs(add) { // pillars (slalom) and parked cars along the outer wall
      const out = -MAP.inSign;
      for (let i = 0, k = 0; i < path.length; i++) {
        if (i < 6 || i > path.length - 10 || !straightAt(i, 7)) continue;
        if (i % 11 === 0) { const p = atLane(i, (k++ % 2 ? 2.5 : -4.2) * out * -1); add({ x0: p.x - 0.7, x1: p.x + 0.7, z0: p.z - 0.7, z1: p.z + 0.7, kind: 'pillar' }); }
        else if (i % 22 === 6) { const p = atLane(i, out * (HW - 1.25)), [tx] = tangentAt(i), ax = Math.abs(tx) > 0.5; add({ x0: p.x - (ax ? 2.1 : 1), x1: p.x + (ax ? 2.1 : 1), z0: p.z - (ax ? 1 : 2.1), z1: p.z + (ax ? 1 : 2.1), kind: 'car', col: [0xd32f2f, 0x1976d2, 0xeeeeee, 0x424242, 0xfbc02d][i % 5] }); }
      }
    },
  },
  skywalk: {
    name: '2층 무빙워크', icon: '🛗', desc: '무빙워크 경사로로 2층까지! 에스컬레이터 옆 지름길을 노려라.',
    verts: [[-50, -28], [50, -28], [50, 28], [14, 28], [14, 8], [-14, 8], [-14, 28], [-50, 28]], hw: 6, r: 6, wall: 'rail', floor: ['#f3efe8', '#e4ddd2'], win: 42,
    theme: { bg: 0xf0e6da, fog: [45, 120], hemi: 1.3, dl: 1.1, dl2: 0.6, light: 0xfff6e0, ceil: 6.5 },
    kinds: [], spill: [0, 1, 2, 4, 5, 6], pyrLabel: '2층 특가',
    signs: [[0.08, '1F 식품관'], [0.27, '무빙워크 ↗'], [0.45, '2F 의류·잡화'], [0.6, '에스컬레이터 지름길 →'], [0.88, '1F로 내려가기 ↘']],
    displays: [{ t: 'pyramid', f: 0.12 }, { t: 'water', f: 0.42 }, { t: 'stand', f: 0.76, label: '2층 과일가게' }],
    yAt: (x, z) => Math.abs(x) < 44 ? (z > 1 ? 4 : 0) : 4 * clamp01((z + 10) / 25),
    decks: [{ x0: -58, x1: 58, z0: 15, z1: 40, y: 4 }, { x0: -44, x1: 44, z0: 1, z1: 15, y: 4 }],
    ramps: [{ x0: 44, x1: 58, z0: -10, z1: 15, y0: 0, y1: 4 }, { x0: -58, x1: -44, z0: -10, z1: 15, y0: 0, y1: 4 }],
    open: [{ x0: -9, x1: 9, z0: 23.9, z1: 32.1 }], camOpen: [{ x0: -16, x1: 16, z0: 22, z1: 34 }],
    extra: [{ x0: -8, x1: 8, z0: 22.4, z1: 24, nx: 0, nz: 1, kind: 'rail' }, { x0: -8, x1: 8, z0: 32, z1: 33.6, nx: 0, nz: -1, kind: 'rail' }],
    zones: [{ t: 'walk', x0: 47.5, x1: 52.5, z0: -10, z1: 15, dx: 0, dz: 1 }, { t: 'walk', x0: -52.5, x1: -47.5, z0: -10, z1: 15, dx: 0, dz: -1 },
      { t: 'walk', x0: -10, x1: 10, z0: 6, z1: 10, dx: -1, dz: 0 }, { t: 'esc', x0: -8, x1: 8, z0: 24, z1: 32, dx: -1, dz: 0 }],
  },
};
export const MAP_IDS = Object.keys(MAPS);
export const hAt = (x, z) => MAP.yAt ? MAP.yAt(x, z) : 0;
export const inRect = (r, x, z) => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1;
export const zoneAt = (x, z) => { for (const zn of MAP.zones) if (inRect(zn, x, z)) return zn; return null; };
export function tangentAt(i) { const N = path.length; i = ((i % N) + N) % N; const p = path[i], q = path[(i + 1) % N]; const tx = q.x - p.x, tz = q.y - p.y, l = Math.hypot(tx, tz) || 1; return [tx / l, tz / l]; }
export function atLane(i, lat) { const N = path.length; i = ((Math.round(i) % N) + N) % N; const p = path[i], [tx, tz] = tangentAt(i); return { x: p.x - tz * lat, z: p.y + tx * lat }; }
export function straightAt(i, k = 3) { const [a, b] = tangentAt(i - k), [c, d] = tangentAt(i + k); return a * c + b * d > 0.999 && (Math.abs(a) > 0.999 || Math.abs(b) > 0.999); }

export function setMap(id) {
  MAP_ID = MAPS[id] ? id : 'mart'; MAP = MAPS[MAP_ID]; HW = MAP.hw; const V = MAP.verts, n = V.length, R = MAP.r;
  let A = 0; for (let i = 0; i < n; i++) { const a = V[i], b = V[(i + 1) % n]; A += a[0] * b[1] - b[0] * a[1]; } MAP.inSign = Math.sign(A);
  const dir = i => { const a = V[(i + n) % n], b = V[(i + 1 + n) % n], l = Math.hypot(b[0] - a[0], b[1] - a[1]); return [(b[0] - a[0]) / l, (b[1] - a[1]) / l]; };
  // centerline: rounded corners (6 arc samples) + straights sampled every ~2m
  const pts = [];
  for (let i = 0; i < n; i++) {
    const v = V[i], di = dir(i - 1), dO = dir(i), S = [v[0] - di[0] * R, v[1] - di[1] * R], E = [v[0] + dO[0] * R, v[1] + dO[1] * R], C = [S[0] + dO[0] * R, S[1] + dO[1] * R];
    const a0 = Math.atan2(S[1] - C[1], S[0] - C[0]); let a1 = Math.atan2(E[1] - C[1], E[0] - C[0]); let da = a1 - a0; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
    for (let k = 0; k < 6; k++) { const t = a0 + da * k / 6; pts.push(new THREE.Vector2(C[0] + Math.cos(t) * R, C[1] + Math.sin(t) * R)); }
    const w = V[(i + 1) % n], S2 = [w[0] - dO[0] * R, w[1] - dO[1] * R], L = Math.hypot(S2[0] - E[0], S2[1] - E[1]), m = Math.max(1, Math.round(L / 2));
    for (let k = 0; k < m; k++) pts.push(new THREE.Vector2(E[0] + (S2[0] - E[0]) * k / m, E[1] + (S2[1] - E[1]) * k / m));
  }
  const st = MAP.start || [(V[0][0] + V[1][0]) / 2, (V[0][1] + V[1][1]) / 2];
  let i0 = 0, best = 1e9; pts.forEach((p, i) => { const d = Math.hypot(p.x - st[0], p.y - st[1]); if (d < best) { best = d; i0 = i; } });
  path.length = 0; path.push(...pts.slice(i0), ...pts.slice(0, i0));
  // walls: inner/outer offset polygons (miter), each edge becomes an AABB strip SD thick on the solid side
  const nin = i => { const d = dir(i); return [MAP.inSign * -d[1], MAP.inSign * d[0]]; };
  const distPoly = (x, z) => { let b = 1e9; for (let i = 0; i < n; i++) { const a = V[i], c = V[(i + 1) % n]; const ex = c[0] - a[0], ez = c[1] - a[1], t = clamp01(((x - a[0]) * ex + (z - a[1]) * ez) / (ex * ex + ez * ez)); b = Math.min(b, Math.hypot(x - a[0] - ex * t, z - a[1] - ez * t)); } return b; };
  const out = [];
  for (const side of [1, -1]) { // 1 = inner boundary (solid toward interior), -1 = outer
    const P = V.map((v, i) => { const a = nin(i - 1), b = nin(i); return [v[0] + side * HW * (a[0] + b[0]), v[1] + side * HW * (a[1] + b[1])]; });
    for (let i = 0; i < n; i++) {
      const p = P[i], q = P[(i + 1) % n], ni = nin(i), m = [ni[0] * side, ni[1] * side], d = dir(i);
      let e0 = 0, e1 = 0; // extend to close corners when the extension stays in solid
      const ok = (px, pz) => distPoly(px, pz) > HW + 0.2;
      if (ok(p[0] - d[0] * SD / 2 + m[0] * SD / 2, p[1] - d[1] * SD / 2 + m[1] * SD / 2)) e0 = SD;
      if (ok(q[0] + d[0] * SD / 2 + m[0] * SD / 2, q[1] + d[1] * SD / 2 + m[1] * SD / 2)) e1 = SD;
      const a = [p[0] - d[0] * e0, p[1] - d[1] * e0], b = [q[0] + d[0] * e1, q[1] + d[1] * e1];
      const xs = [a[0], b[0], a[0] + m[0] * SD, b[0] + m[0] * SD], zs = [a[1], b[1], a[1] + m[1] * SD, b[1] + m[1] * SD];
      out.push({ x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs), nx: -m[0], nz: -m[1], kind: MAP.wall, outer: side < 0 });
    }
  }
  // carve openings (shortcuts)
  let res = out;
  for (const r of MAP.open || []) { const nr = [];
    for (const s of res) { const hit = s.x1 > r.x0 && s.x0 < r.x1 && s.z1 > r.z0 && s.z0 < r.z1; if (!hit) { nr.push(s); continue; }
      const alongX = s.x1 - s.x0 > s.z1 - s.z0;
      if (alongX) { if (s.x0 < r.x0 - 0.2) nr.push({ ...s, x1: r.x0 }); if (s.x1 > r.x1 + 0.2) nr.push({ ...s, x0: r.x1 }); }
      else { if (s.z0 < r.z0 - 0.2) nr.push({ ...s, z1: r.z0 }); if (s.z1 > r.z1 + 0.2) nr.push({ ...s, z0: r.z1 }); } }
    res = nr; }
  strips.length = 0; strips.push(...res, ...(MAP.extra || []).map(s => ({ ...s })));
  if (MAP.obs) MAP.obs(s => strips.push({ nx: 0, nz: 0, ...s }));
  const xs = V.map(v => v[0]), zs = V.map(v => v[1]), pad = HW + SD + 1;
  MAP.bounds = { x0: Math.min(...xs) - pad, x1: Math.max(...xs) + pad, z0: Math.min(...zs) - pad, z1: Math.max(...zs) + pad };
  return MAP;
}

export function textSprite(text, bg) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 128; const g = c.getContext('2d');
  g.fillStyle = bg; if (g.roundRect) { g.beginPath(); g.roundRect(4, 4, 504, 120, 34); g.fill(); g.lineWidth = 6; g.strokeStyle = 'rgba(255,255,255,.85)'; g.stroke(); } else g.fillRect(0, 0, 512, 128); g.fillStyle = '#fff'; g.font = "64px Jua, 'Malgun Gothic', sans-serif"; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 8; g.strokeStyle = 'rgba(0,0,0,.28)'; g.strokeText(text, 256, 70, 470); g.fillText(text, 256, 70, 470);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Sprite(new THREE.SpriteMaterial({ map: t }));
}
function canvasTex(w, h, draw, rep) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; if (rep) t.repeat.set(rep[0], rep[1]); t.colorSpace = THREE.SRGBColorSpace; return t; }
// quad following the floor height at its 4 corners; v runs along (dx,dz)
function floorQuad(r, lift, vRep = 1, uRep = 1, dx = 0, dz = 1) {
  const C = [[r.x0, r.z0], [r.x1, r.z0], [r.x1, r.z1], [r.x0, r.z1]], pos = [], uv = [];
  const L = Math.abs(dx) > 0.5 ? r.x1 - r.x0 : r.z1 - r.z0;
  for (const [x, z] of C) { pos.push(x, hAt(Math.min(Math.max(x, r.x0 + 0.01), r.x1 - 0.01), Math.min(Math.max(z, r.z0 + 0.01), r.z1 - 0.01)) + lift, z);
    const along = Math.abs(dx) > 0.5 ? (x - r.x0) * Math.sign(dx) : (z - r.z0) * Math.sign(dz), across = Math.abs(dx) > 0.5 ? z - r.z0 : x - r.x0;
    uv.push(across / (Math.abs(dx) > 0.5 ? r.z1 - r.z0 : r.x1 - r.x0) * uRep, along / L * vRep); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex([0, 2, 1, 0, 3, 2]); g.computeVertexNormals(); if (g.attributes.normal.getY(0) < 0) g.setIndex([0, 1, 2, 0, 2, 3]); g.computeVertexNormals(); return g;
}

const KINDS = {
  cereal: { g: () => new THREE.BoxGeometry(0.38, 0.6, 0.18), cols: [0xffb300, 0xe53935, 0x1e88e5, 0x8e24aa], sy: [0.8, 1.2] },
  bottle: { g: () => new THREE.CylinderGeometry(0.09, 0.11, 0.55, 8), cols: [0x43a047, 0x00acc1, 0xffffff, 0xd81b60], sy: [0.8, 1.1] },
  can: { g: () => new THREE.CylinderGeometry(0.16, 0.16, 0.36, 10), cols: [0xd32f2f, 0xfdd835, 0x546e7a], sy: [0.9, 1.0] },
  tp: { g: () => new THREE.CylinderGeometry(0.17, 0.17, 0.3, 10), cols: [0xffffff, 0xf5f5f5], sy: [1, 1] },
  egg: { g: () => new THREE.BoxGeometry(0.5, 0.16, 0.3), cols: [0xd7ccc8, 0xffecb3], sy: [1, 1] },
  tub: { g: () => new THREE.CylinderGeometry(0.2, 0.16, 0.24, 12), cols: [0xf8bbd0, 0xfff9c4, 0x8d6e63, 0xc8e6c9], sy: [0.9, 1.1] },
  pizza: { g: () => new THREE.BoxGeometry(0.5, 0.08, 0.45), cols: [0xe53935, 0xffa000, 0x6d4c41], sy: [1, 1.4] },
  icebag: { g: () => new THREE.BoxGeometry(0.42, 0.5, 0.22), cols: [0xb3e5fc, 0xe1f5fe], sy: [0.8, 1.1] },
  dumpling: { g: () => new THREE.BoxGeometry(0.4, 0.3, 0.12), cols: [0x1565c0, 0xd84315, 0x2e7d32], sy: [0.9, 1.2] },
  pop: { g: () => new THREE.BoxGeometry(0.12, 0.42, 0.06), cols: [0xff7043, 0xab47bc, 0x26c6da, 0xffee58], sy: [0.9, 1.1] },
};

export function buildWorld(scene, world, opt = {}) {
  const M = MAP, T = M.theme, root = new THREE.Group(); scene.add(root); const bodies = [], ticks = [], doors = [];
  const add = o => { root.add(o); return o; }, addBody = b => { world.addBody(b); bodies.push(b); return b; };
  const box = (w, h, d, mat, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); return add(m); };
  const staticBox = (w, h, d, x, y, z, q) => { const b = new CANNON.Body({ mass: 0, shape: new CANNON.Box(new CANNON.Vec3(w / 2, h / 2, d / 2)) }); b.position.set(x, y, z); if (q) b.quaternion.copy(q); return addBody(b); };
  const lm = c => new THREE.MeshLambertMaterial({ color: c });
  const B = M.bounds, W = B.x1 - B.x0 + 30, D = B.z1 - B.z0 + 30, cx0 = (B.x0 + B.x1) / 2, cz0 = (B.z0 + B.z1) / 2;
  // floor
  const ftex = canvasTex(128, 128, (g) => { g.fillStyle = M.floor[0]; g.fillRect(0, 0, 128, 128); g.fillStyle = M.floor[1]; g.fillRect(0, 0, 64, 64); g.fillRect(64, 64, 64, 64);
    if (M.wall === 'wall') { for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(255,255,255,${Math.random() * 0.06})`; g.fillRect(Math.random() * 128, Math.random() * 128, 2, 2); } } }, [W / 2, D / 2]);
  const floorMat = new THREE.MeshLambertMaterial({ map: ftex });
  const floor = add(new THREE.Mesh(new THREE.PlaneGeometry(W, D), floorMat)); floor.rotation.x = -Math.PI / 2; floor.position.set(cx0, 0, cz0);
  const ground = new CANNON.Body({ mass: 0, shape: new CANNON.Plane() }); ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0); addBody(ground);
  // elevated decks & ramps
  const deckMat = lm(0xe9e2d6), deckSide = lm(0xb0a596), pillarM = lm(0xcfc6b8);
  for (const d of M.decks || []) { const w = d.x1 - d.x0, dd = d.z1 - d.z0, x = (d.x0 + d.x1) / 2, z = (d.z0 + d.z1) / 2;
    const top = add(new THREE.Mesh(floorQuad(d, 0.001, dd / 2, w / 2), new THREE.MeshLambertMaterial({ map: ftex.clone() }))); top.material.map.repeat.set(1, 1); top.material.map.needsUpdate = true;
    box(w, 0.4, dd, deckSide, x, d.y - 0.2, z); staticBox(w, 0.4, dd, x, d.y - 0.2, z);
    for (let px = d.x0 + 4; px < d.x1; px += 12) for (let pz = d.z0 + 3; pz < d.z1; pz += 10) box(0.6, d.y, 0.6, pillarM, px, d.y / 2, pz); }
  for (const r of M.ramps || []) { const w = r.x1 - r.x0, L = r.z1 - r.z0, rise = r.y1 - r.y0, ang = Math.atan2(rise, L), len = Math.hypot(L, rise), x = (r.x0 + r.x1) / 2, z = (r.z0 + r.z1) / 2;
    const m = box(w, 0.4, len, M.wall === 'wall' ? lm(0x55595f) : deckSide, x, (r.y0 + r.y1) / 2 - 0.2 / Math.cos(ang), z); m.rotation.x = -ang;
    const q = new CANNON.Quaternion(); q.setFromEuler(-ang, 0, 0); staticBox(w, 0.4, len, x, (r.y0 + r.y1) / 2 - 0.2 / Math.cos(ang), z, q);
    add(new THREE.Mesh(floorQuad(r, 0.005, L / 2, w / 2), new THREE.MeshLambertMaterial({ map: ftex.clone() }))).material.map.needsUpdate = true; }
  // zones: ice patches, moving walkways, speed bumps, escalator steps
  const iceTex = canvasTex(128, 128, g => { g.fillStyle = 'rgba(200,235,255,0.75)'; g.fillRect(0, 0, 128, 128); g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 2; for (let i = 0; i < 9; i++) { g.beginPath(); const x = Math.random() * 128, y = Math.random() * 128; g.moveTo(x, y); g.lineTo(x + Math.random() * 40 - 20, y + Math.random() * 40 - 20); g.stroke(); } });
  const iceMat = new THREE.MeshLambertMaterial({ map: iceTex, transparent: true, opacity: 0.85, emissive: 0x223344, depthWrite: false });
  const beltTex = canvasTex(64, 64, g => { g.fillStyle = '#37474f'; g.fillRect(0, 0, 64, 64); g.fillStyle = '#4fc3f7'; g.beginPath(); g.moveTo(32, 8); g.lineTo(54, 34); g.lineTo(42, 34); g.lineTo(42, 56); g.lineTo(22, 56); g.lineTo(22, 34); g.lineTo(10, 34); g.closePath(); g.fill(); });
  const beltMat = new THREE.MeshLambertMaterial({ map: beltTex, emissive: 0x112233 });
  const stepTex = canvasTex(64, 64, g => { g.fillStyle = '#90a4ae'; g.fillRect(0, 0, 64, 64); g.fillStyle = '#607d8b'; for (let y = 0; y < 64; y += 8) g.fillRect(0, y, 64, 3); g.fillStyle = '#ffd600'; g.fillRect(0, 0, 4, 64); g.fillRect(60, 0, 4, 64); });
  const stepMat = new THREE.MeshLambertMaterial({ map: stepTex });
  const bumpY = lm(0xfdd835), bumpK = lm(0x212121);
  for (const zn of M.zones) {
    const w = zn.x1 - zn.x0, d = zn.z1 - zn.z0;
    if (zn.t === 'ice') add(new THREE.Mesh(floorQuad(zn, 0.015, d / 6, w / 6), iceMat));
    else if (zn.t === 'walk') { const L = Math.abs(zn.dx) > 0.5 ? w : d; const m = add(new THREE.Mesh(floorQuad(zn, 0.02, L / 2.5, 1, zn.dx, zn.dz), beltMat));
      for (const s of [-1, 1]) { const rr = Math.abs(zn.dx) > 0.5 ? { x0: zn.x0, x1: zn.x1, z0: s < 0 ? zn.z0 - 0.3 : zn.z1, z1: s < 0 ? zn.z0 : zn.z1 + 0.3 } : { x0: s < 0 ? zn.x0 - 0.3 : zn.x1, x1: s < 0 ? zn.x0 : zn.x1 + 0.3, z0: zn.z0, z1: zn.z1 }; add(new THREE.Mesh(floorQuad(rr, 0.03), bumpY)); } }
    else if (zn.t === 'esc') add(new THREE.Mesh(floorQuad(zn, 0.02, (Math.abs(zn.dx) > 0.5 ? w : d) / 2, 1, zn.dx, zn.dz), stepMat));
    else if (zn.t === 'bump') { const ax = w > d, len = ax ? w : d, y = hAt((zn.x0 + zn.x1) / 2, (zn.z0 + zn.z1) / 2);
      for (let k = 0; k < len / 1.2; k++) { const o = -len / 2 + 0.6 + k * 1.2, m = box(ax ? 1.2 : 0.8, 0.12, ax ? 0.8 : 1.2, k % 2 ? bumpK : bumpY, (zn.x0 + zn.x1) / 2 + (ax ? o : 0), y + 0.06, (zn.z0 + zn.z1) / 2 + (ax ? 0 : o)); } }
  }
  ticks.push(dt => { beltTex.offset.y -= dt * 1.6; stepTex.offset.y -= dt * 0.8; });
  // parking: painted lane dashes along the centerline + bay lines
  if (M.wall === 'wall') { const dash = new THREE.MeshBasicMaterial({ color: 0xf9a825 });
    for (let i = 0; i < path.length; i += 2) { if (!straightAt(i, 2)) continue; const p = path[i], [tx, tz] = tangentAt(i), m = box(Math.abs(tx) > 0.5 ? 1.6 : 0.15, 0.02, Math.abs(tx) > 0.5 ? 0.15 : 1.6, dash, p.x, hAt(p.x, p.y) + 0.012, p.y); } }
  // ceiling light bars across the aisle
  const lightMat = new THREE.MeshBasicMaterial({ color: T.light });
  for (let i = 0; i < path.length; i += 5) { const p = path[i], [tx] = tangentAt(i), ax = Math.abs(tx) > 0.5; box(ax ? 0.5 : 2 * HW - 2, 0.08, ax ? 2 * HW - 2 : 0.5, lightMat, p.x, hAt(p.x, p.y) + T.ceil, p.y); }
  // walls
  const frameMat = lm(0x8a96a3), boardMat = lm(0xcfd6dd), whiteM = lm(0xf4f8fb), innerBlue = lm(0x9ec9e6), glassM = new THREE.MeshLambertMaterial({ color: 0xcfefff, transparent: true, opacity: 0.32, depthWrite: false, emissive: 0x335566 });
  const concM = lm(0x8e9196), stripeY = lm(0xf9a825), metalM = lm(0x9e9e9e), railGlass = new THREE.MeshLambertMaterial({ color: 0xbfe8ff, transparent: true, opacity: 0.35, depthWrite: false }), capBlue = new THREE.MeshBasicMaterial({ color: 0x81d4fa });
  const items = [];
  const doorMat = new THREE.MeshLambertMaterial({ color: 0xe0f7ff, transparent: true, opacity: 0.6, emissive: 0x224455 }), doorFrame = lm(0xb0bec5);
  for (const st of strips) {
    const w = st.x1 - st.x0, d = st.z1 - st.z0, cx = (st.x0 + st.x1) / 2, cz = (st.z0 + st.z1) / 2, along = w > d, len = Math.max(w, d);
    const y0 = Math.max(hAt(st.x0 + 0.01, st.z0 + 0.01), hAt(st.x1 - 0.01, st.z1 - 0.01), hAt(cx, cz));
    const faceX = st.nx > 0 ? st.x1 : st.x0, faceZ = st.nz > 0 ? st.z1 : st.z0;
    let top = SH;
    if (st.kind === 'shelf' || st.kind === 'freezer') {
      const fr = st.kind === 'freezer';
      top = fr ? 2.6 : SH;
      const back = box(st.nx ? 0.15 : w, top, st.nx ? d : 0.15, fr ? innerBlue : frameMat, cx - st.nx * (d > w ? w / 2 - 0.1 : 0), y0 + top / 2, cz - st.nz * (w > d ? d / 2 - 0.1 : 0));
      const H = fr ? [0.15, 0.9, 1.65, top] : [0.15, 1.1, 2.05, SH];
      for (const h of H) box(w, 0.08, d, fr ? whiteM : boardMat, cx, y0 + h, cz);
      if (fr) { box(w, 0.25, d, whiteM, cx, y0 + top + 0.1, cz); box(along ? w : 0.06, 0.06, along ? 0.06 : d, capBlue, along ? cx : faceX + st.nx * 0.03, y0 + top - 0.1, along ? faceZ + st.nz * 0.03 : cz);
        const gl = box(along ? w : 0.03, top - 0.3, along ? 0.03 : d, glassM, along ? cx : faceX - st.nx * 0.05, y0 + top / 2, along ? faceZ - st.nz * 0.05 : cz); gl.renderOrder = 2; }
      if (!st.nx && !st.nz) continue;
      for (let a = 0.4; a < len - 0.3; a += 0.55) for (const h of (fr ? [0.19, 0.94, 1.69] : [0.19, 1.14, 2.09])) {
        if (Math.random() < 0.12) continue;
        items.push([along ? st.x0 + a : cx + st.nx * 0.3, y0 + h, along ? cz + st.nz * 0.3 : st.z0 + a]); }
      if (!fr) { const tagM = new THREE.MeshBasicMaterial({ color: 0xfff176 }), redM = new THREE.MeshBasicMaterial({ color: 0xe53935 });
        for (const h of [0.12, 1.07, 2.02]) box(along ? w : 0.02, 0.14, along ? 0.02 : d, tagM, along ? cx : faceX + st.nx * 0.01, y0 + h, along ? faceZ + st.nz * 0.01 : cz);
        for (let a = 3; a < len; a += 9) box(along ? 0.5 : 0.03, 0.3, along ? 0.03 : 0.5, redM, along ? st.x0 + a : faceX + st.nx * 0.02, y0 + 1.0, along ? faceZ + st.nz * 0.02 : st.z0 + a); }
      // freezer doors that pop open (outer cases, long straights)
      if (fr && M.doors && st.outer && len > 14) for (let a = 5; a < len - 4; a += 8.5) {
        const px = along ? st.x0 + a : faceX, pz = along ? faceZ : st.z0 + a;
        if (Math.hypot(px - path[0].x, pz - path[0].y) < 12) continue;
        let nearCorner = false; for (const v of M.verts) if (Math.hypot(px - v[0], pz - v[1]) < HW + 7) nearCorner = true; if (nearCorner) continue;
        const pivot = new THREE.Group(); pivot.position.set(along ? px - 0.6 : px + st.nx * 0.02, y0, along ? pz + st.nz * 0.02 : pz - 0.6); add(pivot);
        const pane = new THREE.Mesh(new THREE.BoxGeometry(along ? 1.2 : 0.06, 2.1, along ? 0.06 : 1.2), doorMat); pane.position.set(along ? 0.6 : 0, 1.15, along ? 0 : 0.6); pivot.add(pane);
        const fb = new THREE.Mesh(new THREE.BoxGeometry(along ? 1.2 : 0.08, 0.1, along ? 0.08 : 1.2), doorFrame); fb.position.copy(pane.position); fb.position.y = 2.2; pivot.add(fb);
        const ds = { x0: along ? px - 0.6 : Math.min(px, px + st.nx * 1.3), x1: along ? px + 0.6 : Math.max(px, px + st.nx * 1.3), z0: along ? Math.min(pz, pz + st.nz * 1.3) : pz - 0.6, z1: along ? Math.max(pz, pz + st.nz * 1.3) : pz + 0.6, nx: 0, nz: 0, kind: 'door', off: true };
        // swing direction: open toward the aisle
        const openRot = along ? -st.nz * Math.PI / 2 : st.nx * Math.PI / 2;
        doors.push({ pivot, strip: ds, openRot, ang: 0, phase: Math.random() * 9, period: 6 + Math.random() * 4, x: (ds.x0 + ds.x1) / 2, z: (ds.z0 + ds.z1) / 2 });
      }
    } else if (st.kind === 'wall') { top = 1.2; box(w, 1.2, d, concM, cx, y0 + 0.6, cz); box(along ? w : 0.02, 0.25, along ? 0.02 : d, stripeY, along ? cx : faceX + st.nx * 0.01, y0 + 0.95, along ? faceZ + st.nz * 0.01 : cz); }
    else if (st.kind === 'rail') { top = 1.1; const y1 = y0; if (y1 > 0.05) box(w, y1, d, deckSide, cx, y1 / 2, cz);
      box(w, 1.0, d, railGlass, cx, y1 + 0.5, cz).renderOrder = 2; box(along ? w : 0.12, 0.1, along ? 0.12 : d, metalM, cx, y1 + 1.05, cz); }
    else if (st.kind === 'pillar') { top = 6; box(w, 6, d, concM, cx, 3, cz); for (let k = 0; k < 3; k++) box(w + 0.04, 0.22, d + 0.04, k % 2 ? bumpK : stripeY, cx, 0.2 + k * 0.22, cz); }
    else if (st.kind === 'car') { top = 1.5; const cm = lm(st.col || 0x1976d2); box(w, 0.75, d, cm, cx, y0 + 0.65, cz); box(along ? w * 0.55 : w * 0.9, 0.55, along ? d * 0.9 : d * 0.55, new THREE.MeshLambertMaterial({ color: 0x263238 }), cx, y0 + 1.28, cz);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const wh = box(0.3, 0.6, 0.6, bumpK, cx + sx * (w / 2 - (along ? 0.6 : 0.05)), y0 + 0.3, cz + sz * (d / 2 - (along ? 0.05 : 0.6))); wh.scale.set(along ? 2 : 1, 1, along ? 1 : 0.5); } }
    staticBox(w, y0 + top, d, cx, (y0 + top) / 2, cz);
  }
  // shelf products: instanced per kind
  const kinds = (M.kinds || []).map(k => ({ ...KINDS[k], g: KINDS[k].g() }));
  const buckets = kinds.map(() => []);
  if (kinds.length) items.forEach((p, i) => { const k = (Math.floor(i / 7) + (p[1] % 1.5 < 0.5 ? 3 : 0)) % kinds.length; p.push(k, buckets[k].length); buckets[k].push(p); });
  const m4 = new THREE.Matrix4(), col = new THREE.Color();
  const meshes = kinds.map((K, k) => { const im = new THREE.InstancedMesh(K.g, new THREE.MeshLambertMaterial(), Math.max(1, buckets[k].length)); K.g.computeBoundingBox();
    // low quality draws every other product (random draws still consumed so the seeded store stays identical across clients)
    let j = 0; buckets[k].forEach((p, i) => { const sy = K.sy[0] + Math.random() * (K.sy[1] - K.sy[0]), hh = K.g.boundingBox.max.y * sy, cc = K.cols[(Math.random() * K.cols.length) | 0];
      if (opt.low && i % 2) { p[4] = -1; return; } p[4] = j;
      m4.makeScale(1, sy, 1); m4.setPosition(p[0], p[1] + hh, p[2]); im.setMatrixAt(j, m4); im.setColorAt(j, col.setHex(cc)); j++; });
    im.count = j; add(im); return im; });
  if (!kinds.length) items.length = 0;
  // inner decorative aisles (mart)
  if (M.decor === 'aisles') { const b = M.verts, X = Math.max(...b.map(v => v[0])), Z = Math.max(...b.map(v => v[1]));
    for (let z = -Z + HW + 5; z < Z - HW - 2; z += 6) box(2 * (X - HW) - 8, SH, 1.4, frameMat, 0, SH / 2, z); }
  // escalator next to the shortcut (skywalk): decorative steps going down into the void
  if (M.open) { const esc = lm(0x78909c); for (let k = 0; k < 14; k++) box(3, 0.25, 0.6, k % 2 ? esc : metalM, 0, 4 - k * 0.28, 21.6 - k * 0.5); box(0.2, 1, 7.5, metalM, -1.6, 2.6, 18.2).rotation.x = -0.5; box(0.2, 1, 7.5, metalM, 1.6, 2.6, 18.2).rotation.x = -0.5;
    const s = add(textSprite('🛗 에스컬레이터', '#00838f')); s.position.set(0, 7.2, 28); s.scale.set(5, 1.25, 1); }
  // aisle signs above the outer wall
  const out = -M.inSign;
  M.signs.forEach(([f, t], i) => { const idx = Math.round(path.length * f), p = atLane(idx, out * (HW + 0.9)); const s = add(textSprite(t, ['#c62828', '#ef6c00', '#2e7d32', '#1565c0', '#6a1b9a'][i % 5]));
    s.position.set(p.x, hAt(path[idx % path.length].x, path[idx % path.length].y) + (M.wall === 'wall' ? 3.4 : 5.2), p.z); s.scale.set(5, 1.25, 1); });
  // finish line at path[0]
  { const p = path[0], [tx, tz] = tangentAt(0), y = hAt(p.x, p.y);
    const ftx = canvasTex(64, 256, g => { for (let yy = 0; yy < 16; yy++) for (let x = 0; x < 4; x++) { g.fillStyle = (x + yy) % 2 ? '#000' : '#fff'; g.fillRect(x * 16, yy * 16, 16, 16); } });
    const fin = add(new THREE.Mesh(new THREE.PlaneGeometry(2, HW * 2), new THREE.MeshBasicMaterial({ map: ftx }))); fin.rotation.set(-Math.PI / 2, 0, Math.abs(tx) > 0.5 ? 0 : Math.PI / 2); fin.position.set(p.x, y + 0.012, p.y);
    const banner = add(textSprite('🏁 결승선 🏁', '#1565c0')); banner.position.set(p.x, y + Math.min(7.2, T.ceil + 0.3), p.y); banner.scale.set(8, 2, 1);
    for (const s of [-1, 1]) { const q = { x: p.x - tz * s * (HW - 0.3), z: p.y + tx * s * (HW - 0.3) }; const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, T.ceil + 0.5), frameMat); pole.position.set(q.x, y + (T.ceil + 0.5) / 2, q.z); add(pole); } }
  // merge static meshes that share a material (one draw call each)
  const groups = new Map();
  for (const o of [...root.children]) { if (!o.isMesh || o.isInstancedMesh) continue; o.updateMatrixWorld(); const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone(); g.applyMatrix4(o.matrixWorld);
    if (!g.attributes.normal) g.computeVertexNormals(); if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!groups.has(o.material)) groups.set(o.material, []); groups.get(o.material).push(g); root.remove(o); o.geometry.dispose(); }
  for (const [mat, gs] of groups) { const merged = mergeGeometries(gs, false); gs.forEach(g => g.dispose()); if (merged) { const mm = root.add(new THREE.Mesh(merged, mat)).children.at(-1); if (mat.transparent) mm.renderOrder = 2; } }
  for (const d of doors) strips.push(d.strip);
  function dispose() {
    scene.remove(root); for (const b of bodies) world.removeBody(b);
    root.traverse(o => { if (o.geometry) o.geometry.dispose(); const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : []; for (const m of ms) { if (m.map) m.map.dispose(); m.dispose(); } });
  }
  return { meshes, items, hidden: new Uint8Array(items.length), doors, tick: dt => ticks.forEach(f => f(dt)), dispose };
}
