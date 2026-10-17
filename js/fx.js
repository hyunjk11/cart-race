// Presentation layer: comic hit text, screen flash, speed lines, confetti, PA banners, checkout area with cashiers, results podium.
import * as THREE from 'three';
import { makeChibi, makeCustomer } from './models.js';
import { makeRacer } from './chars.js';
const $ = id => document.getElementById(id);
let LOW = false,
  cam = null;
export function initFx(o) {
  LOW = o.low;
  cam = o.camera;
  if (LOW) CN = 70;
}

// ---------- comic text ("POW!") ----------
const comics = [];
const _v = new THREE.Vector3();
export function comic(x, y, z, text, col = '#ffeb3b') {
  if (comics.length > (LOW ? 2 : 5)) {
    const o = comics.shift();
    o.el.remove();
  }
  const el = document.createElement('div');
  el.className = 'comic';
  el.textContent = text;
  el.style.setProperty('--c', col);
  el.style.setProperty('--r', ((Math.random() - 0.5) * 24).toFixed(0) + 'deg');
  $('fx').appendChild(el);
  comics.push({ el, x, y, z, t: 0 });
}
export function updateComic(dt) {
  for (let i = comics.length - 1; i >= 0; i--) {
    const c = comics[i];
    c.t += dt;
    if (c.t > 0.9) {
      c.el.remove();
      comics.splice(i, 1);
      continue;
    }
    _v.set(c.x, c.y + c.t * 0.8, c.z).project(cam);
    if (_v.z > 1) {
      c.el.style.display = 'none';
      continue;
    }
    c.el.style.display = '';
    c.el.style.left = (_v.x * 0.5 + 0.5) * innerWidth + 'px';
    c.el.style.top = (-_v.y * 0.5 + 0.5) * innerHeight + 'px';
    c.el.style.opacity = Math.min(1, (0.9 - c.t) * 4);
  }
}
export function screenFlash(col = '#fff', a = 0.45) {
  if (document.body.classList.contains('reduce-motion')) return;
  const f = $('flash');
  f.style.transition = 'none';
  f.style.background = col;
  f.style.opacity = a;
  void f.offsetWidth;
  f.style.transition = 'opacity .35s';
  f.style.opacity = 0;
}
export function setSpeedLines(k) {
  const s = $('speedlines');
  if (LOW) {
    s.style.opacity = 0;
    return;
  }
  s.style.opacity = k.toFixed(2);
}

// ---------- confetti (instanced) ----------
let CN = 260;
let conf = null;
const cp = [],
  cv = [],
  cr = [];
let cAlive = 0;
function ensureConf() {
  if (conf) return conf;
  const g = new THREE.PlaneGeometry(0.16, 0.24);
  conf = new THREE.InstancedMesh(g, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), CN);
  conf.frustumCulled = false;
  const cols = [0xff4081, 0xffeb3b, 0x40c4ff, 0x69f0ae, 0xff9100, 0xe040fb],
    c = new THREE.Color();
  for (let i = 0; i < CN; i++) {
    conf.setColorAt(i, c.setHex(cols[i % cols.length]));
    cp.push(new THREE.Vector3(0, -99, 0));
    cv.push(new THREE.Vector3());
    cr.push(new THREE.Euler());
  }
  return conf;
}
export function confetti(parent, x, y, z, n = 160, spread = 6) {
  ensureConf();
  parent.add(conf);
  n = LOW ? Math.min(n, 70) : Math.min(n, CN);
  for (let k = 0; k < n; k++) {
    const i = (cAlive + k) % CN;
    cp[i].set(x + (Math.random() - 0.5) * spread, y + Math.random() * 2, z + (Math.random() - 0.5) * spread);
    cv[i].set((Math.random() - 0.5) * 6, 3 + Math.random() * 6, (Math.random() - 0.5) * 6);
    cr[i].set(Math.random() * 6, Math.random() * 6, 0);
  }
  cAlive = (cAlive + n) % CN;
  conf.visible = true;
}
const _m = new THREE.Matrix4(),
  _q = new THREE.Quaternion(),
  _s = new THREE.Vector3(1, 1, 1);
