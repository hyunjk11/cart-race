/**
 * results.js — race end: podium cutscene hand-off, finish/results screen, shopping-mode receipt, back-to-lobby.
 * Split out of main.js; shared state comes from state.js (S, ctx).
 */
import * as FX from './fx.js';
import * as TR from './track.js';
import { textSprite, hAt } from './track.js';
import { won } from './shop.js';
import { S, ctx } from './state.js';
import { $, stripTags } from './util.js';
import { awardCoins } from './parts.js';

/** Award this run's coins once (place 1-based, 0 = not finished) and return the breakdown HTML for the results panel. */
function coinBox(place, shop) {
  if (!S.coinsDone) S.coinsDone = awardCoins({ place, chaos: ctx.chaos(), drifts: S.player.drifts || 0, shop });
  const r = S.coinsDone;
  ctx.updGarBtn?.();
  return `<div class="coinbox" id="coinBox"><div class="cbh">🪙 코인 <b>+${r.total}</b></div>${r.lines.map(l => `<div class="cbl"><span>${stripTags(l[0])}</span><b>+${l[1]}</b></div>`).join('')}<div class="cbt">보유 🪙 <b>${r.balance.toLocaleString('ko-KR')}</b> · 🔧 차고에서 파츠를 사 보세요</div></div>`;
}

