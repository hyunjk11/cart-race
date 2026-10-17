/**
 * cartparts.js — geometry/materials for cart parts (차고). All geometry is in cart-local space (see models.js makeCart:
 * basket floor y≈0.55, rim y≈1.3, x ±0.55, z ±0.8 with +z = front; handle at z≈-0.95; wheels at (±0.4, ±0.7)).
 * Geometries and materials are shared and cached: every cart with the same loadout + quality reuses one merged geometry
 * per material (≈1-3 draw calls for all add-on parts). `low` builds simpler variants (fewer segments, no detail bits).
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { vcToon } from './chars.js';
import { cleanLoadout, partOf } from './parts.js';

const _c = new THREE.Color();
/** Vertex-coloured, transformed, non-indexed geometry piece. */
function P(g, col, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  g.scale(sx, sy, sz);
  g.rotateX(rx);
  g.rotateY(ry);
  g.rotateZ(rz);
  g.translate(x, y, z);
  if (g.index) g = g.toNonIndexed();
  _c.setHex(col);
  const n = g.attributes.position.count,
    a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([_c.r, _c.g, _c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  g.deleteAttribute('uv');
  return g;
}
const merge = L => {
  const m = mergeGeometries(L, false);
  L.forEach(g => g.dispose());
  return m;
};
const Box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const Cyl = (a, b, h, s) => new THREE.CylinderGeometry(a, b, h, s);
const Sph = (r, w, h) => new THREE.SphereGeometry(r, w, h);
const Cone = (r, h, s) => new THREE.ConeGeometry(r, h, s);
const Tor = (r, t, rs, ts) => new THREE.TorusGeometry(r, t, rs, ts);

// shared materials
export const MAT = {
  vc: vcToon,
  glow: new THREE.MeshBasicMaterial({ vertexColors: true }),
  glass: new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.32, depthWrite: false }),
  goldLine: new THREE.LineBasicMaterial({ color: 0xffca28 }),
};

// ---------- wheels: one shared geometry per wheel part (kept as 4 separate meshes so they can spin) ----------
const wheelCache = new Map();
/** { geo, mat, y, ring?: { geo, mat } } or null for the basic wheel. */
export function wheelKit(id, low) {
  const k = id + (low ? 'L' : 'H');
  if (wheelCache.has(k)) return wheelCache.get(k);
  const s = low ? 8 : 14,
    R = Math.PI / 2;
  let kit = null;
  if (id === 'offroad') {
    const L = [P(Cyl(0.2, 0.2, 0.14, s), 0x2b2b2b, 0, 0, 0, 0, 0, R), P(Cyl(0.09, 0.09, 0.15, s), 0xffb300, 0, 0, 0, 0, 0, R)];
    if (!low)
      for (let i = 0; i < 8; i++)
        L.push(
          P(
            Box(0.15, 0.06, 0.06),
            0x1a1a1a,
            0,
            Math.cos((i / 8) * Math.PI * 2) * 0.2,
            Math.sin((i / 8) * Math.PI * 2) * 0.2,
            (i / 8) * Math.PI * 2,
          ),
        );
    kit = { geo: merge(L), mat: MAT.vc, y: 0.2 };
  } else if (id === 'neon') {
    const geo = merge([P(Cyl(0.14, 0.14, 0.07, s), 0x1a1a2e, 0, 0, 0, 0, 0, R)]);
    const ring = merge([
      P(Tor(0.14, 0.028, low ? 4 : 6, s + 4), 0x00e5ff, 0, 0, 0, 0, R, 0),
      P(Cyl(0.05, 0.05, 0.08, 6), 0xff4fd8, 0, 0, 0, 0, 0, R),
    ]);
    kit = { geo, mat: MAT.vc, y: 0.14, ring: { geo: ring, mat: MAT.glow } };
  } else if (id === 'slick') {
    kit = {
      geo: merge([P(Cyl(0.15, 0.15, 0.2, s), 0x111111, 0, 0, 0, 0, 0, R), P(Cyl(0.1, 0.1, 0.21, s), 0xe53935, 0, 0, 0, 0, 0, R)]),
      mat: MAT.vc,
      y: 0.15,
    };
  }
  wheelCache.set(k, kit);
  return kit;
}

