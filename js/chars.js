// Racer roster: chibi characters (big head ~1:1.2 body), toon-shaded vertex-colored merged parts, inverted-hull outlines,
// shared glossy-eye face atlas (blink + expressions), per-character push/idle/win animations, cart decorations & voice lines.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ROSTER } from './config/characters.js';

// ---------- shared materials ----------
let _grad = null;
function toonGrad() {
  if (_grad) return _grad;
  const d = new Uint8Array([90, 170, 255]);
  _grad = new THREE.DataTexture(d, 3, 1, THREE.RedFormat);
  _grad.minFilter = _grad.magFilter = THREE.NearestFilter;
  _grad.needsUpdate = true;
  return _grad;
}
export const vcToon = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGrad() });
const outlineMat = new THREE.MeshBasicMaterial({ color: 0x3b2433, side: THREE.BackSide });
const _c = new THREE.Color();
function part(g, col, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0) {
  g.scale(sx, sy, sz);
  g.rotateX(rx);
  g.rotateY(ry);
  g.rotateZ(rz);
  g.translate(x, y, z);
  _c.setHex(col);
  const n = g.attributes.position.count,
    a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    a[i * 3] = _c.r;
    a[i * 3 + 1] = _c.g;
    a[i * 3 + 2] = _c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
  return g;
}
const merge = parts => {
  const m = mergeGeometries(
    parts.map(p => (p.index ? p.toNonIndexed() : p)),
    false,
  );
  parts.forEach(p => p.dispose());
  return m;
};
const S = (r, ws = 16, hs = 12, ps = 0, pl = Math.PI * 2, ts = 0, tl = Math.PI) => new THREE.SphereGeometry(r, ws, hs, ps, pl, ts, tl);
const Cap = (r, l, s = 10) => new THREE.CapsuleGeometry(r, l, 4, s);
const Box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const Cone = (r, h, s = 8) => new THREE.ConeGeometry(r, h, s);
const Cyl = (a, b, h, s = 12) => new THREE.CylinderGeometry(a, b, h, s);
const Tor = (r, t, s = 16, arc = Math.PI * 2) => new THREE.TorusGeometry(r, t, 6, s, arc);

