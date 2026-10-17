// Character select: rotating 3D preview + roster cards (title & lobby).
import * as THREE from 'three';
import { ROSTER, CHAR, charOf, makeRacer, makeDeco, statBar } from './chars.js';
import { LS } from './store.js';

const $ = id => document.getElementById(id);
let preview = null, sel = null, onPick = null, locked = false;

function ensurePreview() {
  if (preview) return preview;
  const canvas = $('charPrev'); if (!canvas) return null;
  const sc = new THREE.Scene(); sc.background = new THREE.Color(0xfff3f8);
  sc.add(new THREE.HemisphereLight(0xffffff, 0xffc1e3, 1.5));
  const dl = new THREE.DirectionalLight(0xffffff, 1.2); dl.position.set(2, 5, 3); sc.add(dl);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(1.8, 32), new THREE.MeshLambertMaterial({ color: 0xffe0f0 })); floor.rotation.x = -Math.PI / 2; floor.position.y = -0.01; sc.add(floor);
  const cam = new THREE.PerspectiveCamera(40, 1, 0.1, 50); cam.position.set(0, 1.6, 4.2); cam.lookAt(0, 1.1, 0);
  const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'low-power' }); r.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  const fit = () => { const w = canvas.clientWidth || 220, h = canvas.clientHeight || 260; r.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); };
  fit(); addEventListener('resize', fit);
  preview = { sc, cam, r, fit, root: new THREE.Group(), racer: null, deco: null, cart: null, t: 0, id: null };
  preview.sc.add(preview.root);
  // mini cart frame
  const metal = new THREE.MeshLambertMaterial({ color: 0x9e9e9e }), colM = new THREE.MeshToonMaterial({ color: 0xff4f8b });
  const cart = new THREE.Group(); cart.position.set(0, 0, 0.35);
  cart.add(new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.55, 1.1), new THREE.MeshLambertMaterial({ color: 0xcfd8dc, transparent: true, opacity: 0.35 })).translateY(0.85));
  const rim = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.05, 1.15), colM); rim.position.y = 1.15; cart.add(rim);
  const hb = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.9, 8), colM); hb.rotation.z = Math.PI / 2; hb.position.set(0, 1.25, -0.7); cart.add(hb);
  cart.scale.y = 0.62; // low basket so rim/handle sit below the face in the close-up preview
  preview.cart = cart; preview.colM = colM; preview.root.add(cart);
  return preview;
}
function showChar(id) {
  const P = ensurePreview(); if (!P) return; id = charOf(id).id; if (P.id === id && P.racer) return; const def = charOf(id);
  if (P.racer) { P.root.remove(P.racer.root); P.racer.dispose(); } if (P.deco) { P.cart.remove(P.deco); P.deco.geometry.dispose(); }
  P.racer = makeRacer(def, { low: false }); P.racer.root.position.set(0, 0, -0.55); P.root.add(P.racer.root);
  P.deco = makeDeco(id); if (P.deco) { P.deco.scale.set(0.9, 0.9 / 0.62, 0.9); P.cart.add(P.deco); }
  P.colM.color.setHex(def.color); P.id = id;
  const bars = (k, v) => `<div class="csb"><span>${k}</span><i>${'●'.repeat(v)}${'○'.repeat(5 - v)}</i></div>`;
  $('charInfo').innerHTML = `<div class="cni">${def.emoji} <b>${def.name}</b></div><div class="cti">${def.title}</div><p>${def.desc}</p>${bars('속도', statBar(def.st.spd, 'spd'))}${bars('핸들', statBar(def.st.hdl))}${bars('드리프트', statBar(def.st.drf))}`;
}
export function renderCharCards(el, current, { locked = false, onClick } = {}) {
  if (!el) return;
  el.innerHTML = ROSTER.map(d => `<button class="chc ${d.id === current ? 'sel' : ''}" data-char="${d.id}" ${locked ? 'disabled' : ''} style="--cc:#${d.color.toString(16).padStart(6, '0')}"><span class="ci">${d.emoji}</span><b>${d.name}</b><small>${d.title}</small></button>`).join('');
  el.querySelectorAll('[data-char]').forEach(b => b.onclick = () => { if (locked) return; onClick?.(b.dataset.char); });
}
export function openCharSel(api) {
  onPick = api; locked = false; sel = charOf(LS.get('cartChar') || 'mango').id;
  $('charSel').classList.remove('hidden'); setLineup(false); showChar(sel);
  const pick = id => { sel = id; showChar(id); renderCharCards($('charRow'), sel, { onClick: pick }); };
  renderCharCards($('charRow'), sel, { onClick: pick });
  $('charOk').onclick = () => { LS.set('cartChar', sel); $('charSel').classList.add('hidden'); onPick?.(sel); };
  $('charLineup').onclick = () => setLineup(!(preview && preview.lineup));
  $('charBack').onclick = () => { $('charSel').classList.add('hidden'); onPick?.(null); };
}
export function setLineup(on) {
  const P = ensurePreview(); if (!P) return; $('charSel').classList.toggle('lineup', on);
  if (on && !P.lineup) { P.lineup = new THREE.Group(); P.lineupR = ROSTER.map((d, i) => { const r = makeRacer(d, { low: false }); r.root.position.set((i - (ROSTER.length - 1) / 2) * 1.25, 0, 0); P.lineup.add(r.root); return r; }); P.sc.add(P.lineup); }
  if (!on && P.lineup) { P.sc.remove(P.lineup); P.lineupR.forEach(r => r.dispose()); P.lineup = null; P.lineupR = null; }
  P.root.visible = !on; $('charLineup').textContent = on ? '🔍 한 명씩 보기' : '👥 전체 보기';
  $('lineupNames').innerHTML = on ? ROSTER.map(d => `<span>${d.emoji} ${d.name}</span>`).join('') : '';
  setTimeout(() => P.fit(), 0);
}
export function tickCharPrev(dt) {
  const P = preview; if (!P || $('charSel').classList.contains('hidden')) return;
  P.t += dt; P.root.rotation.y = Math.sin(P.t * 0.6) * 0.55 + P.t * 0.15;
  if (P.racer) { P.racer.idle(P.t); P.racer.tick(dt); if (Math.sin(P.t * 0.7) > 0.92) P.racer.face('happy'); else if (Math.sin(P.t * 1.1) > 0.95) P.racer.face('focus'); else P.racer.face(charOf(P.id).sleepy ? 'sleepy' : 'normal'); }
  if (P.lineup) { P.cam.position.set(0, 1.9, 7.4); P.cam.lookAt(0, 1.0, 0); P.lineupR.forEach((r, i) => { r.win(P.t + i * 0.4); r.tick(dt); r.root.rotation.y = Math.sin(P.t * 0.8 + i) * 0.25; }); }
  else { P.cam.position.set(0, 1.6, 4.2); P.cam.lookAt(0, 1.1, 0); }
  P.r.render(P.sc, P.cam);
}
export { ROSTER, CHAR, charOf };