// ---------- paint decals (pattern textures, shared per paint part) ----------
const decalCache = new Map();
function decalMat(p) {
  if (decalCache.has(p.id)) return decalCache.get(p.id);
  const cv = document.createElement('canvas');
  cv.width = 128;
  cv.height = 64;
  const g = cv.getContext('2d');
  g.fillStyle = '#' + p.col.toString(16).padStart(6, '0');
  g.globalAlpha = 0.92;
  g.fillRect(0, 0, 128, 64);
  g.globalAlpha = 1;
  g.fillStyle = '#fff';
  if (p.pat === 'stripe') {
    g.fillRect(0, 22, 128, 8);
    g.fillRect(0, 36, 128, 4);
  } else if (p.pat === 'dots')
    for (let x = 8; x < 128; x += 20)
      for (let y = 8; y < 64; y += 20) (g.beginPath(), g.arc(x + ((y / 20) % 2) * 10, y, 5, 0, 7), g.fill());
  else if (p.pat === 'flame') {
    for (const [c, k] of [
      ['#ff6d00', 1],
      ['#ffd600', 0.6],
    ]) {
      g.fillStyle = c;
      g.beginPath();
      g.moveTo(0, 64);
      for (let x = 0; x <= 128; x += 16) (g.lineTo(x + 8, 64 - (26 + ((x * 7) % 22)) * k), g.lineTo(x + 16, 64 - 10 * k));
      g.lineTo(128, 64);
      g.fill();
    }
  } else if (p.pat === 'star') {
    g.fillStyle = '#fff59d';
    for (const [x, y, r] of [
      [18, 20, 9],
      [60, 40, 12],
      [100, 18, 8],
      [112, 48, 6],
      [36, 50, 5],
    ]) {
      g.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 - Math.PI / 2,
          rr = i % 2 ? r * 0.45 : r;
        g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      }
      g.fill();
    }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide, transparent: true, opacity: 0.95 });
  decalCache.set(p.id, m);
  return m;
}
let decalGeo = null;
function decalGeometry() {
  if (decalGeo) return decalGeo;
  const L = [];
  for (const s of [-1, 1]) {
    const g = new THREE.PlaneGeometry(1.5, 0.5);
    g.rotateY((s * Math.PI) / 2);
    g.translate(s * 0.575, 0.95, 0);
    L.push(g);
  }
  const f = new THREE.PlaneGeometry(1.05, 0.45);
  f.translate(0, 0.95, 0.825);
  L.push(f);
  return (decalGeo = mergeGeometries(
    L.map(g => g.toNonIndexed()),
    false,
  ));
}

