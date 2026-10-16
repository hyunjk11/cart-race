import * as THREE from 'three';
const lm = c => new THREE.MeshLambertMaterial({ color: c });
const skin = lm(0xf1c27d);

// Simple person; pivot at feet, faces +z
export function makePerson(shirtCol, pantsCol, armsForward = false) {
  const root = new THREE.Group();
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.65, 0.3), lm(shirtCol)); torso.position.y = 1.15; root.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), skin); head.position.y = 1.68; root.add(head);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.21, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), lm(0x3e2723)); hair.position.y = 1.7; root.add(hair);
  const legs = [], arms = [];
  for (const s of [-1, 1]) {
    const lp = new THREE.Group(); lp.position.set(s * 0.14, 0.82, 0); root.add(lp);
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.8, 0.22), lm(pantsCol)); leg.position.y = -0.4; lp.add(leg); legs.push(lp);
    const ap = new THREE.Group(); ap.position.set(s * 0.36, 1.42, 0); root.add(ap);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.6, 0.14), lm(shirtCol)); arm.position.y = -0.3; ap.add(arm); arms.push(ap);
    if (armsForward) ap.rotation.x = -1.2;
  }
  return { root, walk(ph) { legs[0].rotation.x = Math.sin(ph) * 0.6; legs[1].rotation.x = -Math.sin(ph) * 0.6; if (!armsForward) { arms[0].rotation.x = -Math.sin(ph) * 0.5; arms[1].rotation.x = Math.sin(ph) * 0.5; } } };
}

// wire grid on a box: lines along each face
function wireBasket(w, h, d, step) {
  const v = [];
  const add = (a, b) => v.push(...a, ...b);
  for (let x = -w / 2; x <= w / 2 + 1e-6; x += step) { add([x, 0, -d / 2], [x, h, -d / 2]); add([x, 0, d / 2], [x, h, d / 2]); add([x, 0, -d / 2], [x, 0, d / 2]); }
  for (let z = -d / 2; z <= d / 2 + 1e-6; z += step) { add([-w / 2, 0, z], [-w / 2, h, z]); add([w / 2, 0, z], [w / 2, h, z]); add([-w / 2, 0, z], [w / 2, 0, z]); }
  for (let y = 0; y <= h + 1e-6; y += step) { add([-w / 2, y, -d / 2], [w / 2, y, -d / 2]); add([-w / 2, y, d / 2], [w / 2, y, d / 2]); add([-w / 2, y, -d / 2], [-w / 2, y, d / 2]); add([w / 2, y, -d / 2], [w / 2, y, d / 2]); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); return g;
}

export function makeCart(color, shirtCol) {
  const root = new THREE.Group();
  const cart = new THREE.Group(); cart.position.z = 0.5; root.add(cart);
  const basket = new THREE.LineSegments(wireBasket(1.1, 0.75, 1.6, 0.18), new THREE.LineBasicMaterial({ color: 0xcfd8dc }));
  basket.position.y = 0.55; cart.add(basket);
  const rim = new THREE.Mesh(new THREE.BoxGeometry(1.16, 0.06, 1.66), lm(color)); rim.position.y = 1.3; cart.add(rim);
  const metal = lm(0x9e9e9e);
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.05, 1.5), metal); base.position.y = 0.3; cart.add(base);
  for (const [x, z] of [[-0.4, -0.7], [0.4, -0.7], [-0.4, 0.7], [0.4, 0.7]]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.3, 0.05), metal); p.position.set(x, 0.38, z); cart.add(p); }
  const wheels = [];
  const wg = new THREE.CylinderGeometry(0.12, 0.12, 0.08, 12); wg.rotateZ(Math.PI / 2);
  for (const [x, z] of [[-0.4, -0.7], [0.4, -0.7], [-0.4, 0.7], [0.4, 0.7]]) { const w = new THREE.Mesh(wg, lm(0x222222)); w.position.set(x, 0.12, z); cart.add(w); wheels.push(w); }
  // handle
  const hb = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.2, 8), lm(color)); hb.rotation.z = Math.PI / 2; hb.position.set(0, 1.4, -0.95); cart.add(hb);
  for (const s of [-1, 1]) { const a = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.3, 0.04), metal); a.position.set(s * 0.55, 1.3, -0.88); cart.add(a); }
  const person = makePerson(shirtCol, 0x263238, true); person.root.position.z = -1.0; person.root.rotation.x = 0.12; root.add(person.root);
  let roll = 0, ph = 0;
  return { root, update(v, dt) { roll += v * dt / 0.12; wheels.forEach(w => w.rotation.x = roll); ph += Math.abs(v) * dt * 2.2; person.walk(Math.abs(v) > 0.3 ? ph : 0); } };
}