function endRace() {
  ctx.endSpectate();
  S.state = 'finished';
  ctx.startCut(ctx.SHOPON() ? shopRows()[0].c : ctx.finishOrder[0] || S.player);
  S.cutDone = () => {
    if (ctx.SHOPON()) {
      const rows = shopRows(),
        me = rows.findIndex(r => r.c === S.player);
      $('finTitle').textContent = me === 0 ? '🏆 장보기 1등!' : `장보기 ${me + 1}위`;
      $('finBody').innerHTML = receiptHTML(rows, ctx.carts.indexOf(S.player)) + coinBox(me + 1, { got: rows[me].rc.got, n: rows[me].rc.n });
      $('finish').classList.add('pod', 'shop');
      $('finish').classList.remove('hidden');
      FX.showPodium(
        rows.map(r => ({ name: r.name, char: r.c.char, color: r.c.color })),
        textSprite,
      );
      return;
    }
    const rank = ctx.finishOrder.indexOf(S.player) + 1;
    $('finTitle').textContent = rank === 1 ? '🏆 우승!' : `결승! ${rank}위`;
    const rows = ctx.finishOrder.map((c, i) => `${i + 1}위 ${c.name} — ${ctx.fmt(c.time)}`).join('<br>');
    const best = ctx.getBest(TR.MAP_ID);
    $('finBody').innerHTML =
      `${rows}<br><br>기록: <b>${ctx.fmt(S.player.time)}</b> · 맵: ${TR.MAP.icon} ${TR.MAP.name}<br>🏅 이 맵 최고 랩: <b>${best ? ctx.fmt(best) : '-'}</b>${S.player.newBest ? ' <span class="nb">신기록!</span>' : ''}<br>넘어뜨린 손님: ${ctx.stats.knocked}명 · 떨어뜨린 상품: ${ctx.stats.spilled}개<br>혼돈 지수: <b>${ctx.chaos()}</b>${coinBox(rank > 0 ? rank : 0, null)}`;
    $('finish').classList.add('pod');
    $('finish').classList.remove('shop', 'hidden');
    const rest = ctx.carts.filter(c => !c.inactive && !ctx.finishOrder.includes(c)).sort((a, b) => b.prog - a.prog);
    FX.showPodium(
      [...ctx.finishOrder, ...rest].map(c => ({ name: c.name, char: c.char, color: c.color })),
      textSprite,
    );
  };
}
function shopRows() {
  const act = ctx.carts.filter(c => !c.inactive),
    fin = ctx.finishOrder.filter(c => !c.inactive);
  return act
    .map(c => {
      const r = fin.indexOf(c),
        sc = S.shop.score(c, r, c.finished && r >= 0, c.time);
      return { c, name: c.name, time: c.finished ? c.time : null, bot: !!c.ai, i: ctx.carts.indexOf(c), score: sc.score, rc: sc };
    })
    .sort((a, b) => b.score - a.score || (a.time ?? 1e9) - (b.time ?? 1e9));
}
function receiptHTML(rows, me) {
  const r = rows.find(x => x.i === me) || rows[0],
    rc = r.rc,
    sum = rc.lines.reduce((a, l) => a + l[1], 0);
  const L = rc.lines
    .map(
      l =>
        `<tr class="${l[2] < 0 ? 'neg' : l[1] ? '' : 'miss'}"><td>${stripTags(l[0])}</td><td>${l[1] ? won(l[1]) : '-'}</td><td>${l[2] > 0 ? '+' : ''}${l[2] || ''}</td></tr>`,
    )
    .join('');
  const B = rc.bonus.map(b => `<tr class="bon"><td colspan="2">${stripTags(b[0])}</td><td>+${b[1]}</td></tr>`).join('');
  return (
    `<div class="receipt"><div class="rh">🛒 ${stripTags(TR.MAP.name)} 마트<br><small>영수증 · ${stripTags(r.name)} 고객님 · 목록 ${rc.got}/${rc.n}</small></div><table>${L}<tr class="sep"><td>결제 금액</td><td>${won(sum)}</td><td></td></tr>${B}</table><div class="rt">총점 <b>${rc.score.toLocaleString('ko-KR')}점</b></div><div class="rb">||| |||| || ||||| | |||</div></div>` +
    `<div class="rrank">${rows.map((x, k) => `<div class="${x.i === me ? 'me' : ''}">${k + 1}위 ${stripTags(x.name)}${x.bot ? ' 🤖' : ''} · <b>${x.score.toLocaleString('ko-KR')}점</b> · ${x.rc.got}/${x.rc.n} · ${x.time != null ? ctx.fmt(x.time) : '미계산'}</div>`).join('')}</div>`
  );
}
function podiumFromRows(rows) {
  return rows.slice(0, 3).map(r => {
    const c = ctx.carts.find(k => k.name === r.name) || ctx.carts.find(k => r.name.startsWith(k.baseName));
    return { name: r.name, char: c && c.char, color: c ? c.color : 0x888888 };
  });
}
function showResults(rows) {
  ctx.endSpectate();
  S.state = 'finished';
  $('finTitle').textContent = rows[0] && rows[0].rc ? '🧾 장보기 결과' : '🏁 레이스 결과';
  const myI = ctx.carts.indexOf(S.player),
    me = rows.findIndex(r => r.i === myI),
    mine = rows[me];
  const coins =
    S.player.lateSpec || me < 0
      ? ''
      : coinBox(mine.time != null || mine.rc ? me + 1 : 0, mine.rc ? { got: mine.rc.got, n: mine.rc.n } : null);
  if (rows[0] && rows[0].rc) $('finBody').innerHTML = receiptHTML(rows, myI) + coins + '<i>잠시 후 로비로 돌아갑니다…</i>';
  else
    $('finBody').innerHTML =
      rows
        .map((r, i) => `${i + 1}위 ${r.name.replace(/[<>&]/g, '')}${r.bot ? ' 🤖' : ''} — ${r.time != null ? ctx.fmt(r.time) : '미완주'}`)
        .join('<br>') +
      coins +
      '<br><i>잠시 후 로비로 돌아갑니다…</i>';
  $('restart').classList.add('hidden');
  const show = () => {
    $('finish').classList.add('pod');
    $('finish').classList.toggle('shop', !!(rows[0] && rows[0].rc));
    $('finish').classList.remove('hidden');
    FX.showPodium(podiumFromRows(rows), textSprite);
  };
  if (S.cut) {
    S.cutDone = show;
    S.cut.dur = Math.min(S.cut.dur, S.cut.t + 1.2);
    setTimeout(ctx.endCut, 1500);
  } else show();
}
function toLobby() {
  ctx.endSpectate();
  S.cut = null;
  S.cutDone = null;
  $('cutbar').classList.remove('show');
  FX.hidePodium();
  ctx.showIntro(false);
  $('finish').classList.remove('pod');
  $('finish').classList.add('hidden');
  $('restart').classList.remove('hidden');
  S.fun.reset();
  ctx.carts.forEach((c, i) => {
    const was = c.inactive;
    ctx.resetCart(c, i);
    c.inactive = was;
    if (was) {
      c.x = c.z = 999;
    }
  });
  S.state = 'lobby';
  $('countdown').textContent = '';
}
function leftRoom() {
  ctx.endSpectate();
  S.MODE = 'solo';
  S.fun.reset();
  S.cut = null;
  S.cutDone = null;
  $('cutbar').classList.remove('show');
  FX.hidePodium();
  ctx.showIntro(false);
  $('finish').classList.remove('pod');
  ctx.carts.forEach((c, i) => {
    ctx.resetCart(c, i);
    c.g.root.visible = true;
    c.ai = i > 0;
    c.name = c.baseName;
    ctx.nameTag(c, null);
  });
  for (const cu of ctx.customers) {
    cu.nt = null;
    if (cu.state !== 'walk' || !cu.body) {
      if (cu.body) {
        ctx.world.removeBody(cu.body);
        cu.body = null;
      }
      cu.state = 'walk';
      cu.cart = null;
      cu.rush = null;
      cu.holder.scale.setScalar(1);
      cu.holder.rotation.set(0, 0, 0);
      cu.x = cu.holder.position.x;
      cu.z = cu.holder.position.z;
      cu.holder.position.y = 0.85 + hAt(cu.x, cu.z);
      ctx.pushOut(cu, 0.5);
      ctx.retarget(cu);
    }
  }
  S.player = ctx.carts[0];
  S.state = 'lobby';
  $('finish').classList.add('hidden');
  $('restart').classList.remove('hidden');
}
export { endRace, shopRows, showResults, toLobby, leftRoom };
