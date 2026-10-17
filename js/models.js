/**
 * models.js — low-poly meshes: shopping cart (with character rider + decoration), customers (chibi shoppers), LOD proxies.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeRacer, makeDeco, charOf, vcToon as vcToonC, getFaceTex as racerFaceTex, facePatch, FACE as RFACE } from './chars.js';
import { lm } from './util.js';

// Simple person; pivot at feet, faces +z
// wire grid on a box: lines along each face
function wireBasket(w, h, d, step) {
  const v = [];
  const add = (a, b) => v.push(...a, ...b);
  for (let x = -w / 2; x <= w / 2 + 1e-6; x += step) {
    add([x, 0, -d / 2], [x, h, -d / 2]);
    add([x, 0, d / 2], [x, h, d / 2]);
    add([x, 0, -d / 2], [x, 0, d / 2]);
  }
  for (let z = -d / 2; z <= d / 2 + 1e-6; z += step) {
    add([-w / 2, 0, z], [-w / 2, h, z]);
    add([w / 2, 0, z], [w / 2, h, z]);
    add([-w / 2, 0, z], [w / 2, 0, z]);
  }
  for (let y = 0; y <= h + 1e-6; y += step) {
    add([-w / 2, y, -d / 2], [w / 2, y, -d / 2]);
    add([-w / 2, y, d / 2], [w / 2, y, d / 2]);
    add([-w / 2, y, -d / 2], [-w / 2, y, d / 2]);
    add([w / 2, y, -d / 2], [w / 2, y, d / 2]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  return g;
}

export function makeCart(color, charId, opt = {}) {
  const root = new THREE.Group();
  const cart = new THREE.Group();
  cart.position.z = 0.5;
  root.add(cart);
  const basket = new THREE.LineSegments(wireBasket(1.1, 0.75, 1.6, 0.18), new THREE.LineBasicMaterial({ color: 0xcfd8dc }));
  basket.position.y = 0.55;
  cart.add(basket);
  const colM = new THREE.MeshToonMaterial({ color }),
    metal = lm(0x9e9e9e);
  const rim = new THREE.Mesh(new THREE.BoxGeometry(1.16, 0.06, 1.66), colM);
  rim.position.y = 1.3;
  cart.add(rim);
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.05, 1.5), metal);
  base.position.y = 0.3;
  cart.add(base);
  {
    const pg = new THREE.BoxGeometry(0.05, 0.3, 0.05),
      parts = [];
    for (const [x, z] of [
      [-0.4, -0.7],
      [0.4, -0.7],
      [-0.4, 0.7],
      [0.4, 0.7],
    ])
      parts.push(pg.clone().translate(x, 0.38, z));
    for (const s of [-1, 1]) parts.push(new THREE.BoxGeometry(0.04, 0.3, 0.04).translate(s * 0.55, 1.3, -0.88));
    cart.add(new THREE.Mesh(mergeGeometries(parts), metal));
  }
  const wheels = [];
  const wg = new THREE.CylinderGeometry(0.12, 0.12, 0.08, 12);
  wg.rotateZ(Math.PI / 2);
  const wm = lm(0x222222);
  for (const [x, z] of [
    [-0.4, -0.7],
    [0.4, -0.7],
    [-0.4, 0.7],
    [0.4, 0.7],
  ]) {
    const w = new THREE.Mesh(wg, wm);
    w.position.set(x, 0.12, z);
    cart.add(w);
    wheels.push(w);
  }
  const hb = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.2, 8), colM);
  hb.rotation.z = Math.PI / 2;
  hb.position.set(0, 1.4, -0.95);
  cart.add(hb);
  let person = null,
    deco = null,
    roll = 0,
    ph = 0,
    t = 0;
  const api = {
    root,
    pose: null,
    get person() {
      return person;
    },
    charId: null,
    setChar(id) {
      id = charOf(id).id;
      if (id === api.charId && person) return;
      api.charId = id;
      const def = charOf(id);
      if (person) {
        root.remove(person.root);
        person.dispose();
      }
      if (deco) {
        cart.remove(deco);
        deco.geometry.dispose();
        deco = null;
      }
      person = makeRacer(def, opt);
      person.root.position.z = -0.95;
      root.add(person.root);
      deco = makeDeco(id);
      if (deco) cart.add(deco);
      colM.color.setHex(def.color);
    },
    face(n) {
      if (person) person.face(n);
    },
    update(v, dt) {
      t += dt;
      roll += (v * dt) / 0.12;
      wheels.forEach(w => (w.rotation.x = roll));
      ph += Math.abs(v) * dt * 2.2;
      if (!person) return;
      if (api.pose === 'win') person.win(t);
      else if (Math.abs(v) > 0.3) person.walk(ph, Math.min(1, Math.abs(v) / 15));
      else person.idle(t);
      person.tick(dt);
    },
  };
  api.setChar(charId);
  return api;
}

// Chibi pusher: big round head, sparkly eyes, blush, hat, tiny body. pal = {skin, shirt, hat, hair, pants}
export function makeChibi(pal) {
  const root = new THREE.Group(),
    bob = new THREE.Group();
  root.add(bob);
  const toon = c => new THREE.MeshToonMaterial({ color: c });
  const skinM = toon(pal.skin || 0xffe0c8);
  // body (small, rounded)
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 0.25, 6, 12), toon(pal.shirt));
  body.position.y = 0.62;
  bob.add(body);
  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), toon(0xffffff));
  belly.scale.set(1, 1, 0.5);
  belly.position.set(0, 0.58, 0.16);
  bob.add(belly);
  // head
  const headG = new THREE.Group();
  headG.position.y = 1.25;
  bob.add(headG);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.46, 24, 18), skinM);
  head.scale.set(1.05, 0.95, 1);
  headG.add(head);
  // hair back + bangs
  const hairM = toon(pal.hair);
  const hairB = new THREE.Mesh(new THREE.SphereGeometry(0.48, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.55), hairM);
  hairB.rotation.x = -0.35;
  hairB.position.y = 0.02;
  headG.add(hairB);
  // eyes
  const black = new THREE.MeshBasicMaterial({ color: 0x1a1020 }),
    white = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const pink = new THREE.MeshBasicMaterial({ color: 0xff8fb0, transparent: true, opacity: 0.75 });
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.085, 14, 12), black);
    eye.scale.set(0.85, 1.25, 0.5);
    eye.position.set(s * 0.17, -0.02, 0.42);
    headG.add(eye);
    const hl = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), white);
    hl.position.set(s * 0.17 + 0.03, 0.04, 0.47);
    headG.add(hl);
    const hl2 = new THREE.Mesh(new THREE.SphereGeometry(0.014, 6, 6), white);
    hl2.position.set(s * 0.17 - 0.025, -0.06, 0.47);
    headG.add(hl2);
    const blush = new THREE.Mesh(new THREE.CircleGeometry(0.075, 14), pink);
    blush.position.set(s * 0.29, -0.14, 0.37);
    blush.rotation.y = s * 0.6;
    blush.scale.y = 0.6;
    headG.add(blush);
  }
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.012, 6, 12, Math.PI), black);
  mouth.rotation.z = Math.PI;
  mouth.position.set(0, -0.14, 0.45);
  headG.add(mouth);
  // hat: beanie with pompom
  const hatM = toon(pal.hat);
  const hat = new THREE.Mesh(new THREE.SphereGeometry(0.5, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.42), hatM);
  hat.position.y = 0.06;
  hat.rotation.x = -0.15;
  headG.add(hat);
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.43, 0.06, 8, 24), toon(0xffffff));
  band.rotation.x = Math.PI / 2 - 0.15;
  band.position.set(0, 0.22, -0.03);
  headG.add(band);
  const pom = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 10), toon(0xffffff));
  pom.position.set(0, 0.58, -0.08);
  headG.add(pom);
  // arms reaching to handle
  const arms = [];
  for (const s of [-1, 1]) {
    const ap = new THREE.Group();
    ap.position.set(s * 0.27, 0.8, 0.05);
    ap.rotation.x = -1.25;
    ap.rotation.z = s * 0.15;
    bob.add(ap);
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.3, 4, 8), toon(pal.shirt));
    arm.position.y = -0.22;
    ap.add(arm);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), skinM);
    hand.position.y = -0.45;
    ap.add(hand);
    arms.push(ap);
  }
  // little legs + shoes
  const legs = [];
  for (const s of [-1, 1]) {
    const lp = new THREE.Group();
    lp.position.set(s * 0.13, 0.38, 0);
    root.add(lp);
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 0.16, 4, 8), toon(pal.pants || 0x5c6bc0));
    leg.position.y = -0.16;
    lp.add(leg);
    const shoe = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), toon(pal.hat));
    shoe.scale.set(1, 0.6, 1.4);
    shoe.position.set(0, -0.32, 0.04);
    lp.add(shoe);
    legs.push(lp);
  }
  return {
    root,
    cheer(t, k = 1) {
      const j = Math.abs(Math.sin(t * 8));
      bob.position.y = j * 0.25 * k;
      arms.forEach((a, i) => {
        a.rotation.x = -2.9 + Math.sin(t * 10 + i) * 0.3 * k;
      });
      legs.forEach(l => (l.rotation.x = 0));
      headG.rotation.z = Math.sin(t * 4) * 0.12;
    },
    walk(ph, k = 1) {
      legs[0].rotation.x = Math.sin(ph) * 0.8 * k;
      legs[1].rotation.x = -Math.sin(ph) * 0.8 * k;
      const b = Math.abs(Math.sin(ph));
      bob.position.y = b * 0.12 * k;
      bob.scale.set(1 + (1 - b) * 0.06 * k, 1 - (1 - b) * 0.06 * k, 1);
      headG.rotation.z = Math.sin(ph) * 0.08 * k;
      headG.rotation.x = 0.1;
      arms.forEach(a => (a.rotation.x = -1.25 + Math.sin(ph * 2) * 0.05 * k));
    },
  };
}

// ---------- customer / cashier chibis (few draw calls: vertex-colored merged parts + face atlas) ----------
const vcMat = vcToonC;
const _c = new THREE.Color();
function part(g, col, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0) {
  g = g.index ? g : g;
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
// expression atlas: 0 normal, 1 happy, 2 dizzy, 3 angry, 4 shock
const FACE = RFACE;
let _cfg = null;
const custFaceG = () => _cfg || (_cfg = facePatch(0.365));
const starMat = new THREE.MeshBasicMaterial({ color: 0xffeb3b });
const starG = (() => {
  const parts = [];
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    parts.push(part(new THREE.OctahedronGeometry(0.07, 0), 0xffffff, Math.cos(a) * 0.32, 0, Math.sin(a) * 0.32, 1, 1, 0.5));
  }
  return merge(parts);
})();
const HAIRC = [0x3e2723, 0x5d4037, 0x212121, 0x8d6e63, 0xd7a35c, 0xb71c1c],
  SHIRTC = [0xef5350, 0x42a5f5, 0x66bb6a, 0xffa726, 0xab47bc, 0x26c6da, 0xf48fb1, 0xfff176, 0x8d6e63, 0x7986cb];
const SKINC = [0xffe0c8, 0xf6cfae, 0xe8b894, 0xd29c74];
export function makeCustomer(opt = {}) {
  const R = Math.random,
    pick = a => a[(R() * a.length) | 0];
  const age = opt.age || (R() < 0.22 ? 'kid' : R() < 0.25 ? 'grand' : 'adult');
  const skinC = pick(SKINC),
    hairC = age === 'grand' ? pick([0xbdbdbd, 0xe0e0e0, 0x9e9e9e]) : pick(HAIRC),
    shirtC = opt.shirt || pick(SHIRTC),
    pantsC = pick([0x3949ab, 0x5d4037, 0x37474f, 0x6d4c41, 0x1e88e5]);
  const style = opt.style || pick(age === 'grand' ? ['bun', 'short', 'cap'] : ['short', 'bun', 'pig', 'cap', 'long', 'spiky']);
  const skirt = !opt.uniform && R() < 0.35,
    basket = opt.basket ?? (!opt.uniform && age !== 'kid' && R() < 0.45);
  const root = new THREE.Group(),
    bob = new THREE.Group();
  root.add(bob);
  // body (+ skirt / apron)
  const bp = [
    part(new THREE.CapsuleGeometry(0.24, 0.26, 4, 10), shirtC, 0, 0.8, 0),
    part(new THREE.SphereGeometry(0.17, 10, 8), opt.uniform ? 0xffffff : shirtC, 0, 0.76, 0.12, 1, 1, 0.6),
  ];
  if (skirt) bp.push(part(new THREE.ConeGeometry(0.34, 0.36, 12, 1, true), pick([0xf06292, 0x9575cd, 0x4db6ac, 0xffb74d]), 0, 0.56, 0));
  if (opt.uniform)
    bp.push(
      part(new THREE.BoxGeometry(0.4, 0.5, 0.04), opt.uniform, 0, 0.72, 0.24),
      part(new THREE.BoxGeometry(0.16, 0.06, 0.02), 0xffffff, 0.08, 0.86, 0.27),
    );
  if (age === 'grand') bp.push(part(new THREE.CapsuleGeometry(0.25, 0.12, 4, 10), 0xa1887f, 0, 0.92, -0.02, 1.05, 1, 1.05)); // cardigan
  const body = new THREE.Mesh(merge(bp), vcMat);
  bob.add(body);
  // head + hair
  const headG = new THREE.Group();
  headG.position.y = 1.3;
  bob.add(headG);
  const LQ = !!opt.low,
    hp = [part(new THREE.SphereGeometry(0.36, LQ ? 12 : 20, LQ ? 9 : 16), skinC, 0, 0, 0, 1.05, 0.95, 1)];
  const hemi = (c, y = 0.03, sc = 1) =>
    part(
      new THREE.SphereGeometry(0.38 * sc, LQ ? 10 : 16, LQ ? 6 : 10, 0, Math.PI * 2, 0, Math.PI * 0.55),
      c,
      0,
      y,
      -0.02,
      1.05,
      1,
      1,
      -0.3,
    );
  if (style === 'short') hp.push(hemi(hairC));
  if (style === 'bun') hp.push(hemi(hairC), part(new THREE.SphereGeometry(0.15, 10, 8), hairC, 0, 0.36, -0.12));
  if (style === 'pig')
    hp.push(
      hemi(hairC),
      part(new THREE.SphereGeometry(0.13, 10, 8), hairC, -0.36, -0.05, -0.05, 1, 1.4, 1),
      part(new THREE.SphereGeometry(0.13, 10, 8), hairC, 0.36, -0.05, -0.05, 1, 1.4, 1),
    );
  if (style === 'long') hp.push(hemi(hairC), part(new THREE.BoxGeometry(0.62, 0.5, 0.2), hairC, 0, -0.18, -0.24));
  if (style === 'spiky') {
    hp.push(hemi(hairC));
    for (let k = 0; k < 5; k++)
      hp.push(part(new THREE.ConeGeometry(0.08, 0.2, 6), hairC, (k - 2) * 0.12, 0.34, -0.05, 1, 1, 1, -0.3, 0, (k - 2) * 0.25));
  }
  if (style === 'cap' || opt.uniform) {
    const cc = opt.uniform || pick([0xe53935, 0x1e88e5, 0xfdd835, 0x43a047]);
    hp.push(
      hemi(hairC, 0, 0.97),
      part(new THREE.SphereGeometry(0.385, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.38), cc, 0, 0.06, 0),
      part(new THREE.CylinderGeometry(0.2, 0.2, 0.03, 12), cc, 0, 0.16, 0.34, 1.2, 1, 1, 0.25),
    );
  }
  if (age === 'grand')
    hp.push(
      part(new THREE.TorusGeometry(0.075, 0.012, 6, 14), 0x5d4037, -0.13, 0.0, 0.36),
      part(new THREE.TorusGeometry(0.075, 0.012, 6, 14), 0x5d4037, 0.13, 0.0, 0.36),
    );
  const head = new THREE.Mesh(merge(hp), vcMat);
  headG.add(head);
  const fm = new THREE.MeshBasicMaterial({ map: racerFaceTex().clone(), transparent: true, depthWrite: false });
  fm.map.needsUpdate = true;
  const face = new THREE.Mesh(custFaceG(), fm);
  face.position.y = -0.03;
  headG.add(face);
  const stars = new THREE.Mesh(starG, starMat);
  stars.position.y = 0.5;
  stars.visible = false;
  headG.add(stars);
  // arms (left may carry a basket) and legs
  const arms = [],
    legs = [];
  for (const s of [-1, 1]) {
    const ap = new THREE.Group();
    ap.position.set(s * 0.27, 1.0, 0);
    bob.add(ap);
    const ag = [
      part(new THREE.CapsuleGeometry(0.065, 0.26, 4, 8), shirtC, 0, -0.2, 0),
      part(new THREE.SphereGeometry(0.075, 8, 6), skinC, 0, -0.4, 0),
    ];
    if (basket && s < 0)
      ag.push(
        part(new THREE.BoxGeometry(0.34, 0.2, 0.24), 0xd32f2f, -0.02, -0.56, 0.06),
        part(new THREE.TorusGeometry(0.12, 0.015, 4, 12, Math.PI), 0xb71c1c, -0.02, -0.46, 0.06),
        part(new THREE.BoxGeometry(0.1, 0.12, 0.08), pick([0xffeb3b, 0x81c784, 0xfff]), 0.04, -0.42, 0.06),
      );
    ap.add(new THREE.Mesh(merge(ag), vcMat));
    arms.push(ap);
    const lp = new THREE.Group();
    lp.position.set(s * 0.12, 0.5, 0);
    root.add(lp);
    lp.add(
      new THREE.Mesh(
        merge([
          part(new THREE.CapsuleGeometry(0.075, 0.26, 4, 8), skirt ? skinC : pantsC, 0, -0.22, 0),
          part(new THREE.SphereGeometry(0.09, 8, 6), pick([0x212121, 0xffffff, 0xe53935, 0x795548]), 0, -0.44, 0.04, 1, 0.6, 1.4),
        ]),
        vcMat,
      ),
    );
    legs.push(lp);
  }
  const sc = age === 'kid' ? 0.72 : age === 'grand' ? 0.92 : 1;
  root.scale.setScalar(sc);
  if (age === 'grand') {
    bob.rotation.x = 0.12;
    headG.position.z = 0.06;
  }
  let curFace = -1;
  const blinkPh = Math.random() * 4;
  // bigger, cuter head (chibi proportions)
  headG.scale.setScalar(1.18);
  headG.position.y = 1.36;
  // low quality: one merged rest-pose proxy (1 draw call instead of ~8) for customers at a distance; lod(2) hides entirely
  let proxy = null,
    lodL = 0;
  if (LQ) {
    root.updateMatrixWorld(true);
    const inv = root.matrixWorld.clone().invert(),
      gs = [];
    for (const m of [body, head, ...arms.map(a => a.children[0]), ...legs.map(l => l.children[0])]) {
      const g = m.geometry.clone();
      g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
      gs.push(g);
    }
    proxy = new THREE.Mesh(mergeGeometries(gs, false), vcMat);
    gs.forEach(g => g.dispose());
    proxy.visible = false;
    root.add(proxy);
  }
  const api = {
    root,
    age,
    scale: sc,
    basket,
    lod(l) {
      if (!proxy || l === lodL) return;
      lodL = l;
      bob.visible = l === 0;
      legs.forEach(g => (g.visible = l === 0));
      proxy.visible = l === 1;
    },
    face(name) {
      let f = FACE[name] ?? 0;
      if (f === 0 && (performance.now() / 1000 + blinkPh) % 4 < 0.13) f = 1;
      if (f !== curFace) {
        curFace = f;
        fm.map.offset.x = f / 9;
      }
    },
    stars(on, t) {
      stars.visible = on;
      if (on) stars.rotation.y = t * 5;
    },
    walk(ph, k = 1) {
      legs[0].rotation.x = Math.sin(ph) * 0.6;
      legs[1].rotation.x = -Math.sin(ph) * 0.6;
      arms[0].rotation.set(basket ? -0.15 : -Math.sin(ph) * 0.5, 0, 0);
      arms[1].rotation.set(Math.sin(ph) * 0.5, 0, 0);
      bob.position.y = Math.abs(Math.sin(ph)) * 0.04 * k;
      headG.rotation.z = Math.sin(ph) * 0.05;
    },
    // seated in a cart basket: legs forward & dangling, arms by mood
    sit(t, mood, k) {
      const kick = Math.sin(t * 7) * 0.35 * (0.3 + k);
      legs[0].rotation.x = -1.35 + kick;
      legs[1].rotation.x = -1.35 - kick;
      bob.position.y = 0;
      if (mood === 'happy') {
        arms[0].rotation.set(-2.7 + Math.sin(t * 12) * 0.3, 0, -0.3);
        arms[1].rotation.set(-2.7 - Math.sin(t * 12) * 0.3, 0, 0.3);
      } else if (mood === 'shock') {
        arms[0].rotation.set(-1.6, 0, -0.9);
        arms[1].rotation.set(-1.6, 0, 0.9);
      } else {
        arms[0].rotation.set(-0.9, 0, -0.5);
        arms[1].rotation.set(-0.9, 0, 0.5);
      }
      headG.rotation.z = Math.sin(t * 3) * 0.12;
    },
    pose(kind, t) {
      // cashier / podium poses
      if (kind === 'cheer') {
        const j = Math.abs(Math.sin(t * 9));
        bob.position.y = j * 0.18;
        arms[0].rotation.set(-2.8 + j * 0.4, 0, -0.3);
        arms[1].rotation.set(-2.8 + j * 0.4, 0, 0.3);
        legs[0].rotation.x = legs[1].rotation.x = 0;
      } else if (kind === 'shock') {
        bob.position.y = 0.05;
        arms[0].rotation.set(-2.2, 0, -0.6);
        arms[1].rotation.set(-2.2, 0, 0.6);
      } else if (kind === 'fist') {
        arms[0].rotation.set(-2.6 + Math.sin(t * 14) * 0.5, 0, -0.2);
        arms[1].rotation.set(0, 0, 0.2);
      } else {
        bob.position.y = 0;
        arms[0].rotation.set(-0.5, 0, 0);
        arms[1].rotation.set(-0.5, 0, 0);
        legs[0].rotation.x = legs[1].rotation.x = 0;
        headG.rotation.z = Math.sin(t * 2) * 0.06;
      }
    },
  };
  return api;
}
