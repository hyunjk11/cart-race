// split out of main.js (no behavior change): shared main.js state is reached through G (getters/setters)
import * as FX from './fx.js';
import * as TR from './track.js';
import { textSprite, hAt } from './track.js';
import { won } from './shop.js';
let G = null; export const bind = g => { G = g; };
function endRace() {
  G.endSpectate(); G.state = 'finished'; G.startCut(G.SHOPON() ? shopRows()[0].c : G.finishOrder[0] || G.player);
  G.cutDone = () => {
    if (G.SHOPON()) { const rows = shopRows(), me = rows.findIndex(r => r.c === G.player); G.$('finTitle').textContent = me === 0 ? '🏆 장보기 1등!' : `장보기 ${me + 1}위`;
      G.$('finBody').innerHTML = receiptHTML(rows, G.carts.indexOf(G.player)); G.$('finish').classList.add('pod', 'shop'); G.$('finish').classList.remove('hidden');
      FX.showPodium(rows.map(r => ({ name: r.name, char: r.c.char, color: r.c.color })), textSprite); return; }
    const rank = G.finishOrder.indexOf(G.player) + 1;
    G.$('finTitle').textContent = rank === 1 ? '🏆 우승!' : `결승! ${rank}위`;
    const rows = G.finishOrder.map((c, i) => `${i + 1}위 ${c.name} — ${G.fmt(c.time)}`).join('<br>');
    const best = G.getBest(TR.MAP_ID);
    G.$('finBody').innerHTML = `${rows}<br><br>기록: <b>${G.fmt(G.player.time)}</b> · 맵: ${TR.MAP.icon} ${TR.MAP.name}<br>🏅 이 맵 최고 랩: <b>${best ? G.fmt(best) : '-'}</b>${G.player.newBest ? ' <span class="nb">신기록!</span>' : ''}<br>넘어뜨린 손님: ${G.stats.knocked}명 · 떨어뜨린 상품: ${G.stats.spilled}개<br>혼돈 지수: <b>${G.chaos()}</b>`;
    G.$('finish').classList.add('pod'); G.$('finish').classList.remove('shop', 'hidden');
    const rest = G.carts.filter(c => !c.inactive && !G.finishOrder.includes(c)).sort((a, b) => b.prog - a.prog);
    FX.showPodium([...G.finishOrder, ...rest].map(c => ({ name: c.name, char: c.char, color: c.color })), textSprite);
  };
}
function shopRows() {
  const act = G.carts.filter(c => !c.inactive), fin = G.finishOrder.filter(c => !c.inactive);
  return act.map(c => { const r = fin.indexOf(c), sc = G.shop.score(c, r, c.finished && r >= 0, c.time); return { c, name: c.name, time: c.finished ? c.time : null, bot: !!c.ai, i: G.carts.indexOf(c), score: sc.score, rc: sc }; })
    .sort((a, b) => b.score - a.score || (a.time ?? 1e9) - (b.time ?? 1e9));
}
function receiptHTML(rows, me) {
  const r = rows.find(x => x.i === me) || rows[0], rc = r.rc, sum = rc.lines.reduce((a, l) => a + l[1], 0);
  const L = rc.lines.map(l => `<tr class="${l[2] < 0 ? 'neg' : l[1] ? '' : 'miss'}"><td>${G.esc(l[0])}</td><td>${l[1] ? won(l[1]) : '-'}</td><td>${l[2] > 0 ? '+' : ''}${l[2] || ''}</td></tr>`).join('');
  const B = rc.bonus.map(b => `<tr class="bon"><td colspan="2">${G.esc(b[0])}</td><td>+${b[1]}</td></tr>`).join('');
  return `<div class="receipt"><div class="rh">🛒 ${G.esc(TR.MAP.name)} 마트<br><small>영수증 · ${G.esc(r.name)} 고객님 · 목록 ${rc.got}/${rc.n}</small></div><table>${L}<tr class="sep"><td>결제 금액</td><td>${won(sum)}</td><td></td></tr>${B}</table><div class="rt">총점 <b>${rc.score.toLocaleString('ko-KR')}점</b></div><div class="rb">||| |||| || ||||| | |||</div></div>`
    + `<div class="rrank">${rows.map((x, k) => `<div class="${x.i === me ? 'me' : ''}">${k + 1}위 ${G.esc(x.name)}${x.bot ? ' 🤖' : ''} · <b>${x.score.toLocaleString('ko-KR')}점</b> · ${x.rc.got}/${x.rc.n} · ${x.time != null ? G.fmt(x.time) : '미계산'}</div>`).join('')}</div>`;
}
function podiumFromRows(rows) {
  return rows.slice(0, 3).map(r => { const c = G.carts.find(k => k.name === r.name) || G.carts.find(k => r.name.startsWith(k.baseName)); return { name: r.name, char: c && c.char, color: c ? c.color : 0x888888 }; });
}
function showResults(rows) {
  G.endSpectate();
  G.state = 'finished'; G.$('finTitle').textContent = rows[0] && rows[0].rc ? '🧾 장보기 결과' : '🏁 경주 결과';
  if (rows[0] && rows[0].rc) G.$('finBody').innerHTML = receiptHTML(rows, G.carts.indexOf(G.player)) + '<i>잠시 후 로비로 돌아갑니다…</i>'; else G.$('finBody').innerHTML = rows.map((r, i) => `${i + 1}위 ${r.name.replace(/[<>&]/g, '')}${r.bot ? ' 🤖' : ''} — ${r.time != null ? G.fmt(r.time) : '미완주'}`).join('<br>') + '<br><br><i>잠시 후 로비로 돌아갑니다…</i>';
  G.$('restart').classList.add('hidden');
  const show = () => { G.$('finish').classList.add('pod'); G.$('finish').classList.toggle('shop', !!(rows[0] && rows[0].rc)); G.$('finish').classList.remove('hidden'); FX.showPodium(podiumFromRows(rows), textSprite); };
  if (G.cut) { G.cutDone = show; G.cut.dur = Math.min(G.cut.dur, G.cut.t + 1.2); setTimeout(G.endCut, 1500); } else show();
}
function toLobby() {
  G.endSpectate();
  G.cut = null; G.cutDone = null; G.$('cutbar').classList.remove('show'); FX.hidePodium(); G.showIntro(false); G.$('finish').classList.remove('pod');
  G.$('finish').classList.add('hidden'); G.$('restart').classList.remove('hidden'); G.fun.reset();
  G.carts.forEach((c, i) => { const was = c.inactive; G.resetCart(c, i); c.inactive = was; if (was) { c.x = c.z = 999; } });
  G.state = 'lobby'; G.$('countdown').textContent = '';
}
function leftRoom() {
  G.endSpectate();
  G.MODE = 'solo'; G.fun.reset(); G.cut = null; G.cutDone = null; G.$('cutbar').classList.remove('show'); FX.hidePodium(); G.showIntro(false); G.$('finish').classList.remove('pod');
  G.carts.forEach((c, i) => { G.resetCart(c, i); c.g.root.visible = true; c.ai = i > 0; c.name = c.baseName; G.nameTag(c, null); });
  for (const cu of G.customers) { cu.nt = null; if (cu.state !== 'walk' || !cu.body) { if (cu.body) { G.world.removeBody(cu.body); cu.body = null; } cu.state = 'walk'; cu.cart = null; cu.rush = null; cu.holder.scale.setScalar(1); cu.holder.rotation.set(0, 0, 0); cu.x = cu.holder.position.x; cu.z = cu.holder.position.z; cu.holder.position.y = 0.85 + hAt(cu.x, cu.z); G.pushOut(cu, 0.5); G.retarget(cu); } }
  G.player = G.carts[0]; G.state = 'lobby'; G.$('finish').classList.add('hidden'); G.$('restart').classList.remove('hidden');
}
export { endRace, shopRows, showResults, toLobby, leftRoom };