// ---------- face atlas: 9 frames ----------
export const FACE = { normal: 0, blink: 1, happy: 2, focus: 3, dizzy: 4, angry: 5, win: 6, shock: 7, sleepy: 8 };
const NF = 9;
let faceTex = null;
export function getFaceTex() {
  if (faceTex) return faceTex;
  const W = 160,
    H = 128,
    c = document.createElement('canvas');
  c.width = W * NF;
  c.height = H;
  const g = c.getContext('2d');
  g.lineCap = 'round';
  g.lineJoin = 'round';
  const ink = '#2a1622';
  const eye = (x, y, sx = 1) => {
    // big glossy eye
    const gr = g.createLinearGradient(0, y - 22, 0, y + 22);
    gr.addColorStop(0, '#1b0f1a');
    gr.addColorStop(0.55, '#4a2a3a');
    gr.addColorStop(1, '#8a5a6e');
    g.fillStyle = gr;
    g.beginPath();
    g.ellipse(x, y, 15 * sx, 21, 0, 0, 7);
    g.fill();
    g.fillStyle = '#fff';
    g.beginPath();
    g.ellipse(x + 5, y - 9, 6, 7, 0, 0, 7);
    g.fill();
    g.beginPath();
    g.arc(x - 6, y + 9, 3, 0, 7);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,.35)';
    g.beginPath();
    g.ellipse(x, y + 12, 9, 4, 0, 0, 7);
    g.fill();
  };
  const blush = ox => {
    g.fillStyle = 'rgba(255,110,140,0.5)';
    for (const x of [ox + 24, ox + 136]) {
      g.beginPath();
      g.ellipse(x, 86, 15, 9, 0, 0, 7);
      g.fill();
    }
  };
  const smile = (ox, w = 10, y = 84) => {
    g.strokeStyle = ink;
    g.lineWidth = 5;
    g.beginPath();
    g.arc(ox + 80, y - 4, w, 0.25, Math.PI - 0.25);
    g.stroke();
  };
  for (let f = 0; f < NF; f++) {
    const ox = f * W,
      ex = [ox + 50, ox + 110],
      ey = 58;
    blush(ox);
    g.strokeStyle = g.fillStyle = ink;
    g.lineWidth = 6;
    if (f === 0) {
      ex.forEach(x => eye(x, ey));
      g.fillStyle = ink;
      g.beginPath();
      g.moveTo(ox + 74, 82);
      g.quadraticCurveTo(ox + 80, 90, ox + 86, 82);
      g.stroke();
    }
    if (f === 1) {
      for (const x of ex) {
        g.beginPath();
        g.arc(x, ey - 2, 14, 0.2, Math.PI - 0.2);
        g.stroke();
      }
      smile(ox, 8);
    }
    if (f === 2) {
      for (const x of ex) {
        g.beginPath();
        g.arc(x, ey + 8, 14, Math.PI + 0.25, -0.25);
        g.stroke();
      }
      g.fillStyle = '#c2185b';
      g.beginPath();
      g.moveTo(ox + 64, 80);
      g.quadraticCurveTo(ox + 80, 104, ox + 96, 80);
      g.closePath();
      g.fill();
      g.fillStyle = '#ff8a9a';
      g.beginPath();
      g.ellipse(ox + 80, 92, 7, 4, 0, 0, 7);
      g.fill();
    }
    if (f === 3) {
      ex.forEach(x => eye(x, ey + 4, 0.9));
      g.strokeStyle = ink;
      g.lineWidth = 6;
      for (const [x, s] of [
        [ex[0], 1],
        [ex[1], -1],
      ]) {
        g.beginPath();
        g.moveTo(x - 16 * s, ey - 24);
        g.lineTo(x + 12 * s, ey - 16);
        g.stroke();
      }
      g.beginPath();
      g.moveTo(ox + 70, 88);
      g.lineTo(ox + 90, 86);
      g.stroke();
    }
    if (f === 4) {
      for (const x of ex) {
        g.beginPath();
        for (let a = 0; a < 13; a += 0.3) {
          const r = a * 1.25;
          g.lineTo(x + Math.cos(a) * r, ey + Math.sin(a) * r);
        }
        g.lineWidth = 4;
        g.stroke();
      }
      g.lineWidth = 5;
      g.beginPath();
      for (let k = 0; k <= 4; k++) g.lineTo(ox + 62 + k * 9, 90 + (k % 2 ? -6 : 6));
      g.stroke();
    }
    if (f === 5) {
      for (const [x, s] of [
        [ex[0], 1],
        [ex[1], -1],
      ]) {
        g.beginPath();
        g.moveTo(x - 18 * s, ey - 24);
        g.lineTo(x + 12 * s, ey - 10);
        g.stroke();
        g.beginPath();
        g.ellipse(x, ey + 4, 9, 11, 0, 0, 7);
        g.fill();
        g.fillStyle = '#fff';
        g.beginPath();
        g.arc(x + 3, ey, 3, 0, 7);
        g.fill();
        g.fillStyle = ink;
      }
      g.beginPath();
      g.arc(ox + 80, 100, 12, Math.PI + 0.35, -0.35);
      g.stroke();
      g.strokeStyle = '#e53935';
      g.lineWidth = 5;
      const mx = ox + 138,
        my = 22;
      for (const [a, b] of [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ]) {
        g.beginPath();
        g.moveTo(mx + a * 4, my + b * 4);
        g.lineTo(mx + a * 12, my + b * 4);
        g.moveTo(mx + a * 4, my + b * 4);
        g.lineTo(mx + a * 4, my + b * 12);
        g.stroke();
      }
    }
    if (f === 6) {
      for (const x of ex) {
        g.fillStyle = '#ffc107';
        g.beginPath();
        for (let k = 0; k < 10; k++) {
          const a = -Math.PI / 2 + (k * Math.PI) / 5,
            r = k % 2 ? 8 : 19;
          g.lineTo(x + Math.cos(a) * r, ey + Math.sin(a) * r);
        }
        g.closePath();
        g.fill();
        g.strokeStyle = '#e65100';
        g.lineWidth = 3;
        g.stroke();
      }
      g.fillStyle = '#c2185b';
      g.beginPath();
      g.arc(ox + 80, 82, 15, 0, Math.PI);
      g.fill();
    }
    if (f === 7) {
      for (const x of ex) {
        g.fillStyle = '#fff';
        g.beginPath();
        g.arc(x, ey, 17, 0, 7);
        g.fill();
        g.lineWidth = 3;
        g.strokeStyle = ink;
        g.stroke();
        g.fillStyle = ink;
        g.beginPath();
        g.arc(x, ey, 6, 0, 7);
        g.fill();
      }
      g.beginPath();
      g.ellipse(ox + 80, 92, 10, 13, 0, 0, 7);
      g.fill();
    }
    if (f === 8) {
      for (const x of ex) {
        g.fillStyle = ink;
        g.beginPath();
        g.ellipse(x, ey + 6, 15, 10, 0, 0, Math.PI);
        g.fill();
        g.lineWidth = 5;
        g.beginPath();
        g.moveTo(x - 16, ey + 4);
        g.lineTo(x + 16, ey + 4);
        g.stroke();
        g.fillStyle = '#fff';
        g.beginPath();
        g.arc(x + 5, ey + 9, 2.5, 0, 7);
        g.fill();
      }
      g.strokeStyle = ink;
      g.lineWidth = 4;
      g.beginPath();
      g.ellipse(ox + 80, 88, 6, 7, 0, 0, 7);
      g.stroke();
    }
  }
  faceTex = new THREE.CanvasTexture(c);
  faceTex.colorSpace = THREE.SRGBColorSpace;
  faceTex.repeat.set(1 / NF, 1);
  faceTex.anisotropy = 2;
  return faceTex;
}
// curved face patch on the front of the head sphere (uv 0..1 across the patch)
export function facePatch(r, sx = 1.05, sy = 0.95) {
  const g = new THREE.SphereGeometry(r, 20, 14, Math.PI / 2 - 0.82, 1.64, Math.PI / 2 - 0.62, 1.24);
  g.scale(sx, sy, 1);
  return g;
}
function faceMat() {
  const m = new THREE.MeshBasicMaterial({ map: getFaceTex().clone(), transparent: true, depthWrite: false });
  m.map.needsUpdate = true;
  return m;
}