export function updateConfetti(dt) {
  if (!conf || !conf.visible) return;
  let any = false;
  for (let i = 0; i < CN; i++) {
    const p = cp[i];
    if (p.y < -50) {
      _m.makeScale(0, 0, 0);
      conf.setMatrixAt(i, _m);
      continue;
    }
    any = true;
    cv[i].y -= 6 * dt;
    cv[i].multiplyScalar(1 - 1.8 * dt);
    cv[i].y = Math.max(cv[i].y, -1.6);
    p.addScaledVector(cv[i], dt);
    p.x += Math.sin(p.y * 3 + i) * dt * 0.6;
    cr[i].x += dt * 7;
    cr[i].y += dt * 5;
    if (p.y < (conf.userData.floor ?? 0) - 0.1 || p.y < -40) p.y = -99;
    _q.setFromEuler(cr[i]);
    _m.compose(p, _q, _s);
    conf.setMatrixAt(i, _m);
  }
  conf.instanceMatrix.needsUpdate = true;
  if (!any) conf.visible = false;
}
export function confettiFloor(y) {
  ensureConf().userData.floor = y;
}

// ---------- store PA announcer ----------
// PA banner: wall-clock deadlines + watchdog, so it can never get stuck (timer throttling, overlapping messages, hidden tabs)
const paQ = [];
let paUntil = 0,
  paNextAt = 0,
  paChime = null;
const PA_SHOW = 3400,
  PA_GAP = 450;
export function pa(text, chime) {
  paChime = chime || paChime;
  paQ.push(text);
  if (paQ.length > 2) paQ.splice(0, paQ.length - 2);
  paPump();
}
function paPump() {
  const el = $('pa');
  if (!el) return;
  const now = Date.now();
  if (paUntil && now >= paUntil) {
    el.classList.remove('show');
    paUntil = 0;
    paNextAt = now + PA_GAP;
  }
  if (!paUntil && paQ.length && now >= paNextAt) {
    const t = paQ.shift();
    el.innerHTML = `<span class="ding">🔔 딩동댕~</span> ${t}`;
    el.classList.add('show');
    paUntil = now + PA_SHOW;
    if (paChime) paChime();
  }
}
export function paHide() {
  paQ.length = 0;
  paUntil = 0;
  const el = $('pa');
  if (el) el.classList.remove('show');
}
setInterval(paPump, 200);

