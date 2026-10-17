/**
 * hud.js — in-race HUD: flash messages, speech bubbles, PA announcer, minimap, spectator UI, standings/HUD text.
 * Split out of main.js; shared state comes from state.js (S = mutable state, ctx = main.js objects/services).
 */
import * as THREE from 'three';
import * as TR from './track.js';
import { path, hAt, strips, tangentAt } from './track.js';
import { LAPS } from './config/tuning.js';
import { charOf } from './chars.js';
import { tutorialTick } from './help.js';

import { ITEMS } from './config/items.js';
import { won } from './shop.js';
import { T_LIMIT } from './config/shop.js';
import { S, ctx } from './state.js';
import { $, pick, stripTags } from './util.js';
import { netSay } from './netglue.js';

let MAXB, _v, mm, mctx, MW, MH, mmS, sx, sz, mmBg, annUntil, msgUntil;
function flash(t) {
  $('msg').textContent = t;
  S.msgT = 1.5;
  msgUntil = Date.now() + 4000;
}
function say(ent, text, dur = 2, force = false) {
  const now = performance.now() / 1000;
  if (!force && (ent.sayCd || 0) > now) return;
  if (S.MODE === 'host') netSay(ent, text, dur);
  if (ctx.bubbles.length >= MAXB) {
    if (!force) return;
    const old = ctx.bubbles.shift();
    old.el.remove();
  }
  const pos = ent.holder ? ent.holder.position : ent.g.root.position;
  if (!force && pos.distanceTo(ctx.camera.position) > 30) return;
  const ex = ctx.bubbles.find(b => b.ent === ent);
  if (ex) {
    ex.el.remove();
    ctx.bubbles.splice(ctx.bubbles.indexOf(ex), 1);
  }
  const el = document.createElement('div');
  el.className = 'bubble' + (ent.g && ent.g.root && !ent.holder ? ' cart' : '');
  el.textContent = text;
  ctx.bubbleLayer.appendChild(el);
  ctx.bubbles.push({ ent, el, t: 0, dur });
  ent.sayCd = now + dur + 2.5;
}
function chatter(cu) {
  if (ctx.bubbles.length < 3)
    say(
      cu,
      pick([
        '두부가 어디 있더라…',
        '오늘 할인한대!',
        '우유 사야지~',
        '라면 1+1이네!',
        '애들 간식은…',
        '계산대 줄 길다…',
        '어? 이거 싸다!',
        '장바구니 어디 뒀지?',
      ]),
    );
}
function updateBubbles() {
  const now = performance.now() / 1000;
  for (let i = ctx.bubbles.length - 1; i >= 0; i--) {
    const b = ctx.bubbles[i];
    b.t += 1 / 60;
    if (b.t > b.dur) {
      b.el.remove();
      ctx.bubbles.splice(i, 1);
      continue;
    }
    const p = b.ent.holder ? b.ent.holder.position : b.ent.g.root.position;
    _v.set(p.x, b.ent.holder ? (b.ent.body ? p.y + 1.2 : p.y + 1.45) : p.y + 2.6, p.z).project(ctx.camera);
    if (_v.z > 1) {
      b.el.style.display = 'none';
      continue;
    }
    b.el.style.display = '';
    b.el.style.opacity = Math.min(1, (b.dur - b.t) * 2, b.t * 6);
    b.el.style.transform = `translate(-50%,-100%) translate(${Math.max(60, Math.min(innerWidth - 60, (_v.x * 0.5 + 0.5) * innerWidth))}px,${(-_v.y * 0.5 + 0.5) * innerHeight}px)`;
  }
}
export function init0() {
  MAXB = 4;
  // phones: tap a HUD box to show/hide the low-value stats (best lap, knocked customers, spilled products)
  for (const id of ['hudL', 'hudR']) {
    const el = $(id);
    el.addEventListener('pointerdown', e => e.stopPropagation());
    el.addEventListener('click', e => {
      e.stopPropagation();
      document.body.classList.toggle('hudmore');
    });
  }
  _v = new THREE.Vector3();
  setInterval(() => {
    if (S.state !== 'race') return;
    const sorted = [...ctx.carts].sort((a, b) => b.prog - a.prog);
    for (const c of ctx.carts)
      if (c.ai && Math.hypot(c.x - S.player.x, c.z - S.player.z) < 15 && Math.random() < 0.25)
        say(
          c,
          sorted[0] === c
            ? pick(['내가 1등이다!', '따라올 테면 따라와~', '느려 느려~'])
            : pick(['어림없지!', '추월한다!', '비켜비켜!', '내 차례야!']),
        );
  }, 1500);
}
function setupMinimap() {
  // fit the current map's bounds; pre-render the static layer
  const B = TR.MAP.bounds;
  mmS = Math.min(MW / (B.x1 - B.x0), MH / (B.z1 - B.z0));
  const ox = (MW - (B.x1 - B.x0) * mmS) / 2,
    oz = (MH - (B.z1 - B.z0) * mmS) / 2;
  sx = x => ox + (x - B.x0) * mmS;
  sz = z => oz + (z - B.z0) * mmS;
  mmBg = document.createElement('canvas');
  mmBg.width = MW;
  mmBg.height = MH;
  const g = mmBg.getContext('2d');
  g.fillStyle = 'rgba(0,0,0,.45)';
  g.fillRect(0, 0, MW, MH);
  g.lineJoin = 'round';
  g.strokeStyle = 'rgba(255,255,255,.55)';
  g.lineWidth = Math.max(4, 2 * TR.HW * mmS * 0.75);
  g.beginPath();
  path.forEach((p, i) => (i ? g.lineTo(sx(p.x), sz(p.y)) : g.moveTo(sx(p.x), sz(p.y))));
  g.closePath();
  g.stroke();
  g.strokeStyle = 'rgba(255,214,120,.75)';
  g.lineWidth = Math.max(2, TR.HW * mmS * 0.6);
  g.beginPath();
  let on = false; // elevated parts
  path.forEach((p, i) => {
    const up = hAt(p.x, p.y) > 0.5;
    if (up && !on) g.moveTo(sx(p.x), sz(p.y));
    else if (up) g.lineTo(sx(p.x), sz(p.y));
    on = up;
  });
  g.stroke();
  for (const r of TR.MAP.open || []) {
    g.fillStyle = 'rgba(255,214,120,.75)';
    g.fillRect(sx(r.x0), sz(r.z0 + 0.5), (r.x1 - r.x0) * mmS, (r.z1 - r.z0 - 1) * mmS);
  }
  for (const zn of TR.MAP.zones) {
    g.fillStyle = { ice: 'rgba(160,230,255,.9)', walk: 'rgba(79,195,247,.95)', esc: 'rgba(255,213,79,.9)', bump: 'rgba(253,216,53,.95)' }[
      zn.t
    ];
    g.fillRect(sx(zn.x0), sz(zn.z0), Math.max(1.5, (zn.x1 - zn.x0) * mmS), Math.max(1.5, (zn.z1 - zn.z0) * mmS));
  }
  for (const s of strips)
    if (s.kind === 'pillar' || s.kind === 'car') {
      g.fillStyle = s.kind === 'car' ? '#90a4ae' : '#cfd8dc';
      g.fillRect(sx(s.x0), sz(s.z0), Math.max(1.5, (s.x1 - s.x0) * mmS), Math.max(1.5, (s.z1 - s.z0) * mmS));
    }
  const p0 = path[0],
    [tx, tz] = tangentAt(0);
  g.strokeStyle = '#fff';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(sx(p0.x - tz * TR.HW), sz(p0.y + tx * TR.HW));
  g.lineTo(sx(p0.x + tz * TR.HW), sz(p0.y - tx * TR.HW));
  g.stroke();
}
function drawMinimap() {
  mctx.clearRect(0, 0, MW, MH);
  if (mmBg) mctx.drawImage(mmBg, 0, 0);
  if (ctx.SHOPON() && S.state !== 'title')
    for (const s of S.shop.spots)
      if (S.shop.need(S.player, s.k) || s.sale > 0) {
        mctx.fillStyle = s.sale > 0 ? '#ff1744' : '#ffee58';
        mctx.fillRect(sx(s.x) - 2.5, sz(s.z) - 2.5, 5, 5);
      }
  for (const T of ctx.traffic) {
    mctx.fillStyle = '#ff7043';
    mctx.fillRect(sx(T.x) - 2.5, sz(T.z) - 2.5, 5, 5);
  }
  for (const cu of ctx.customers) {
    const x = cu.body ? cu.body.position.x : cu.x,
      z = cu.body ? cu.body.position.z : cu.z;
    mctx.fillStyle = cu.state === 'walk' ? '#bbb' : '#f44';
    mctx.fillRect(sx(x) - 1, sz(z) - 1, 2, 2);
  }
  for (const c of ctx.carts) {
    if (c.inactive) continue;
    mctx.fillStyle = '#' + c.color.toString(16).padStart(6, '0');
    mctx.beginPath();
    mctx.arc(sx(c.x), sz(c.z), c === S.player ? 4.5 : 3.5, 0, 7);
    mctx.fill();
    if (c === S.player) {
      mctx.strokeStyle = '#fff';
      mctx.lineWidth = 1.5;
      mctx.stroke();
    }
    mctx.font = '9px sans-serif';
    mctx.textAlign = 'center';
    mctx.fillText(charOf(c.char).emoji, sx(c.x), sz(c.z) - 5);
  }
}
function announce(t) {
  const el = $('event');
  el.textContent = '📢 ' + t;
  el.classList.add('show');
  annUntil = Date.now() + 3500;
}
export function init1() {
  mm = $('minimap');
  mctx = mm.getContext('2d');
  MW = mm.width;
  MH = mm.height;
  mmS = 1;
  sx = x => x;
  sz = z => z;
  mmBg = null;
  annUntil = 0;
  msgUntil = 0;
  setInterval(() => {
    const now = Date.now();
    if (annUntil && now > annUntil) {
      annUntil = 0;
      $('event').classList.remove('show');
    }
    const m = $('msg');
    if (m.textContent && !msgUntil) msgUntil = now + 4000;
    if (!m.textContent) msgUntil = 0;
    else if (now > msgUntil) {
      m.textContent = '';
      msgUntil = 0;
    }
  }, 250);
}
function specUi() {
  if (!S.spec) return;
  const c = ctx.specCart(),
    sig = `${c.name}|${ctx.SHOPON() ? S.shop.got(c) + '/' + S.shop.S(c).list.length : ''}|${S.spec.ff}|${ctx.specList().length}`;
  if (sig === S.specSig) return;
  S.specSig = sig;
  $('specName').textContent =
    c === S.player
      ? '👀 관전 중 · 모두 계산 완료!'
      : `👀 관전 중: ${c.name}${ctx.SHOPON() ? ` (목록 ${S.shop.got(c)}/${S.shop.S(c).list.length})` : ''} · 남은 손님 ${ctx.specList().length}명`;
  $('specFF').textContent = S.spec.ff ? '⏩ 빨리 감기 중… (x24)' : '⏩ 빨리 감기';
  $('specFF').classList.toggle('on', S.spec.ff);
}
export function init2() {
  $('specNext').onclick = e => {
    e.stopPropagation();
    if (S.spec) {
      S.spec.i++;
      ctx.camPos.set(0, 0, 0);
      S.specSig = '';
      specUi();
    }
  };
  $('specFF').onclick = e => {
    e.stopPropagation();
    if (S.spec && S.MODE === 'solo') {
      S.spec.ff = !S.spec.ff;
      S.specSig = '';
      specUi();
    }
  };
}
function updateHud(dt) {
  // HUD
  {
    const p = S.player;
    const active = ctx.carts.filter(c => !c.inactive),
      sorted = [...active].sort((a, b) => b.prog - a.prog);
    $('time').textContent = ctx.fmt(S.state === 'finished' ? p.time : S.raceT);
    $('lap').textContent = ctx.SHOPON()
      ? `${S.shop.got(p)}/${S.shop.S(p).list.length}`
      : `${Math.min(LAPS, Math.max(1, p.lap + 1))}/${LAPS}`;
    {
      const b = ctx.getBest(TR.MAP_ID);
      const t = b ? ctx.fmt(b) : '-';
      if ($('best').textContent !== t) $('best').textContent = t;
    }
    $('rank').textContent =
      `${(p.finished && ctx.finishOrder.includes(p) ? ctx.finishOrder.indexOf(p) : sorted.indexOf(p)) + 1}/${active.length}`;
    {
      const ord = [...ctx.finishOrder.filter(c => !c.inactive), ...sorted.filter(c => !ctx.finishOrder.includes(c))],
        sig = ord.map(c => c.char + c.name + (c === p)).join();
      if (sig !== S.standSig) {
        S.standSig = sig;
        $('standings').innerHTML = ord
          .map(
            (c, i) =>
              `<span class="${c === p ? 'me' : ''}" style="--c:#${c.color.toString(16).padStart(6, '0')}"><b>${i + 1}</b>${charOf(c.char).emoji}<em>${c === p ? '나' : stripTags(c.name.replace(/ ?\(봇\)| 봇$/, ''))}</em></span>`,
          )
          .join('');
      }
    }
    tutorialTick({
      state: S.state,
      raceT: S.raceT,
      touch: ctx.IS_TOUCH,
      shop: ctx.SHOPON(),
      n2o: p.n2o,
      item: p.item,
      riders: ctx.nRiders(p),
    });
    $('speed').textContent = `${Math.round(Math.abs(p.v) * 3.6)} km/h`;
    $('boostFill').style.width = `${p.gauge * 100}%`;
    $('n2o').innerHTML = [0, 1].map(i => `<span class="slot ${i < p.n2o ? 'full' : ''}">N2O</span>`).join('');
    $('itemSlot').innerHTML = p.item
      ? `<span class="ic">${ITEMS[p.item].icon}</span><span>${ITEMS[p.item].name}</span>`
      : '<span class="ic">❔</span><span>아이템 없음</span>';
    $('driftTxt').textContent = p.drifting ? `드리프트!${p.combo > 0 ? ' x' + (p.combo + 1) : ''}` : p.combo > 1 ? `콤보 x${p.combo}` : '';
    $('riders').textContent = ctx.nRiders(p) ? `🛒 탑승 손님 ${'🧍'.repeat(ctx.nRiders(p))} (-${ctx.nRiders(p) * 12}% 속도)` : '';
    $('driftTxt').className = p.drifting ? 'on' : '';
    $('chaos').textContent = ctx.chaos();
    $('knocked').textContent = ctx.stats.knocked;
    $('spilled').textContent = ctx.stats.spilled;
    if (ctx.SHOPON()) {
      S.shop.render(dt, S.player);
      shopHud();
    }
  }
}
function shopHud() {
  const p = S.player,
    ps = S.shop.S(p),
    sale = new Set(S.shop.spots.filter(s => s.sale > 0).map(s => s.k));
  const rows = ps.list
    .map(k => {
      const g = S.shop.GOODS[S.shop.GI[k]],
        ok = S.shop.has(p, k),
        br = ps.items.some(it => it.k === k && it.broken);
      return `<div class="${ok ? 'ok' : ''}">${ok ? '✅' : br ? '💔' : '⬜'} ${g.i} ${g.n}${!ok && sale.has(k) ? ' <em>🏷️할인</em>' : ''}</div>`;
    })
    .join('');
  const sc = S.shop.score(p, -1, false, 0),
    money = ps.items.filter(it => !it.broken).reduce((a, it) => a + S.shop.GOODS[S.shop.GI[it.k]].p * (it.sale ? 0.7 : 1), 0);
  const left = S.TLIM ? Math.max(0, T_LIMIT - (S.state === 'countdown' ? 0 : S.raceT)) : null;
  const sum = `<div>🧺 ${ps.items.length}개 · ${won(money)}</div><div>⭐ ${sc.score.toLocaleString('ko-KR')}점</div>${left != null ? `<div class="${left < 30 ? 'warn' : ''}">⏳ ${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}</div>` : ''}${S.shop.complete(p) && !p.finished ? '<div class="go">🧾 계산대로 GO!</div>' : ''}`;
  const sig = rows + sum;
  if (sig !== S.shopHudSig) {
    S.shopHudSig = sig;
    $('shopList').innerHTML = rows;
    $('shopSum').innerHTML = sum;
  }
}
function updCharBtns() {
  const d = charOf(S.MYCHAR);
  for (const id of ['charBtn', 'lobbyChar']) {
    const b = $(id);
    if (b) b.innerHTML = `${d.emoji} <b>${d.name}</b> · 캐릭터 선택 ▸`;
  }
}
export { flash, say, chatter, updateBubbles, setupMinimap, drawMinimap, announce, specUi, updateHud, updCharBtns };