// ---------- add-on parts, as { mat key -> [pieces] } ----------
function pieces(slot, id, low, out) {
  const add = (k, g) => (out[k] = out[k] || []).push(g);
  const s = low ? 6 : 12;
  if (slot === 'body') {
    if (id === 'acrylic') {
      add('glass', P(Box(1.12, 0.75, 1.62), 0xb3e5fc, 0, 0.925, 0));
      for (const [x, z] of [
        [-0.56, -0.8],
        [0.56, -0.8],
        [-0.56, 0.8],
        [0.56, 0.8],
      ])
        add('vc', P(Box(0.05, 0.76, 0.05), 0xffffff, x, 0.925, z));
      add('vc', P(Box(1.0, 0.04, 1.5), 0xe1f5fe, 0, 0.56, 0));
    } else if (id === 'gold') {
      for (const [x, z] of [
        [-0.56, -0.8],
        [0.56, -0.8],
        [-0.56, 0.8],
        [0.56, 0.8],
      ])
        add('vc', P(Box(0.07, 0.8, 0.07), 0xffb300, x, 0.92, z));
      add('vc', P(Box(1.14, 0.06, 1.64), 0xffc107, 0, 0.56, 0));
      add('vc', P(Cone(0.16, 0.22, 5), 0xffd54f, 0, 1.0, 0.86, Math.PI / 2));
      if (!low) for (const x of [-0.12, 0, 0.12]) add('glow', P(Sph(0.035, 6, 4), 0xff1744, x, 1.0 + (x ? 0 : 0.04), 0.9));
    } else if (id === 'carbon') {
      for (const sx of [-1, 1]) {
        add('vc', P(Box(0.04, 0.72, 1.6), 0x1c1c1c, sx * 0.56, 0.92, 0));
        add('vc', P(Box(0.045, 0.08, 1.5), 0xd50000, sx * 0.565, 1.12, 0));
        if (!low) for (let i = 0; i < 4; i++) add('vc', P(Box(0.046, 0.6, 0.06), 0x3a3a3a, sx * 0.567, 0.9, -0.6 + i * 0.4, 0.6));
      }
      add('vc', P(Box(1.12, 0.72, 0.04), 0x1c1c1c, 0, 0.92, 0.8));
      add('vc', P(Box(1.12, 0.72, 0.04), 0x1c1c1c, 0, 0.92, -0.8));
      add('vc', P(Box(1.1, 0.04, 1.6), 0x2a2a2a, 0, 0.56, 0));
    }
  } else if (slot === 'handle') {
    if (id === 'bike') {
      add('vc', P(Cyl(0.035, 0.035, 0.6, s), 0x90a4ae, 0, 1.38, -0.95, 0, 0, Math.PI / 2));
      for (const sx of [-1, 1]) {
        add('vc', P(Cyl(0.032, 0.032, 0.36, s), 0x90a4ae, sx * 0.42, 1.47, -1.0, 0.5, 0, sx * 1.0));
        add('vc', P(Cyl(0.05, 0.05, 0.2, s), 0x212121, sx * 0.6, 1.56, -1.06, 0, 0, Math.PI / 2));
        add('vc', P(Box(0.05, 0.3, 0.05), 0x90a4ae, sx * 0.55, 1.28, -0.88));
      }
      add('vc', P(Sph(0.06, s, s >> 1), 0xffd600, 0.2, 1.44, -0.95));
    } else if (id === 'wheel') {
      add('vc', P(Cyl(0.04, 0.04, 0.55, s), 0x424242, 0, 1.25, -0.9, -0.55));
      add('vc', P(Tor(0.27, 0.045, low ? 4 : 8, low ? 12 : 22), 0x212121, 0, 1.48, -1.05, -0.35));
      for (const a of [0, (2 * Math.PI) / 3, (4 * Math.PI) / 3])
        add('vc', P(Box(0.25, 0.04, 0.03), 0x9e9e9e, Math.cos(a) * 0.13, 1.48 + Math.sin(a) * 0.12, -1.05, -0.35, 0, a));
      add('vc', P(Box(0.06, 0.08, 0.06), 0xe53935, 0, 1.75, -1.15, -0.35));
      add('vc', P(Box(0.04, 0.3, 0.04), 0x424242, -0.55, 1.28, -0.88));
      add('vc', P(Box(0.04, 0.3, 0.04), 0x424242, 0.55, 1.28, -0.88));
    }
  } else if (slot === 'boost') {
    if (id === 'rocket' || id === 'rocketb') {
      for (const sx of [-1, 1]) {
        const x = sx * 0.66;
        add('vc', P(Cyl(0.12, 0.12, 0.7, s), 0xeceff1, x, 0.85, -0.3, Math.PI / 2));
        add('vc', P(Cone(0.12, 0.25, s), id === 'rocket' ? 0xe53935 : 0x1565c0, x, 0.85, 0.17, Math.PI / 2));
        add('vc', P(Cyl(0.09, 0.13, 0.12, s), 0x424242, x, 0.85, -0.7, Math.PI / 2));
        add('vc', P(Box(0.02, 0.18, 0.2), id === 'rocket' ? 0xe53935 : 0x1565c0, x + sx * 0.12, 0.85, -0.55));
        add('vc', P(Box(0.05, 0.05, 0.4), 0x9e9e9e, sx * 0.58, 0.85, -0.3));
        add('flame', P(Cone(0.1, 0.5, s), id === 'rocket' ? 0xff9100 : 0x40c4ff, x, 0.85, -1.0, -Math.PI / 2));
      }
    } else if (id === 'double') {
      for (const sx of [-1, 1]) {
        add('vc', P(Cyl(0.06, 0.06, 0.7, s), 0xcfd8dc, sx * 0.25, 0.22, -0.55, Math.PI / 2 - 0.15));
        add('vc', P(Cyl(0.085, 0.07, 0.16, s), 0x90a4ae, sx * 0.25, 0.27, -0.92, Math.PI / 2 - 0.15));
        add('flame', P(Cone(0.07, 0.35, s), 0x82b1ff, sx * 0.25, 0.3, -1.15, -Math.PI / 2 - 0.15));
      }
    }
  } else if (slot === 'top') {
    if (id === 'wing') {
      for (const sx of [-1, 1]) add('vc', P(Box(0.05, 0.36, 0.08), 0x212121, sx * 0.42, 1.48, 0.72));
      add('vc', P(Box(1.4, 0.05, 0.38), 0xd32f2f, 0, 1.68, 0.76, -0.12));
      for (const sx of [-1, 1]) add('vc', P(Box(0.04, 0.2, 0.42), 0x212121, sx * 0.71, 1.68, 0.76));
    } else if (id === 'flag') {
      add('vc', P(Cyl(0.02, 0.02, 1.3, low ? 4 : 6), 0xbdbdbd, 0.56, 1.95, -0.75));
      const n = low ? 2 : 4;
      for (let i = 0; i < n; i++)
        for (let j = 0; j < 3; j++)
          add(
            'vc',
            P(Box(0.02, 0.12, 0.6 / n), (i + j) % 2 ? 0x111111 : 0xffffff, 0.56, 2.48 - j * 0.12, -0.75 + 0.06 + (i + 0.5) * (0.6 / n)),
          );
    } else if (id === 'cat') {
      for (const sx of [-1, 1]) {
        add('vc', P(Cone(0.17, 0.32, 4), 0x37474f, sx * 0.36, 1.48, 0.78, 0, Math.PI / 4, 0, 1, 1, 0.55));
        add('vc', P(Cone(0.09, 0.18, 4), 0xff80ab, sx * 0.36, 1.45, 0.82, 0, Math.PI / 4, 0, 1, 1, 0.3));
        if (!low)
          for (const dy of [-0.04, 0.04]) add('vc', P(Box(0.28, 0.012, 0.012), 0x37474f, sx * 0.62, 1.05 + dy, 0.83, 0, 0, sx * dy * 4));
      }
      add('vc', P(Sph(0.06, s, s >> 1), 0xff80ab, 0, 1.1, 0.84));
    } else if (id === 'balloon') {
      add('vc', P(Cyl(0.006, 0.006, 1.3, 3), 0xeeeeee, 0.5, 1.95, -0.7));
      for (const sx of [-1, 1]) add('vc', P(Sph(0.17, s, s >> 1), 0xff4081, 0.5 + sx * 0.11, 2.78, -0.7));
      add('vc', P(Cone(0.235, 0.32, s), 0xff4081, 0.5, 2.58, -0.7, Math.PI));
    }
  } else if (slot === 'trail') {
    const p = partOf('trail', id);
    if (p && p.cols)
      p.cols.forEach((c, i) => add('glow', P(Box(0.9, 0.025, 1.4 / p.cols.length), c, 0, 0.26, -0.7 + (i + 0.5) * (1.4 / p.cols.length))));
  }
}