// ---------- checkout area with cashiers next to the finish line ----------
export function buildCheckout(scene, { path, strips, HW, inSign, hAt, textSprite, tangentAt }) {
  const group = new THREE.Group();
  scene.add(group);
  const cashiers = [];
  const p0 = path[0],
    [tx, tz] = tangentAt(0),
    L = [-tz, tx],
    out = -inSign,
    ax = Math.abs(tx) > 0.5;
  const lm = c => new THREE.MeshLambertMaterial({ color: c });
  const bodyM = lm(0xfafafa),
    redM = lm(0xe53935),
    beltM = lm(0x37474f),
    regM = lm(0x455a64),
    scrM = new THREE.MeshBasicMaterial({ color: 0x80deea });
  [
    [6, 1],
    [-10, 2],
  ].forEach(([along, num], k) => {
    const cx = p0.x + tx * along + L[0] * out * (HW - 0.85),
      cz = p0.y + tz * along + L[1] * out * (HW - 0.85),
      y = hAt(cx, cz);
    const w = ax ? 2.8 : 1.7,
      d = ax ? 1.7 : 2.8;
    strips.push({ x0: cx - w / 2, x1: cx + w / 2, z0: cz - d / 2, z1: cz + d / 2, nx: 0, nz: 0, kind: 'counter' });
    const cw = ax ? 2.8 : 0.8,
      cd = ax ? 0.8 : 2.8,
      inX = -L[0] * out * 0.42,
      inZ = -L[1] * out * 0.42; // counter toward the aisle, cashier behind it
    const base = new THREE.Mesh(new THREE.BoxGeometry(cw, 0.9, cd), bodyM);
    base.position.set(cx + inX, y + 0.45, cz + inZ);
    group.add(base);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(cw + 0.02, 0.12, cd + 0.02), redM);
    stripe.position.set(cx + inX, y + 0.7, cz + inZ);
    group.add(stripe);
    const belt = new THREE.Mesh(new THREE.BoxGeometry(ax ? 1.9 : 0.6, 0.04, ax ? 0.6 : 1.9), beltM);
    belt.position.set(cx + inX - tx * 0.4, y + 0.92, cz + inZ - tz * 0.4);
    group.add(belt);
    const reg = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.3, 0.4), regM);
    reg.position.set(cx + inX + tx * 0.9, y + 1.05, cz + inZ + tz * 0.9);
    group.add(reg);
    const scr = new THREE.Mesh(new THREE.BoxGeometry(ax ? 0.36 : 0.05, 0.22, ax ? 0.05 : 0.36), scrM);
    scr.position.set(reg.position.x + L[0] * out * 0.1, y + 1.33, reg.position.z + L[1] * out * 0.1);
    group.add(scr);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.2), regM);
    pole.position.set(cx + inX + tx * 1.3, y + 1.1, cz + inZ + tz * 1.3);
    group.add(pole);
    const sign = textSprite(`💳 계산대 ${num}`, '#e53935');
    sign.position.set(pole.position.x, y + 2.5, pole.position.z);
    sign.scale.set(2.2, 0.55, 1);
    group.add(sign);
    const g = makeCustomer({ age: 'adult', uniform: k ? 0x43a047 : 0xe53935, basket: false });
    const sx = cx + L[0] * out * 0.55,
      sz = cz + L[1] * out * 0.55;
    g.root.position.set(sx, y, sz);
    g.root.rotation.y = Math.atan2(-L[0] * out, -L[1] * out);
    group.add(g.root);
    cashiers.push({ g, x: sx, z: sz, mode: 'idle', t: 0, mt: 0, sayCd: 0, holder: g.root });
  });
  return {
    group,
    cashiers,
    react(mode, dur) {
      for (const c of cashiers)
        if (c.mode !== 'cheer' || mode === 'cheer') {
          c.mode = mode;
          c.mt = dur;
        }
    },
    update(dt, carts) {
      for (const c of cashiers) {
        c.t += dt;
        c.mt -= dt;
        if (c.mt <= 0) c.mode = 'idle';
        if (c.mode === 'idle')
          for (const k of carts)
            if (!k.inactive && Math.abs(k.v) > 11 && Math.hypot(k.x - c.x, k.z - c.z) < 4.5) {
              c.mode = 'shock';
              c.mt = 1.2;
            }
        c.g.pose(c.mode, c.t);
        c.g.face(c.mode === 'cheer' ? 'happy' : c.mode === 'shock' ? 'shock' : 'normal');
      }
    },
    dispose() {
      scene.remove(group);
      group.traverse(o => {
        if (o.geometry && o.geometry !== undefined && !o.isSprite) o.geometry.dispose();
        if (o.isSprite) {
          o.material.map.dispose();
          o.material.dispose();
        }
      });
    },
  };
}

