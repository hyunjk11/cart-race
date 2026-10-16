import * as THREE from 'three';
import * as CANNON from 'cannon-es';
// Rounded-rectangle loop through supermarket aisles.
export const HX = 50, HZ = 30, HW = 6, SD = 1.6, SH = 3.2;
export const LAPS = 3;

// centerline path (clockwise when viewed from above, starting at finish line, heading +x)
export function buildPath() {
  const pts = [], R = 8, step = 2;
  const corners = [[HX - R, -HZ + R, -Math.PI / 2], [HX - R, HZ - R, 0], [-HX + R, HZ - R, Math.PI / 2], [-HX + R, -HZ + R, Math.PI]];
  const segs = [[[-HX + R, -HZ], [HX - R, -HZ]], [[HX, -HZ + R], [HX, HZ - R]], [[HX - R, HZ], [-HX + R, HZ]], [[-HX, HZ - R], [-HX, -HZ + R]]];
  for (let i = 0; i < 4; i++) {
    const [a, b] = segs[i]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]); const n = Math.round(L / step);
    for (let k = 0; k < n; k++) pts.push(new THREE.Vector2(a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n));
    const [cx, cz, a0] = corners[i];
    for (let k = 0; k < 6; k++) { const t = a0 + (k / 6) * Math.PI / 2; pts.push(new THREE.Vector2(cx + Math.cos(t) * R, cz + Math.sin(t) * R)); }
  }
  // rotate so index 0 is at x=0 on bottom straight
  let i0 = 0, best = 1e9; pts.forEach((p, i) => { const d = Math.abs(p.x) + Math.abs(p.y + HZ); if (d < best) { best = d; i0 = i; } });
  return pts.slice(i0).concat(pts.slice(0, i0));
}

// shelf strips: {x0,x1,z0,z1,nx,nz} normal points toward track
export function shelfStrips() {
  const o = HW, t = SD, s = [];
  // outer
  s.push({ x0: -HX - o - t, x1: HX + o + t, z0: -HZ - o - t, z1: -HZ - o, nx: 0, nz: 1 });
  s.push({ x0: -HX - o - t, x1: HX + o + t, z0: HZ + o, z1: HZ + o + t, nx: 0, nz: -1 });
  s.push({ x0: -HX - o - t, x1: -HX - o, z0: -HZ - o, z1: HZ + o, nx: 1, nz: 0 });
  s.push({ x0: HX + o, x1: HX + o + t, z0: -HZ - o, z1: HZ + o, nx: -1, nz: 0 });
  // inner block
  s.push({ x0: -HX + o, x1: HX - o, z0: -HZ + o, z1: -HZ + o + t, nx: 0, nz: -1 });
  s.push({ x0: -HX + o, x1: HX - o, z0: HZ - o - t, z1: HZ - o, nx: 0, nz: 1 });
  s.push({ x0: -HX + o, x1: -HX + o + t, z0: -HZ + o + t, z1: HZ - o - t, nx: -1, nz: 0 });
  s.push({ x0: HX - o - t, x1: HX - o, z0: -HZ + o + t, z1: HZ - o - t, nx: 1, nz: 0 });
  return s;
}

const PCOLS = [0xe53935, 0x43a047, 0x1e88e5, 0xfdd835, 0xfb8c00, 0x8e24aa, 0xffffff, 0x00acc1, 0x6d4c41];

