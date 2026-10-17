// split out of main.js (no behavior change): shared main.js state is reached through G (getters/setters)
import * as THREE from 'three';
import * as TR from './track.js';
import { path, hAt, strips, tangentAt, LAPS } from './track.js';
import { charOf } from './chars.js';
import { tutorialTick } from './help.js';
import { ITEMS } from './fun.js';
import { T_LIMIT, won } from './shop.js';
let G = null; export const bind = g => { G = g; };
let MAXB, _v, mm, mctx, MW, MH, mmS, sx, sz, mmBg, annUntil, msgUntil;
function flash(t) { G.$('msg').textContent = t; G.msgT = 1.5; msgUntil = Date.now() + 4000; }
function say(ent, text, dur = 2, force = false) {
  const now = performance.now() / 1000; if (!force && (ent.sayCd || 0) > now) return;
  if (G.MODE === 'host') G.netSay(ent, text, dur);
  if (G.bubbles.length >= MAXB) { if (!force) return; const old = G.bubbles.shift(); old.el.remove(); }
  const pos = ent.holder ? ent.holder.position : ent.g.root.position; if (!force && pos.distanceTo(G.camera.position) > 30) return;
  const ex = G.bubbles.find(b => b.ent === ent); if (ex) { ex.el.remove(); G.bubbles.splice(G.bubbles.indexOf(ex), 1); }
  const el = document.createElement('div'); el.className = 'bubble' + (ent.g && ent.g.root && !ent.holder ? ' cart' : ''); el.textContent = text; G.bubbleLayer.appendChild(el);
  G.bubbles.push({ ent, el, t: 0, dur }); ent.sayCd = now + dur + 2.5;
}
function chatter(cu) { if (G.bubbles.length < 3) say(cu, G.pick(['두부가 어디 있더라…', '오늘 할인한대!', '우유 사야지~', '라면 1+1이네!', '애들 간식은…', '계산대 줄 길다…', '어? 이거 싸다!', '장바구니 어디 뒀지?'])); }
function updateBubbles() {
  const now = performance.now() / 1000;
  for (let i = G.bubbles.length - 1; i >= 0; i--) {
    const b = G.bubbles[i]; b.t += 1 / 60;
    if (b.t > b.dur) { b.el.remove(); G.bubbles.splice(i, 1); continue; }
    const p = b.ent.holder ? b.ent.holder.position : b.ent.g.root.position;
    _v.set(p.x, (b.ent.holder ? (b.ent.body ? p.y + 1.2 : p.y + 1.45) : p.y + 2.6), p.z).project(G.camera);
    if (_v.z > 1) { b.el.style.display = 'none'; continue; }
    b.el.style.display = ''; b.el.style.opacity = Math.min(1, (b.dur - b.t) * 2, b.t * 6);
    b.el.style.transform = `translate(-50%,-100%) translate(${Math.max(60, Math.min(innerWidth - 60, (_v.x * 0.5 + 0.5) * innerWidth))}px,${(-_v.y * 0.5 + 0.5) * innerHeight}px)`;
  }
}
export function init0() {
  MAXB = 4;
  _v = new THREE.Vector3();
  setInterval(() => { if (G.state !== 'race') return; const sorted = [...G.carts].sort((a, b) => b.prog - a.prog);
  for (const c of G.carts) if (c.ai && Math.hypot(c.x - G.player.x, c.z - G.player.z) < 15 && Math.random() < 0.25)
    say(c, sorted[0] === c ? G.pick(['내가 1등이다!', '따라올 테면 따라와~', '느려 느려~']) : G.pick(['어림없지!', '추월한다!', '비켜비켜!', '내 차례야!'])); }, 1500);
}
function setupMinimap() { // fit the current map's bounds; pre-render the static layer
  const B = TR.MAP.bounds; mmS = Math.min(MW / (B.x1 - B.x0), MH / (B.z1 - B.z0)); const ox = (MW - (B.x1 - B.x0) * mmS) / 2, oz = (MH - (B.z1 - B.z0) * mmS) / 2;
  sx = x => ox + (x - B.x0) * mmS; sz = z => oz + (z - B.z0) * mmS;
  mmBg = document.createElement('canvas'); mmBg.width = MW; mmBg.height = MH; const g = mmBg.getContext('2d');
  g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(0, 0, MW, MH); g.lineJoin = 'round';
  g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = Math.max(4, 2 * TR.HW * mmS * 0.75); g.beginPath(); path.forEach((p, i) => i ? g.lineTo(sx(p.x), sz(p.y)) : g.moveTo(sx(p.x), sz(p.y))); g.closePath(); g.stroke();
  g.strokeStyle = 'rgba(255,214,120,.75)'; g.lineWidth = Math.max(2, TR.HW * mmS * 0.6); g.beginPath(); let on = false; // elevated parts
  path.forEach((p, i) => { const up = hAt(p.x, p.y) > 0.5; if (up && !on) g.moveTo(sx(p.x), sz(p.y)); else if (up) g.lineTo(sx(p.x), sz(p.y)); on = up; }); g.stroke();
  for (const r of TR.MAP.open || []) { g.fillStyle = 'rgba(255,214,120,.75)'; g.fillRect(sx(r.x0), sz(r.z0 + 0.5), (r.x1 - r.x0) * mmS, (r.z1 - r.z0 - 1) * mmS); }
  for (const zn of TR.MAP.zones) { g.fillStyle = { ice: 'rgba(160,230,255,.9)', walk: 'rgba(79,195,247,.95)', esc: 'rgba(255,213,79,.9)', bump: 'rgba(253,216,53,.95)' }[zn.t]; g.fillRect(sx(zn.x0), sz(zn.z0), Math.max(1.5, (zn.x1 - zn.x0) * mmS), Math.max(1.5, (zn.z1 - zn.z0) * mmS)); }
  for (const s of strips) if (s.kind === 'pillar' || s.kind === 'car') { g.fillStyle = s.kind === 'car' ? '#90a4ae' : '#cfd8dc'; g.fillRect(sx(s.x0), sz(s.z0), Math.max(1.5, (s.x1 - s.x0) * mmS), Math.max(1.5, (s.z1 - s.z0) * mmS)); }
  const p0 = path[0], [tx, tz] = tangentAt(0); g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.moveTo(sx(p0.x - tz * TR.HW), sz(p0.y + tx * TR.HW)); g.lineTo(sx(p0.x + tz * TR.HW), sz(p0.y - tx * TR.HW)); g.stroke();
}
function drawMinimap() {
  mctx.clearRect(0, 0, MW, MH); if (mmBg) mctx.drawImage(mmBg, 0, 0);
  if (G.SHOPON() && G.state !== 'title') for (const s of G.shop.spots) if (G.shop.need(G.player, s.k) || s.sale > 0) { mctx.fillStyle = s.sale > 0 ? '#ff1744' : '#ffee58'; mctx.fillRect(sx(s.x) - 2.5, sz(s.z) - 2.5, 5, 5); }
  for (const T of G.traffic) { mctx.fillStyle = '#ff7043'; mctx.fillRect(sx(T.x) - 2.5, sz(T.z) - 2.5, 5, 5); }
  for (const cu of G.customers) { const x = cu.body ? cu.body.position.x : cu.x, z = cu.body ? cu.body.position.z : cu.z; mctx.fillStyle = cu.state === 'walk' ? '#bbb' : '#f44'; mctx.fillRect(sx(x) - 1, sz(z) - 1, 2, 2); }
  for (const c of G.carts) { if (c.inactive) continue; mctx.fillStyle = '#' + c.color.toString(16).padStart(6, '0'); mctx.beginPath(); mctx.arc(sx(c.x), sz(c.z), c === G.player ? 4.5 : 3.5, 0, 7); mctx.fill(); if (c === G.player) { mctx.strokeStyle = '#fff'; mctx.lineWidth = 1.5; mctx.stroke(); } mctx.font = '9px sans-serif'; mctx.textAlign = 'center'; mctx.fillText(charOf(c.char).emoji, sx(c.x), sz(c.z) - 5); }
}
function announce(t) { const el = G.$('event'); el.textContent = '📢 ' + t; el.classList.add('show'); annUntil = Date.now() + 3500; }
export function init1() {
  mm = G.$('minimap'); mctx = mm.getContext('2d');
  MW = mm.width; MH = mm.height;
  mmS = 1; sx = x => x; sz = z => z; mmBg = null;
  annUntil = 0; msgUntil = 0;
  setInterval(() => { const now = Date.now(); if (annUntil && now > annUntil) { annUntil = 0; G.$('event').classList.remove('show'); }
  const m = G.$('msg'); if (m.textContent && !msgUntil) msgUntil = now + 4000; if (!m.textContent) msgUntil = 0; else if (now > msgUntil) { m.textContent = ''; msgUntil = 0; } }, 250);
}
function specUi() { if (!G.spec) return; const c = G.specCart(), sig = `${c.name}|${G.SHOPON() ? G.shop.got(c) + '/' + G.shop.S(c).list.length : ''}|${G.spec.ff}|${G.specList().length}`; if (sig === G.specSig) return; G.specSig = sig;
  G.$('specName').textContent = c === G.player ? '👀 관전 중 · 모두 계산 완료!' : `👀 관전 중: ${c.name}${G.SHOPON() ? ` (목록 ${G.shop.got(c)}/${G.shop.S(c).list.length})` : ''} · 남은 손님 ${G.specList().length}명`;
  G.$('specFF').textContent = G.spec.ff ? '⏩ 빨리 감기 중… (x24)' : '⏩ 빨리 감기'; G.$('specFF').classList.toggle('on', G.spec.ff); }