export const CHAR = Object.fromEntries(ROSTER.map(r => [r.id, r]));
export const charOf = id => CHAR[id] || ROSTER[0];
export const statBar = (v, k = 'hdl') => Math.max(1, Math.min(5, Math.round((v - 1) / (k === 'spd' ? 0.015 : 0.03)) + 4));

// ---------- racer model ----------
export function makeRacer(def, opt = {}) {
  def = typeof def === 'string' ? charOf(def) : def;
  const P = def.pal,
    id = def.id,
    low = !!opt.low;
  const root = new THREE.Group(),
    bob = new THREE.Group();
  root.add(bob);
  const bp = [part(Cap(0.25, 0.2, 12), P.top, 0, 0.66, 0)];
  // outfits
  if (id === 'mango')
    bp.push(
      part(Box(0.38, 0.3, 0.06), P.bottom, 0, 0.56, 0.22),
      part(Box(0.05, 0.25, 0.03), P.bottom, -0.13, 0.78, 0.22, 1, 1, 1, 0, 0, 0.1),
      part(Box(0.05, 0.25, 0.03), P.bottom, 0.13, 0.78, 0.22, 1, 1, 1, 0, 0, -0.1),
      part(S(0.03, 6, 4), 0xffeb3b, 0, 0.6, 0.26),
    );
  if (id === 'dubu') bp.push(part(S(0.16, 10, 8), P.acc, 0, 0.58, 0.2, 1, 0.8, 0.4), part(S(0.1, 8, 6), 0xffffff, 0, 0.42, -0.26));
  if (id === 'halmi')
    bp.push(
      part(Cap(0.265, 0.14, 12), P.top, 0, 0.72, -0.01, 1.04, 1, 1.04),
      part(S(0.03, 6, 4), 0xfff59d, 0, 0.8, 0.27),
      part(S(0.03, 6, 4), 0xfff59d, 0, 0.68, 0.27),
      part(Cone(0.3, 0.3, 14), P.bottom, 0, 0.44, 0),
    );
  if (id === 'bujang')
    bp.push(
      part(Box(0.08, 0.3, 0.04), P.acc, 0, 0.7, 0.245),
      part(Cone(0.055, 0.08, 4), P.acc, 0, 0.53, 0.25, 1, 1, 0.6, Math.PI),
      part(Box(0.24, 0.05, 0.05), 0xffffff, 0, 0.88, 0.2),
      part(Box(0.5, 0.12, 0.42), P.bottom, 0, 0.47, 0),
    );
  if (id === 'ppoppi') {
    bp.push(part(S(0.19, 10, 8), P.acc, 0, 0.6, 0.17, 1, 1.1, 0.5), part(Cone(0.15, 0.55, 8), P.top, 0, 0.45, -0.38, 1, 1, 1, -1.9));
    for (let k = 0; k < 3; k++) bp.push(part(Cone(0.06, 0.12, 4), 0x2e7d32, 0, 0.88 - k * 0.16, -0.25 - k * 0.02, 1, 1, 1, -0.5));
  }
  if (id === 'mint') bp.push(part(Box(0.4, 0.06, 0.06), 0x4dd0c4, 0, 0.7, 0.22), part(Box(0.4, 0.06, 0.06), 0x4dd0c4, 0, 0.58, 0.22));
  if (id === 'leo')
    bp.push(
      part(Box(0.26, 0.12, 0.05), P.bottom, 0, 0.56, 0.23),
      part(Cap(0.05, 0.4, 6), P.top, 0.05, 0.5, -0.32, 1, 1, 1, -0.9, 0, 0.3),
      part(S(0.07, 6, 5), P.acc, 0, 0.72, 0.25),
    );
  if (id === 'unni')
    bp.push(
      part(Box(0.36, 0.42, 0.04), 0xffffff, 0, 0.58, 0.24),
      part(Box(0.12, 0.08, 0.02), P.acc, 0, 0.62, 0.265),
      part(Cone(0.3, 0.28, 14), P.bottom, 0, 0.45, 0),
    );
  const bodyG = merge(bp),
    body = new THREE.Mesh(bodyG, vcToon);
  bob.add(body);
  // head
  const headG = new THREE.Group();
  headG.position.y = 1.22;
  bob.add(headG);
  const R = 0.5,
    hp = [part(S(R, 24, 18), P.skin, 0, 0, 0, 1.05, 0.95, 1)];
  const cap = (c, sc = 1.04, tl = 0.55, rx = -0.32, y = 0.02) =>
    part(S(R * sc, 22, 12, 0, Math.PI * 2, 0, Math.PI * tl), c, 0, y, -0.02, 1.05, 1, 1, rx);
  const ear = (x, c, ci, h = 0.42) => [
    part(Cap(0.09, h, 8), c, x, 0.62, -0.06, 1, 1, 0.55, 0, 0, -x * 0.5),
    part(Cap(0.05, h * 0.8, 6), ci, x, 0.62, -0.02, 1, 1, 0.4, 0, 0, -x * 0.5),
  ];
  if (id === 'mango') {
    hp.push(
      cap(P.hair),
      part(S(0.2, 12, 10), P.hair, -0.36, 0.38, -0.06),
      part(S(0.2, 12, 10), P.hair, 0.36, 0.38, -0.06),
      part(Tor(0.12, 0.035), P.acc, -0.3, 0.3, -0.04, 1, 1, 1, 0.9, 0, 0.6),
      part(Tor(0.12, 0.035), P.acc, 0.3, 0.3, -0.04, 1, 1, 1, 0.9, 0, -0.6),
    );
    for (let k = -2; k <= 2; k++) hp.push(part(S(0.1, 8, 6), P.hair, k * 0.13, 0.33, 0.33, 1, 0.7, 0.6));
  }
  if (id === 'dubu') {
    hp.push(
      part(S(R * 1.14, 22, 14, 0, Math.PI * 2, 0, Math.PI * 0.62), P.top, 0, 0.02, -0.05, 1.05, 1, 1, -0.55),
      part(Tor(0.48, 0.07, 20, Math.PI), P.top, 0, -0.02, 0.06, 1.1, 1.05, 1, 0, 0, 0),
      ...ear(-0.2, P.top, P.acc, 0.5),
      ...ear(0.2, P.top, P.acc, 0.5),
    );
    for (let k = -1; k <= 1; k++) hp.push(part(S(0.09, 8, 6), P.hair, k * 0.13, 0.32, 0.36, 1, 0.6, 0.5));
  }
  if (id === 'halmi') {
    for (let a = 0; a < 14; a++) {
      const th = (a / 14) * Math.PI * 2,
        ring = a % 2;
      hp.push(
        part(S(0.15, 8, 6), P.hair, Math.cos(th) * (0.36 - ring * 0.1), 0.32 + ring * 0.1, Math.sin(th) * (0.34 - ring * 0.1) - 0.08),
      );
    }
    hp.push(
      part(S(0.17, 8, 6), P.hair, 0, 0.52, -0.06),
      part(Tor(0.11, 0.018, 14), 0x5d4037, -0.18, -0.02, 0.47),
      part(Tor(0.11, 0.018, 14), 0x5d4037, 0.18, -0.02, 0.47),
      part(Box(0.12, 0.02, 0.02), 0x5d4037, 0, 0.0, 0.5),
    );
  }
  if (id === 'bujang') {
    hp.push(
      cap(P.hair, 1.04, 0.5, -0.25),
      part(S(0.2, 10, 8), P.hair, -0.16, 0.36, 0.22, 1.3, 0.5, 0.8, 0, 0, 0.4),
      part(Box(0.02, 0.06, 0.2), 0xf1c9a5, 0.12, 0.43, 0.15),
    );
  }
  if (id === 'ppoppi') {
    hp.push(part(S(R * 1.16, 22, 14, 0, Math.PI * 2, 0, Math.PI * 0.6), P.top, 0, 0.03, -0.06, 1.05, 1, 1, -0.5));
    for (let k = 0; k < 5; k++)
      hp.push(part(Cone(0.08, 0.18, 4), 0x2e7d32, 0, 0.6 - k * 0.03, 0.18 - k * 0.15, 1, 1, 0.5, -0.4 + k * 0.25));
    for (let k = -3; k <= 3; k++)
      hp.push(part(Cone(0.035, 0.08, 4), 0xffffff, k * 0.09, 0.3 - Math.abs(k) * 0.03, 0.45 - Math.abs(k) * 0.02, 1, 1, 1, Math.PI));
  }
  if (id === 'mint') {
    hp.push(
      cap(P.hair, 1.06, 0.6, -0.4),
      part(Box(0.24, 0.42, 0.2), P.hair, -0.4, -0.16, -0.02),
      part(Box(0.24, 0.42, 0.2), P.hair, 0.4, -0.16, -0.02),
      part(Tor(0.5, 0.04, 20, Math.PI), 0xffffff, 0, 0.12, 0, 1.05, 1, 1, 0, 0, 0),
      part(Cyl(0.13, 0.13, 0.1), 0x5d4037, -0.53, -0.02, 0, 1, 1, 1, 0, 0, Math.PI / 2),
      part(Cyl(0.13, 0.13, 0.1), 0x5d4037, 0.53, -0.02, 0, 1, 1, 1, 0, 0, Math.PI / 2),
      part(Box(0.24, 0.1, 0.04), P.acc, -0.15, 0.36, 0.33, 1, 1, 1, -0.5),
      part(Box(0.24, 0.1, 0.04), P.acc, 0.15, 0.36, 0.33, 1, 1, 1, -0.5),
      part(Box(0.08, 0.025, 0.03), P.acc, 0, 0.37, 0.34, 1, 1, 1, -0.5),
    );
  }
  if (id === 'leo') {
    hp.push(
      part(S(R * 1.14, 22, 14, 0, Math.PI * 2, 0, Math.PI * 0.62), P.top, 0, 0.02, -0.05, 1.05, 1, 1, -0.55),
      part(Cone(0.17, 0.3, 4), P.top, -0.3, 0.5, -0.02, 1, 1, 0.6, 0, 0, 0.35),
      part(Cone(0.17, 0.3, 4), P.top, 0.3, 0.5, -0.02, 1, 1, 0.6, 0, 0, -0.35),
      part(Cone(0.09, 0.17, 4), P.acc, -0.29, 0.5, 0.05, 1, 1, 0.4, 0, 0, 0.35),
      part(Cone(0.09, 0.17, 4), P.acc, 0.29, 0.5, 0.05, 1, 1, 0.4, 0, 0, -0.35),
    );
    for (let k = -2; k <= 2; k++) hp.push(part(Cone(0.07, 0.2, 5), P.hair, k * 0.1, 0.33, 0.36, 1, 1, 0.6, Math.PI + 0.5));
  }
  if (id === 'unni') {
    hp.push(
      cap(P.hair),
      part(Cyl(0.3, 0.27, 0.36, 16), 0xffffff, 0, 0.58, -0.04),
      part(S(0.22, 10, 8), 0xffffff, -0.15, 0.8, -0.04),
      part(S(0.24, 10, 8), 0xffffff, 0.12, 0.84, -0.04),
      part(S(0.2, 10, 8), 0xffffff, 0, 0.9, 0.08),
      part(Cap(0.08, 0.3, 6), P.hair, 0.44, -0.3, -0.1, 1, 1, 1, 0, 0, 0.2),
      part(S(0.05, 6, 5), P.acc, 0.47, -0.52, -0.1),
    );
  }
  const headGeo = merge(hp),
    head = new THREE.Mesh(headGeo, vcToon);
  headG.add(head);
  const fm = faceMat(),
    face = new THREE.Mesh(facePatch(R + 0.006), fm);
  face.position.y = -0.03;
  headG.add(face);
  if (!low) {
    const ob = new THREE.Mesh(bodyG, outlineMat);
    ob.scale.setScalar(1.06);
    ob.position.y = -0.04;
    bob.add(ob);
    const oh = new THREE.Mesh(headGeo, outlineMat);
    oh.scale.setScalar(1.045);
    headG.add(oh);
  }
  // limbs
  const arms = [],
    legs = [];
  for (const s of [-1, 1]) {
    const ap = new THREE.Group();
    ap.position.set(s * 0.3, 0.84, 0.05);
    bob.add(ap);
    const ag = [
      part(Cap(0.085, 0.34, 8), P.top, 0, -0.24, 0),
      part(S(0.105, 10, 8), id === 'ppoppi' ? P.top : P.skin, 0, -0.5, 0),
      part(S(0.05, 6, 5), id === 'ppoppi' ? P.top : P.skin, 0.06, -0.5, 0.07),
    ];
    if (id === 'unni' && s > 0)
      ag.push(part(Cyl(0.03, 0.03, 0.3, 6), 0xbcaaa4, 0, -0.56, 0.1, 1, 1, 1, 1.4), part(S(0.06, 6, 5), 0xffffff, 0, -0.58, 0.25));
    ap.add(new THREE.Mesh(merge(ag), vcToon));
    arms.push(ap);
    const lp = new THREE.Group();
    lp.position.set(s * 0.12, 0.42, 0);
    root.add(lp);
    lp.add(
      new THREE.Mesh(
        merge([part(Cap(0.085, 0.16, 8), P.bottom, 0, -0.17, 0), part(S(0.11, 10, 8), P.shoe, 0, -0.34, 0.05, 1, 0.65, 1.35)]),
        vcToon,
      ),
    );
    legs.push(lp);
  }
  const sc = def.scale || 1;
  root.scale.setScalar(sc);
  // face / blink
  let cur = -1,
    mood = 'normal',
    blinkT = 1 + Math.random() * 3,
    blinking = 0,
    t = 0;
  const setF = n => {
    const f = FACE[n] ?? 0;
    if (f !== cur) {
      cur = f;
      fm.map.offset.x = f / NF;
    }
  };
  const A = def.anim;
  const V = (a, i, spread, fwd) => a.rotation.set(fwd, 0, (i ? 1 : -1) * spread); // spread: 0 = down, π/2 = sideways, ~2.3 = raised V
  const api = {
    root,
    def,
    headG,
    arms,
    legs,
    bob,
    face(name) {
      mood = name;
    },
    tick(dt) {
      t += dt;
      blinkT -= dt;
      if (blinkT <= 0) {
        blinking = 0.13;
        blinkT = 2 + Math.random() * 3.5;
      }
      if (blinking > 0) blinking -= dt;
      const base = mood === 'normal' && def.sleepy ? 'sleepy' : mood;
      setF(blinking > 0 && (base === 'normal' || base === 'sleepy' || base === 'focus') ? 'blink' : base);
    },
    walk(ph, k = 1) {
      // per-character push gait
      const sw = Math.sin(ph),
        b = Math.abs(sw);
      const amp = {
        bouncy: [0.22, 1.0, 0.12],
        sleepy: [0.06, 0.6, 0.05],
        hunch: [0.08, 1.2, 0.04],
        stiff: [0.05, 0.7, 0.0],
        waddle: [0.1, 0.7, 0.22],
        nod: [0.08, 0.8, 0.05],
        lean: [0.1, 0.9, 0.06],
        elegant: [0.09, 0.75, 0.08],
      }[A] || [0.12, 0.8, 0.08];
      legs[0].rotation.x = sw * amp[1] * k;
      legs[1].rotation.x = -sw * amp[1] * k;
      bob.position.y = b * amp[0] * k;
      bob.scale.set(1 + (1 - b) * 0.05 * k, 1 - (1 - b) * 0.05 * k, 1);
      bob.rotation.z = A === 'waddle' ? sw * amp[2] * k : 0;
      bob.rotation.x = A === 'hunch' ? 0.28 : A === 'lean' ? 0.22 + 0.1 * k : A === 'stiff' ? 0.02 : 0.06 * k;
      headG.rotation.z = A === 'stiff' ? 0 : sw * amp[2] * k;
      headG.rotation.x =
        A === 'nod' ? Math.sin(ph * 2) * 0.12 : A === 'sleepy' ? 0.15 + Math.sin(ph * 0.5) * 0.08 : A === 'hunch' ? -0.2 : 0.05;
      arms.forEach((a, i) => a.rotation.set(-1.3 + Math.sin(ph * 2 + i) * 0.05 * k, 0, (i ? -1 : 1) * -0.12));
    },
    idle(tt) {
      const br = Math.sin(tt * 2.2);
      legs[0].rotation.x = legs[1].rotation.x = 0;
      bob.position.y = Math.max(0, br) * 0.02;
      bob.scale.set(1 + br * 0.015, 1 - br * 0.015, 1);
      bob.rotation.set(A === 'hunch' ? 0.25 : 0, 0, A === 'waddle' ? Math.sin(tt * 3) * 0.08 : 0);
      headG.rotation.set(
        A === 'nod' ? Math.abs(Math.sin(tt * 4)) * 0.2 : A === 'sleepy' ? 0.2 : 0,
        A === 'lean' ? Math.sin(tt * 0.8) * 0.3 : 0,
        A === 'sleepy' ? Math.sin(tt * 0.7) * 0.25 : A === 'bouncy' ? Math.sin(tt * 5) * 0.1 : 0,
      );
      if (A === 'bouncy') bob.position.y = Math.abs(Math.sin(tt * 5)) * 0.08;
      arms.forEach((a, i) => a.rotation.set(-1.3, 0, (i ? -1 : 1) * -0.12));
    },
    cheer(tt, k = 1) {
      const j = Math.abs(Math.sin(tt * 8));
      bob.position.y = j * 0.25 * k;
      bob.rotation.set(0, 0, 0);
      arms.forEach((a, i) => V(a, i, 2.3 + Math.sin(tt * 10 + i) * 0.3 * k, 0.35));
      legs.forEach(l => (l.rotation.x = 0));
      headG.rotation.set(0, 0, Math.sin(tt * 4) * 0.12);
      setF(k > 0.7 ? 'win' : 'happy');
      mood = 'happy';
    },
    win(tt) {
      // character-specific victory pose; arms always angled out/forward so they read beside the big head
      const W = def.win;
      legs.forEach(l => (l.rotation.x = 0));
      bob.rotation.set(0, 0, 0);
      headG.rotation.set(0, 0, 0);
      bob.position.y = 0;
      setF('win');
      mood = 'win';
      if (W === 'jump') {
        const j = Math.abs(Math.sin(tt * 7));
        bob.position.y = j * 0.45;
        arms.forEach((a, i) => V(a, i, 2.2 + j * 0.35, 0.3));
        legs[0].rotation.x = -j * 0.6;
        legs[1].rotation.x = j * 0.3;
      } else if (W === 'sleepy') {
        headG.rotation.z = Math.sin(tt * 1.5) * 0.25;
        V(arms[0], 0, 0.7, 0.3);
        V(arms[1], 1, 2.0 + Math.sin(tt * 4) * 0.4, 0.5);
        setF(Math.sin(tt * 0.9) > 0.6 ? 'sleepy' : 'happy');
      } else if (W === 'peace') {
        bob.rotation.x = 0.1;
        V(arms[0], 0, 0.8, 0.2);
        V(arms[1], 1, 2.3 + Math.sin(tt * 6) * 0.1, 0.6);
        headG.rotation.z = 0.15 + Math.sin(tt * 3) * 0.05;
        bob.position.y = Math.abs(Math.sin(tt * 4)) * 0.05;
      } else if (W === 'fist') {
        const p = Math.sin(tt * 9);
        V(arms[0], 0, 0.6, 0.2);
        V(arms[1], 1, 2.2 + p * 0.35, 0.6);
        bob.position.y = Math.max(0, p) * 0.08;
      } else if (W === 'roar') {
        bob.rotation.x = -0.1;
        arms.forEach((a, i) => V(a, i, 1.4 + Math.sin(tt * 10) * 0.15, 0.9));
        headG.rotation.x = -0.2;
        bob.position.y = Math.abs(Math.sin(tt * 3)) * 0.1;
      } else if (W === 'cool') {
        V(arms[0], 0, 1.0, 1.1);
        V(arms[1], 1, 2.3, 0.3);
        headG.rotation.x = Math.abs(Math.sin(tt * 4)) * 0.18;
        headG.rotation.z = -0.1;
      } else if (W === 'spin') {
        bob.rotation.y = tt * 6;
        arms.forEach((a, i) => V(a, i, 1.75, 0));
        bob.position.y = 0.1;
      } else if (W === 'bow') {
        const b = (Math.sin(tt * 2) + 1) / 2;
        bob.rotation.x = b * 0.4;
        V(arms[0], 0, 0.9, 0.3);
        V(arms[1], 1, 2.0 + b * 0.4, 0.5);
      } else arms.forEach((a, i) => V(a, i, 2.4, 0.3));
    },
    dispose() {
      bodyG.dispose();
      headGeo.dispose();
      face.geometry.dispose();
      fm.map.dispose();
      fm.dispose();
      root.traverse(o => {
        if (o.isMesh && o.geometry !== bodyG && o.geometry !== headGeo && o !== face) o.geometry.dispose();
      });
    },
  };
  api.tick(0);
  return api;
}

