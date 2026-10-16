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
  const person = makeChibi(shirtCol); person.root.position.z = -0.95; root.add(person.root);
  let roll = 0, ph = 0;
  return { root, update(v, dt) { roll += v * dt / 0.12; wheels.forEach(w => w.rotation.x = roll); ph += Math.abs(v) * dt * 2.2; person.walk(Math.abs(v) > 0.3 ? ph : 0, Math.min(1, Math.abs(v) / 15)); } };
}

// Chibi pusher: big round head, sparkly eyes, blush, hat, tiny body. pal = {skin, shirt, hat, hair, pants}
export function makeChibi(pal) {
  const root = new THREE.Group(), bob = new THREE.Group(); root.add(bob);
  const toon = c => new THREE.MeshToonMaterial({ color: c });
  const skinM = toon(pal.skin || 0xffe0c8);
  // body (small, rounded)
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 0.25, 6, 12), toon(pal.shirt)); body.position.y = 0.62; bob.add(body);
  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), toon(0xffffff)); belly.scale.set(1, 1, 0.5); belly.position.set(0, 0.58, 0.16); bob.add(belly);
  // head
  const headG = new THREE.Group(); headG.position.y = 1.25; bob.add(headG);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.46, 24, 18), skinM); head.scale.set(1.05, 0.95, 1); headG.add(head);
  // hair back + bangs
  const hairM = toon(pal.hair);
  const hairB = new THREE.Mesh(new THREE.SphereGeometry(0.48, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.55), hairM); hairB.rotation.x = -0.35; hairB.position.y = 0.02; headG.add(hairB);
  // eyes
  const black = new THREE.MeshBasicMaterial({ color: 0x1a1020 }), white = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const pink = new THREE.MeshBasicMaterial({ color: 0xff8fb0, transparent: true, opacity: 0.75 });
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.085, 14, 12), black); eye.scale.set(0.85, 1.25, 0.5); eye.position.set(s * 0.17, -0.02, 0.42); headG.add(eye);
    const hl = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), white); hl.position.set(s * 0.17 + 0.03, 0.04, 0.47); headG.add(hl);
    const hl2 = new THREE.Mesh(new THREE.SphereGeometry(0.014, 6, 6), white); hl2.position.set(s * 0.17 - 0.025, -0.06, 0.47); headG.add(hl2);
    const blush = new THREE.Mesh(new THREE.CircleGeometry(0.075, 14), pink); blush.position.set(s * 0.29, -0.14, 0.37); blush.rotation.y = s * 0.6; blush.scale.y = 0.6; headG.add(blush);
  }
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.012, 6, 12, Math.PI), black); mouth.rotation.z = Math.PI; mouth.position.set(0, -0.14, 0.45); headG.add(mouth);
  // hat: beanie with pompom
  const hatM = toon(pal.hat);
  const hat = new THREE.Mesh(new THREE.SphereGeometry(0.5, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.42), hatM); hat.position.y = 0.06; hat.rotation.x = -0.15; headG.add(hat);
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.43, 0.06, 8, 24), toon(0xffffff)); band.rotation.x = Math.PI / 2 - 0.15; band.position.set(0, 0.22, -0.03); headG.add(band);
  const pom = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 10), toon(0xffffff)); pom.position.set(0, 0.58, -0.08); headG.add(pom);
  // arms reaching to handle
  const arms = [];
  for (const s of [-1, 1]) {
    const ap = new THREE.Group(); ap.position.set(s * 0.27, 0.8, 0.05); ap.rotation.x = -1.25; ap.rotation.z = s * 0.15; bob.add(ap);
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.3, 4, 8), toon(pal.shirt)); arm.position.y = -0.22; ap.add(arm);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), skinM); hand.position.y = -0.45; ap.add(hand); arms.push(ap);
  }
  // little legs + shoes
  const legs = [];
  for (const s of [-1, 1]) {
    const lp = new THREE.Group(); lp.position.set(s * 0.13, 0.38, 0); root.add(lp);
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 0.16, 4, 8), toon(pal.pants || 0x5c6bc0)); leg.position.y = -0.16; lp.add(leg);
    const shoe = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), toon(pal.hat)); shoe.scale.set(1, 0.6, 1.4); shoe.position.set(0, -0.32, 0.04); lp.add(shoe); legs.push(lp);
  }
  return { root, walk(ph, k = 1) {
    legs[0].rotation.x = Math.sin(ph) * 0.8 * k; legs[1].rotation.x = -Math.sin(ph) * 0.8 * k;
    const b = Math.abs(Math.sin(ph)); bob.position.y = b * 0.12 * k;
    bob.scale.set(1 + (1 - b) * 0.06 * k, 1 - (1 - b) * 0.06 * k, 1);
    headG.rotation.z = Math.sin(ph) * 0.08 * k; headG.rotation.x = 0.1;
    arms.forEach(a => a.rotation.x = -1.25 + Math.sin(ph * 2) * 0.05 * k);
  } };
}