export function buildWorld(scene, world, strips) {
  // floor
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  g.fillStyle = '#e8e4da'; g.fillRect(0, 0, 128, 128); g.fillStyle = '#d4cfc2'; g.fillRect(0, 0, 64, 64); g.fillRect(64, 64, 64, 64);
  const tex = new THREE.CanvasTexture(c); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(70, 45); tex.colorSpace = THREE.SRGBColorSpace;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(140, 90), new THREE.MeshLambertMaterial({ map: tex }));
  floor.rotation.x = -Math.PI / 2; scene.add(floor);
  const ground = new CANNON.Body({ mass: 0, shape: new CANNON.Plane() }); ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0); world.addBody(ground);

  // ceiling lights
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  for (let x = -60; x <= 60; x += 15) for (let z = -36; z <= 36; z += 36) { const l = new THREE.Mesh(new THREE.BoxGeometry(6, 0.1, 0.6), lightMat); l.position.set(x, 7, z); scene.add(l); }
  for (let x = -55; x <= 55; x += 11) for (const z of [-HZ, HZ]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 7), lightMat); l.position.set(x, 6.5, z); scene.add(l); }
  for (const x of [-HX, HX]) for (let z = -25; z <= 25; z += 10) { const l = new THREE.Mesh(new THREE.BoxGeometry(7, 0.08, 0.5), lightMat); l.position.set(x, 6.5, z); scene.add(l); }

  // shelves: frame + boards per strip, products instanced
  const frameMat = new THREE.MeshLambertMaterial({ color: 0x8a96a3 });
  const boardMat = new THREE.MeshLambertMaterial({ color: 0xcfd6dd });
  const items = [];
  for (const st of strips) {
    const w = st.x1 - st.x0, d = st.z1 - st.z0, cx = (st.x0 + st.x1) / 2, cz = (st.z0 + st.z1) / 2;
    const back = new THREE.Mesh(new THREE.BoxGeometry(st.nx ? 0.15 : w, SH, st.nx ? d : 0.15), frameMat);
    back.position.set(cx - st.nx * (d > w ? w / 2 - 0.1 : 0) * 1, SH / 2, cz - st.nz * (w > d ? d / 2 - 0.1 : 0)); scene.add(back);
    for (const h of [0.15, 1.1, 2.05, SH]) { const b = new THREE.Mesh(new THREE.BoxGeometry(w, 0.08, d), boardMat); b.position.set(cx, h, cz); scene.add(b); }
    const body = new CANNON.Body({ mass: 0, shape: new CANNON.Box(new CANNON.Vec3(w / 2, SH / 2, d / 2)) }); body.position.set(cx, SH / 2, cz); world.addBody(body);
    // product placements along strip face
    const len = Math.max(w, d), along = w > d;
    for (let a = 0.4; a < len - 0.3; a += 0.55) for (const h of [0.19, 1.14, 2.09]) {
      if (Math.random() < 0.12) continue;
      const px = along ? st.x0 + a : cx + st.nx * 0.3, pz = along ? cz + st.nz * 0.3 : st.z0 + a;
      items.push([px, h, pz]);
    }
  }
  // several product kinds on shelves, each one InstancedMesh
  const kinds = [
    { g: new THREE.BoxGeometry(0.38, 0.6, 0.18), cols: [0xffb300, 0xe53935, 0x1e88e5, 0x8e24aa], sy: [0.8, 1.2] },      // cereal boxes
    { g: new THREE.CylinderGeometry(0.09, 0.11, 0.55, 8), cols: [0x43a047, 0x00acc1, 0xffffff, 0xd81b60], sy: [0.8, 1.1] }, // bottles
    { g: new THREE.CylinderGeometry(0.16, 0.16, 0.36, 10), cols: [0xd32f2f, 0xfdd835, 0x546e7a], sy: [0.9, 1.0] },          // cans
    { g: new THREE.CylinderGeometry(0.17, 0.17, 0.3, 10), cols: [0xffffff, 0xf5f5f5], sy: [1, 1] },                          // toilet paper
    { g: new THREE.BoxGeometry(0.5, 0.16, 0.3), cols: [0xd7ccc8, 0xffecb3], sy: [1, 1] },                                    // egg cartons
  ];
  const buckets = kinds.map(() => []);
  items.forEach((p, i) => { const k = (Math.floor(i / 7) + (p[1] < 0.5 ? 3 : 0)) % kinds.length; p.push(k, buckets[k].length); buckets[k].push(p); });
  const m = new THREE.Matrix4(), col = new THREE.Color();
  const meshes = kinds.map((K, k) => { const im = new THREE.InstancedMesh(K.g, new THREE.MeshLambertMaterial(), Math.max(1, buckets[k].length));
    buckets[k].forEach((p, i) => { const sy = K.sy[0] + Math.random() * (K.sy[1] - K.sy[0]); K.g.computeBoundingBox(); const hh = (K.g.boundingBox.max.y) * sy;
      m.makeScale(1, sy, 1); m.setPosition(p[0], p[1] + hh, p[2]); im.setMatrixAt(i, m); im.setColorAt(i, col.setHex(K.cols[(Math.random() * K.cols.length) | 0])); });
    im.count = buckets[k].length; scene.add(im); return im; });
  // price tags along shelf board edges
  const tagM = new THREE.MeshBasicMaterial({ color: 0xfff176 }), redM = new THREE.MeshBasicMaterial({ color: 0xe53935 });
  for (const st of strips) {
    const w = st.x1 - st.x0, d = st.z1 - st.z0, along = w > d, cx = (st.x0 + st.x1) / 2, cz = (st.z0 + st.z1) / 2;
    for (const h of [0.12, 1.07, 2.02]) {
      const t = new THREE.Mesh(new THREE.BoxGeometry(along ? w : 0.02, 0.14, along ? 0.02 : d), tagM);
      t.position.set(along ? cx : (st.nx > 0 ? st.x1 : st.x0) + st.nx * 0.01, h, along ? (st.nz > 0 ? st.z1 : st.z0) + st.nz * 0.01 : cz); scene.add(t);
    }
    // a few red sale tags
    const len = Math.max(w, d);
    for (let a = 3; a < len; a += 9) { const t = new THREE.Mesh(new THREE.BoxGeometry(along ? 0.5 : 0.03, 0.3, along ? 0.03 : 0.5), redM);
      t.position.set(along ? st.x0 + a : (st.nx > 0 ? st.x1 : st.x0) + st.nx * 0.02, 1.0, along ? (st.nz > 0 ? st.z1 : st.z0) + st.nz * 0.02 : st.z0 + a); scene.add(t); }
  }
  // hanging promo signs
  const promos = ['오늘의 특가', '1+1 행사', '신선 과일', '라면 대전', '반값 할인'];
  promos.forEach((t, i) => { const s = textSprite(t, i % 2 ? '#ef6c00' : '#2e7d32'); const a = (i / promos.length) * Math.PI * 2;
    s.position.set(-40 + i * 20, 5.6, i % 2 ? HZ + HW + 0.9 : -HZ - HW - 0.9); s.scale.set(4, 1, 1); scene.add(s); });
  return { meshes, items, hidden: new Uint8Array(items.length) };

  // inner decorative aisles (unreachable, for looks)
  for (let z = -HZ + HW + 5; z < HZ - HW - 2; z += 6) { const s = new THREE.Mesh(new THREE.BoxGeometry(2 * (HX - HW) - 8, SH, 1.4), frameMat); s.position.set(0, SH / 2, z); scene.add(s); }

  // aisle signs
  const signs = ['과자·음료', '신선식품', '생활용품', '냉동식품'];
  const sp = [[0, -HZ - HW - 0.5, 0], [HX + HW + 0.5, 0, -Math.PI / 2], [0, HZ + HW + 0.5, Math.PI], [-HX - HW - 0.5, 0, Math.PI / 2]];
  signs.forEach((t, i) => { const s = textSprite(t, '#c62828'); s.position.set(sp[i][0], 4.6, sp[i][1]); s.scale.set(8, 2, 1); scene.add(s); });

  // finish line
  const fc = document.createElement('canvas'); fc.width = 64; fc.height = 256; const fg = fc.getContext('2d');
  for (let y = 0; y < 16; y++) for (let x = 0; x < 4; x++) { fg.fillStyle = (x + y) % 2 ? '#000' : '#fff'; fg.fillRect(x * 16, y * 16, 16, 16); }
  const fin = new THREE.Mesh(new THREE.PlaneGeometry(2, HW * 2), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(fc) }));
  fin.rotation.x = -Math.PI / 2; fin.position.set(0, 0.01, -HZ); scene.add(fin);
  const banner = textSprite('🏁 결승선 🏁', '#1565c0'); banner.position.set(0, 7.2, -HZ); banner.scale.set(8, 2, 1); scene.add(banner);
  for (const zz of [-HZ - HW + 0.3, -HZ + HW - 0.3]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 7), frameMat); p.position.set(0, 3.5, zz); scene.add(p); }
}

export function textSprite(text, bg) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 128; const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, 512, 128); g.fillStyle = '#fff'; g.font = 'bold 64px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 256, 68);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Sprite(new THREE.SpriteMaterial({ map: t }));
}