// ---------- cart decorations (one merged mesh each, in cart-local space; basket floor y≈0.55, rim y≈1.3, handle z≈-0.95) ----------
export function makeDeco(id) {
  const p = [];
  if (id === 'mango') {
    p.push(part(Cyl(0.015, 0.015, 1.0, 6), 0x8d6e63, 0.55, 1.75, 0.75));
    p.push(
      part(Box(0.02, 0.28, 0.42), 0xffa726, 0.55, 2.1, 0.55),
      part(S(0.1, 8, 6), 0xffeb3b, 0.56, 2.1, 0.55, 0.3, 1, 1),
      part(Cone(0.05, 0.1, 4), 0x43a047, 0.56, 2.27, 0.65),
    );
  }
  if (id === 'dubu') {
    p.push(
      part(Box(0.55, 0.16, 0.4), 0xffffff, 0, 0.66, 0.5),
      part(Box(0.5, 0.04, 0.35), 0xf8bbd0, 0, 0.76, 0.5),
      part(Cone(0.08, 0.36, 8), 0xff9800, -0.3, 0.82, -0.2, 1, 1, 1, 0.3, 0, 0.6),
      part(Cone(0.08, 0.15, 5), 0x43a047, -0.4, 1.02, -0.27, 1, 1, 1, 0.3, 0, 0.6),
    );
    p.push(
      part(Cap(0.06, 0.25, 6), 0xffffff, -0.25, 1.5, 0.78),
      part(Cap(0.06, 0.25, 6), 0xffffff, 0.25, 1.5, 0.78),
      part(Cap(0.035, 0.18, 6), 0xf8bbd0, -0.25, 1.5, 0.82),
      part(Cap(0.035, 0.18, 6), 0xf8bbd0, 0.25, 1.5, 0.82),
    );
  }
  if (id === 'halmi') {
    const cols = [0xff4081, 0xffeb3b, 0xff7043, 0xe040fb, 0xffffff];
    for (let k = 0; k < 10; k++) {
      const side = k < 5 ? -1 : 1,
        z = -0.7 + (k % 5) * 0.35;
      p.push(
        part(S(0.08, 8, 6), cols[k % 5], side * 0.58, 1.35, z, 1, 0.6, 1),
        part(S(0.03, 6, 4), 0xfff176, side * 0.58, 1.4, z),
        part(S(0.05, 6, 4), 0x66bb6a, side * 0.6, 1.3, z + 0.1, 1, 0.4, 1.4),
      );
    }
    p.push(part(Cyl(0.22, 0.18, 0.3, 12), 0xd7a35b, 0.2, 0.72, 0.4), part(S(0.12, 8, 6), 0xff4081, 0.2, 0.95, 0.4));
  }
  if (id === 'bujang') {
    p.push(
      part(Box(0.6, 0.42, 0.14), 0x4e342e, 0, 0.78, 0.2),
      part(Tor(0.08, 0.02, 10, Math.PI), 0x212121, 0, 1.0, 0.2),
      part(Box(0.08, 0.06, 0.15), 0xffd54f, 0, 0.88, 0.2),
      part(Box(0.3, 0.04, 0.4), 0xffffff, -0.2, 0.6, 0.6, 1, 1, 1, 0, 0.3),
    );
  }
  if (id === 'ppoppi') {
    for (let k = 0; k < 5; k++) p.push(part(Cone(0.12, 0.26, 4), 0x2e7d32, 0, 1.45, -0.6 + k * 0.32, 1, 1, 0.6));
    p.push(
      part(S(0.18, 10, 8), 0xfff8e1, 0.15, 0.75, 0.5, 1, 1.25, 1),
      part(S(0.04, 6, 4), 0x81c784, 0.2, 0.85, 0.66),
      part(Cone(0.18, 0.45, 8), 0x66bb6a, 0, 0.5, -1.05, 1, 1, 1, -1.4),
    );
  }
  if (id === 'mint') {
    p.push(
      part(Box(0.42, 0.3, 0.26), 0x212121, 0.2, 0.72, 0.3),
      part(Cyl(0.08, 0.08, 0.02, 12), 0x4dd0c4, 0.2, 0.74, 0.44, 1, 1, 1, Math.PI / 2),
      part(Cyl(0.05, 0.05, 0.02, 12), 0x4dd0c4, 0.32, 0.8, 0.44, 1, 1, 1, Math.PI / 2),
    );
    for (let k = 0; k < 6; k++) p.push(part(Box(1.18, 0.07, 0.12), k % 2 ? 0x5d4037 : 0x4dd0c4, 0, 1.22, -0.65 + k * 0.26));
  }
  if (id === 'leo') {
    p.push(
      part(Cone(0.16, 0.3, 4), 0x9fa8da, -0.35, 1.48, 0.8, 1, 1, 0.5),
      part(Cone(0.16, 0.3, 4), 0x9fa8da, 0.35, 1.48, 0.8, 1, 1, 0.5),
      part(Cone(0.08, 0.16, 4), 0xff80ab, -0.35, 1.46, 0.84, 1, 1, 0.3),
      part(Cone(0.08, 0.16, 4), 0xff80ab, 0.35, 1.46, 0.84, 1, 1, 0.3),
    );
    const rgb = [0xff1744, 0xffea00, 0x00e676, 0x2979ff, 0xd500f9];
    for (let k = 0; k < 5; k++) p.push(part(Box(1.17, 0.05, 0.3), rgb[k], 0, 0.33, -0.6 + k * 0.3));
    p.push(
      part(Box(0.5, 0.06, 0.3), 0x212121, 0, 0.62, 0.3),
      part(Box(0.12, 0.06, 0.12), 0x212121, -0.3, 0.62, 0.3),
      part(Box(0.12, 0.06, 0.12), 0x212121, 0.3, 0.62, 0.3),
    );
  }
  if (id === 'unni') {
    p.push(
      part(Cyl(0.3, 0.3, 0.22, 16), 0xffe0b2, 0, 0.7, 0.35),
      part(Cyl(0.31, 0.31, 0.06, 16), 0xff8fab, 0, 0.84, 0.35),
      part(Cyl(0.2, 0.2, 0.16, 16), 0xfff3e0, 0, 0.95, 0.35),
      part(S(0.07, 8, 6), 0xd50000, 0, 1.07, 0.35),
    );
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      p.push(part(S(0.05, 6, 4), 0xffffff, Math.cos(a) * 0.25, 0.89, 0.35 + Math.sin(a) * 0.25));
    }
    p.push(part(Cone(0.12, 0.12, 12), 0xff8fab, -0.58, 1.4, 0, 1, 1, 1, Math.PI));
  }
  return p.length ? new THREE.Mesh(merge(p), vcToon) : null;
}
