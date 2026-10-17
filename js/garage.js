/**
 * garage.js — 🔧 차고 (parts shop): rotating 3D preview of your cart + character with parts applied live, slot tabs,
 * buy / equip, owned state, coin balance. Self-contained (own renderer); main.js opens it and applies the result.
 */
import * as THREE from 'three';
import { makeCart } from './models.js';
import { SLOTS, PARTS } from './config/parts.js';
import { coins, owns, buy, equip, loadout, partOf, statMods, statText } from './parts.js';
import { charOf } from './chars.js';
import { LS } from './store.js';
import { $, escHtml } from './util.js';

let P = null, // preview { sc, cam, r, cart, t }
  tab = SLOTS[0].id,
  trial = null, // loadout being previewed (equipped + the part under the cursor)
  done = null;

function ensure(charId) {
  const canvas = $('garPrev');
  if (!P) {
    const sc = new THREE.Scene();
    sc.background = new THREE.Color(0x2e2148);
    sc.add(new THREE.HemisphereLight(0xffffff, 0x8a6bb8, 1.6));
    const dl = new THREE.DirectionalLight(0xffffff, 1.3);
    dl.position.set(3, 6, 4);
    sc.add(dl);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(2.4, 40), new THREE.MeshLambertMaterial({ color: 0x4a3670 }));
    floor.rotation.x = -Math.PI / 2;
    sc.add(floor);
    const ring = new THREE.Mesh(new THREE.RingGeometry(2.25, 2.4, 40), new THREE.MeshBasicMaterial({ color: 0xffd84d }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.01;
    sc.add(ring);
    const cam = new THREE.PerspectiveCamera(38, 1, 0.1, 60);
    const r = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'low-power' });
    r.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    const low = LS.get('cartQuality') === 'low';
    const cart = makeCart(0xff4f8b, charId, { low });
    sc.add(cart.root);
    P = { sc, cam, r, cart, t: 0 };
    addEventListener('resize', fit);
  }
  P.cart.setChar(charId);
  fit();
  return P;
}
function fit() {
  if (!P) return;
  const c = $('garPrev'),
    w = c.clientWidth || 300,
    h = c.clientHeight || 240;
  P.r.setSize(w, h, false);
  P.cam.aspect = w / h;
  P.cam.updateProjectionMatrix();
}

const pct = v => `${v >= 1 ? '+' : ''}${Math.round((v - 1) * 100)}%`;
function render() {
  const lo = loadout();
  $('gCoins').textContent = coins().toLocaleString('ko-KR');
  $('gTabs').innerHTML = SLOTS.map(
    s =>
      `<button role="tab" class="${s.id === tab ? 'on' : ''}" data-slot="${s.id}" aria-selected="${s.id === tab}">${s.icon} ${s.name}</button>`,
  ).join('');
  $('gTabs')
    .querySelectorAll('[data-slot]')
    .forEach(b => (b.onclick = () => ((tab = b.dataset.slot), (trial = { ...loadout() }), preview(), render())));
  $('gList').innerHTML = PARTS[tab]
    .map(p => {
      const own = owns(tab, p.id),
        eq = lo[tab] === p.id,
        cur = trial[tab] === p.id;
      const tag = eq ? '<em class="eq">장착 중</em>' : own ? '<em class="own">보유</em>' : `<em class="price">🪙 ${p.price}</em>`;
      return `<button class="gpc ${cur ? 'sel' : ''} ${eq ? 'equipped' : ''} ${own ? 'owned' : 'locked'}" data-part="${p.id}"><span class="gi">${p.icon}</span><b>${escHtml(p.name)}</b>${tag}<small>${p.st ? statText(p.st) : '외형'}</small></button>`;
    })
    .join('');
  $('gList')
    .querySelectorAll('[data-part]')
    .forEach(b => (b.onclick = () => pickPart(b.dataset.part)));
  const p = partOf(tab, trial[tab]),
    own = owns(tab, p.id),
    eq = lo[tab] === p.id;
  const act = $('gAct');
  act.disabled = eq || (!own && coins() < p.price);
  act.textContent = eq ? '✅ 장착 중' : own ? '🔧 장착하기' : coins() < p.price ? `🪙 ${p.price} (코인 부족)` : `🪙 ${p.price} 구매 + 장착`;
  act.className = own || eq ? 'alt' : 'pri';
  $('gDesc').innerHTML =
    `<b>${p.icon} ${escHtml(p.name)}</b> — ${escHtml(p.desc)}${p.st ? ` <span class="gst">${statText(p.st)}</span>` : ''}`;
  const m = statMods(trial),
    d = charOf(P.cart.charId);
  $('gStats').innerHTML =
    `<div class="gsh">${d.emoji} ${escHtml(d.name)} + 파츠</div>` +
    [
      ['속도', m.spd],
      ['핸들', m.hdl],
      ['드리프트', m.drf],
    ]
      .map(([k, v]) => `<div class="gsr"><span>${k}</span><i class="${v > 1 ? 'up' : v < 1 ? 'dn' : ''}">${pct(v)}</i></div>`)
      .join('') +
    `<div class="note">능력치 변화는 최대 ±5%. 멀티플레이에서는 호스트가 켰을 때만 적용 (기본: 외형만)</div>`;
}
function preview() {
  P.cart.setParts(trial);
}
function pickPart(id) {
  trial = { ...loadout(), [tab]: id };
  preview();
  render();
}
function action() {
  const p = partOf(tab, trial[tab]);
  if (!owns(tab, p.id)) {
    const r = buy(tab, p.id);
    $('gMsg').textContent = r.msg;
    $('gMsg').classList.toggle('err', !r.ok);
    if (!r.ok) return render();
  } else $('gMsg').textContent = `${p.name} 장착!`;
  equip(tab, p.id);
  trial = { ...loadout() };
  preview();
  render();
}

/** Open the garage for character `charId`; onClose(loadout) runs when the player leaves. */
export function openGarage(charId, onClose) {
  done = onClose;
  $('garage').classList.remove('hidden');
  ensure(charId);
  trial = { ...loadout() };
  preview();
  $('gMsg').textContent = '';
  $('gAct').onclick = action;
  $('gBack').onclick = () => {
    $('garage').classList.add('hidden');
    done?.(loadout());
  };
  render();
  setTimeout(fit, 0);
}
export const garageOpen = () => !!$('garage') && !$('garage').classList.contains('hidden');
/** Per-frame: spin the preview (only while the garage is open). */
export function tickGarage(dt) {
  if (!P || !garageOpen()) return;
  P.t += dt;
  const a = P.t * 0.5;
  P.cam.position.set(Math.sin(a) * 4.4, 2.3, Math.cos(a) * 4.4);
  P.cam.lookAt(0, 1.05, -0.1);
  P.cart.boostK = 0.5 + 0.5 * Math.sin(P.t * 2);
  P.cart.update(0, dt);
  P.r.render(P.sc, P.cam);
}
/** Debug/tests: the preview cart api. */
export const garagePreview = () => P && P.cart;