export function init2() {
  G.$('specNext').onclick = e => { e.stopPropagation(); if (G.spec) { G.spec.i++; G.camPos.set(0, 0, 0); G.specSig = ''; specUi(); } };
  G.$('specFF').onclick = e => { e.stopPropagation(); if (G.spec && G.MODE === 'solo') { G.spec.ff = !G.spec.ff; G.specSig = ''; specUi(); } };
}
function updateHud(dt) { // HUD
  { const p = G.player;   const active = G.carts.filter(c => !c.inactive), sorted = [...active].sort((a, b) => b.prog - a.prog);
  G.$('time').textContent = G.fmt(G.state === 'finished' ? p.time : G.raceT);
  G.$('lap').textContent = G.SHOPON() ? `${G.shop.got(p)}/${G.shop.S(p).list.length}` : `${Math.min(LAPS, Math.max(1, p.lap + 1))}/${LAPS}`; { const b = G.getBest(TR.MAP_ID); const t = b ? G.fmt(b) : '-'; if (G.$('best').textContent !== t) G.$('best').textContent = t; }
  G.$('rank').textContent = `${(p.finished && G.finishOrder.includes(p) ? G.finishOrder.indexOf(p) : sorted.indexOf(p)) + 1}/${active.length}`;
  { const ord = [...G.finishOrder.filter(c => !c.inactive), ...sorted.filter(c => !G.finishOrder.includes(c))], sig = ord.map(c => c.char + c.name + (c === p)).join();
    if (sig !== G.standSig) { G.standSig = sig; G.$('standings').innerHTML = ord.map((c, i) => `<span class="${c === p ? 'me' : ''}" style="--c:#${c.color.toString(16).padStart(6, '0')}"><b>${i + 1}</b>${charOf(c.char).emoji}<em>${c === p ? '나' : G.esc(c.name.replace(/ ?\(봇\)| 봇$/, ''))}</em></span>`).join(''); } }
  tutorialTick({ state: G.state, raceT: G.raceT, touch: G.IS_TOUCH, shop: G.SHOPON(), n2o: p.n2o, item: p.item, riders: G.nRiders(p) });
  G.$('speed').textContent = `${Math.round(Math.abs(p.v) * 3.6)} km/h`;
  G.$('boostFill').style.width = `${p.gauge * 100}%`;
  G.$('n2o').innerHTML = [0, 1].map(i => `<span class="slot ${i < p.n2o ? 'full' : ''}">N2O</span>`).join('');
  G.$('itemSlot').innerHTML = p.item ? `<span class="ic">${ITEMS[p.item].icon}</span><span>${ITEMS[p.item].name}</span>` : '<span class="ic">❔</span><span>아이템 없음</span>';
  G.$('driftTxt').textContent = p.drifting ? `드리프트!${p.combo > 0 ? ' x' + (p.combo + 1) : ''}` : (p.combo > 1 ? `콤보 x${p.combo}` : '');
  G.$('riders').textContent = G.nRiders(p) ? `🛒 탑승 손님 ${'🧍'.repeat(G.nRiders(p))} (-${G.nRiders(p) * 12}% 속도)` : '';
  G.$('driftTxt').className = p.drifting ? 'on' : '';
  G.$('chaos').textContent = G.chaos(); G.$('knocked').textContent = G.stats.knocked; G.$('spilled').textContent = G.stats.spilled;
  if (G.SHOPON()) { G.shop.render(dt, G.player); shopHud(); } }
}
function shopHud() {
  const p = G.player, S = G.shop.S(p), sale = new Set(G.shop.spots.filter(s => s.sale > 0).map(s => s.k));
  const rows = S.list.map(k => { const g = G.shop.GOODS[G.shop.GI[k]], ok = G.shop.has(p, k), br = S.items.some(it => it.k === k && it.broken); return `<div class="${ok ? 'ok' : ''}">${ok ? '✅' : br ? '💔' : '⬜'} ${g.i} ${g.n}${!ok && sale.has(k) ? ' <em>🏷️할인</em>' : ''}</div>`; }).join('');
  const sc = G.shop.score(p, -1, false, 0), money = S.items.filter(it => !it.broken).reduce((a, it) => a + G.shop.GOODS[G.shop.GI[it.k]].p * (it.sale ? 0.7 : 1), 0);
  const left = G.TLIM ? Math.max(0, T_LIMIT - (G.state === 'countdown' ? 0 : G.raceT)) : null;
  const sum = `<div>🧺 ${S.items.length}개 · ${won(money)}</div><div>⭐ ${sc.score.toLocaleString('ko-KR')}점</div>${left != null ? `<div class="${left < 30 ? 'warn' : ''}">⏳ ${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}</div>` : ''}${G.shop.complete(p) && !p.finished ? '<div class="go">🧾 계산대로 GO!</div>' : ''}`;
  const sig = rows + sum; if (sig !== G.shopHudSig) { G.shopHudSig = sig; G.$('shopList').innerHTML = rows; G.$('shopSum').innerHTML = sum; }
}
function updCharBtns() { const d = charOf(G.MYCHAR); for (const id of ['charBtn', 'lobbyChar']) { const b = G.$(id); if (b) b.innerHTML = `${d.emoji} <b>${d.name}</b> · 캐릭터 선택 ▸`; } }
export { flash, say, chatter, updateBubbles, setupMinimap, drawMinimap, announce, specUi, updateHud, updCharBtns };