const addonCache = new Map();
/** Merged add-on geometry for a loadout: [{ key, geo, mat }] (shared between carts — never dispose). */
export function addonMeshes(lo, low) {
  lo = cleanLoadout(lo);
  const key = ['body', 'handle', 'boost', 'top', 'trail'].map(s => lo[s]).join('|') + (low ? 'L' : 'H');
  if (addonCache.has(key)) return addonCache.get(key);
  const out = {};
  for (const s of ['body', 'handle', 'boost', 'top', 'trail']) pieces(s, lo[s], low, out);
  const L = Object.entries(out).map(([k, g]) => ({ key: k, geo: merge(g), mat: k === 'flame' ? null : MAT[k] }));
  if (addonCache.size > 64) addonCache.delete(addonCache.keys().next().value); // old entries may still be in use: no dispose (small)
  addonCache.set(key, L);
  return L;
}
/** Flame material (per cart: its opacity pulses with boost). */
export function flameMat() {
  return new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false });
}
/** Paint: { col (rim/handle colour or null = character colour), decal: { geo, mat } | null }. */
export function paintKit(id) {
  const p = partOf('paint', id);
  if (!p || !p.pat) return { col: null, decal: null };
  return { col: p.col, decal: { geo: decalGeometry(), mat: decalMat(p) } };
}
export const trailCols = id => (partOf('trail', id) || {}).cols || null;