// ---------- results podium (own little scene) ----------
let pod = null;
export function showPodium(entries, textSprite) {
  hidePodium();
  const sc = new THREE.Scene();
  const bg = document.createElement('canvas');
  bg.width = 4;
  bg.height = 256;
  const g = bg.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, '#ff9ad5');
  gr.addColorStop(0.55, '#ffd36e');
  gr.addColorStop(1, '#7ad7ff');
  g.fillStyle = gr;
  g.fillRect(0, 0, 4, 256);
  sc.background = new THREE.CanvasTexture(bg);
  sc.background.colorSpace = THREE.SRGBColorSpace;
  sc.add(new THREE.HemisphereLight(0xffffff, 0x886688, 1.6));
  const dl = new THREE.DirectionalLight(0xffffff, 1.3);
  dl.position.set(3, 8, 6);
  sc.add(dl);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(9, 40), new THREE.MeshLambertMaterial({ color: 0xfff3e0 }));
  floor.rotation.x = -Math.PI / 2;
  sc.add(floor);
  const steps = [
      [0, 1.5, 0xffd54f],
      [-2.1, 1.0, 0xe0e0e0],
      [2.1, 0.65, 0xffab91],
    ],
    chars = [];
  entries.slice(0, 3).forEach((e, i) => {
    const [x, h, col] = steps[i];
    const b = new THREE.Mesh(new THREE.BoxGeometry(1.9, h, 1.6), new THREE.MeshLambertMaterial({ color: col }));
    b.position.set(x, h / 2, 0);
    sc.add(b);
    const num = textSprite(['1', '2', '3'][i], ['#f9a825', '#9e9e9e', '#e64a19'][i]);
    num.position.set(x, h / 2, 0.82);
    num.scale.set(1.2, 0.3, 1);
    num.center.set(0.5, 0.5);
    sc.add(num);
    const ch = e.char
      ? makeRacer(e.char, { low: LOW })
      : makeChibi(e.pal || { shirt: 0xffffff, hat: e.color || 0xff4081, hair: 0x5d4037, pants: 0x5c6bc0 });
    ch.root.position.set(x, h, 0.1);
    ch.root.scale.setScalar(1.25);
    sc.add(ch.root);
    const nm = textSprite(e.name, '#' + (e.color ?? 0x333333).toString(16).padStart(6, '0'));
    nm.position.set(x, h + 2.6, 0);
    nm.scale.set(2.2, 0.55, 1);
    sc.add(nm);
    chars.push({ ch, i });
  });
  const pc = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 100);
  pod = { sc, pc, chars, t: 0 };
  confettiFloor(0);
  confetti(sc, 0, 5, 0, 220, 7);
}
export function hidePodium() {
  if (!pod) return;
  pod.sc.traverse(o => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      if (o.material.map) o.material.map.dispose();
      o.material.dispose?.();
    }
  });
  if (conf && conf.parent === pod.sc) pod.sc.remove(conf);
  pod = null;
}
export const podiumActive = () => !!pod;
let podShift = 0;
export function setPodiumShift(k) {
  podShift = k;
}
export function renderPodium(renderer, dt) {
  const P = pod;
  P.t += dt;
  const port = innerWidth < innerHeight;
  P.pc.aspect = innerWidth / innerHeight;
  P.pc.fov = port ? 70 : 45;
  if (podShift && !port) P.pc.setViewOffset(innerWidth, innerHeight, innerWidth * podShift, 0, innerWidth, innerHeight);
  else P.pc.clearViewOffset();
  P.pc.updateProjectionMatrix();
  const a = Math.sin(P.t * 0.4) * 0.35;
  P.pc.position.set(Math.sin(a) * 8.5, 2.7, Math.cos(a) * 8.5);
  P.pc.lookAt(0, port ? 3.0 : 1.7, 0);
  for (const { ch, i } of P.chars) {
    if (i === 0 && ch.win) ch.win(P.t);
    else if (i === 0) ch.cheer(P.t, 1);
    else ch.cheer(P.t + i, 0.45);
    if (ch.tick) ch.tick(dt);
    if (!(i === 0 && ch.def && ch.def.win === 'spin')) ch.root.rotation.y = Math.sin(P.t * 1.5 + i) * 0.3;
  }
  if (Math.random() < dt * 1.5) confetti(P.sc, (Math.random() - 0.5) * 6, 7, 0, 30, 6);
  updateConfetti(dt);
  renderer.render(P.sc, P.pc);
}
