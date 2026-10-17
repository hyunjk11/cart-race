/**
 * parts.js — coins (🪙) + cart parts ownership/loadout, persisted in localStorage via LS (safe helper).
 * Pure data logic (no DOM, no game state): loadouts are plain objects { wheel: 'neon', body: 'gold', … } that also go over the network.
 */
import { SLOTS, PARTS, PART_STAT_CAP, COINS } from './config/parts.js';
import { LS } from './store.js';

const K_COINS = 'cartCoins',
  K_OWNED = 'cartOwned',
  K_LO = 'cartLoadout',
  K_WIN = 'cartWinDay';
const json = (k, d) => {
  try {
    const v = JSON.parse(LS.get(k) || 'null');
    return v && typeof v === 'object' ? v : d;
  } catch (e) {
    return d;
  }
};

export const partOf = (slot, id) => (PARTS[slot] || []).find(p => p.id === id) || null;
export const defLoadout = () => Object.fromEntries(SLOTS.map(s => [s.id, s.def]));
/** Sanitize a loadout (from storage or the network): unknown slots/ids -> defaults. */
export function cleanLoadout(lo) {
  const out = defLoadout();
  if (lo && typeof lo === 'object') for (const s of SLOTS) if (partOf(s.id, lo[s.id])) out[s.id] = lo[s.id];
  return out;
}

export const coins = () => Math.max(0, Math.floor(+LS.get(K_COINS, COINS.start) || 0));
export function addCoins(n) {
  LS.set(K_COINS, Math.max(0, coins() + Math.round(n)));
  return coins();
}
function ownedSet() {
  const o = json(K_OWNED, {});
  return o;
}
export const owns = (slot, id) => {
  const p = partOf(slot, id);
  return !!p && (p.price === 0 || !!(ownedSet()[slot] || []).includes(id));
};
/** Buy a part. Returns { ok, msg }. */
export function buy(slot, id) {
  const p = partOf(slot, id);
  if (!p) return { ok: false, msg: '없는 파츠예요' };
  if (owns(slot, id)) return { ok: true, msg: '이미 갖고 있어요' };
  if (coins() < p.price) return { ok: false, msg: `코인이 부족해요 (🪙 ${p.price - coins()} 더 필요)` };
  LS.set(K_COINS, coins() - p.price);
  const o = ownedSet();
  o[slot] = [...(o[slot] || []), id];
  LS.set(K_OWNED, JSON.stringify(o));
  return { ok: true, msg: `${p.name} 구매 완료!` };
}
export const loadout = () => cleanLoadout(json(K_LO, null));
export function equip(slot, id) {
  if (!owns(slot, id)) return false;
  const lo = loadout();
  lo[slot] = id;
  LS.set(K_LO, JSON.stringify(lo));
  return true;
}

/** Total stat multipliers { spd, hdl, drf } (1 = unchanged) for a loadout, each clamped to ±PART_STAT_CAP. */
export function statMods(lo) {
  const m = { spd: 0, hdl: 0, drf: 0 };
  lo = cleanLoadout(lo);
  for (const s of SLOTS) {
    const st = (partOf(s.id, lo[s.id]) || {}).st;
    if (st) for (const k in m) m[k] += st[k] || 0;
  }
  for (const k in m) m[k] = 1 + Math.max(-PART_STAT_CAP, Math.min(PART_STAT_CAP, m[k]));
  return m;
}
/** "+2% 속도 · -2% 핸들" style text for a stat object (fractions). */
export function statText(st) {
  if (!st) return '';
  const N = { spd: '속도', hdl: '핸들', drf: '드리프트' };
  return Object.entries(st)
    .filter(([, v]) => v)
    .map(([k, v]) => `${v > 0 ? '+' : ''}${Math.round(v * 100)}% ${N[k]}`)
    .join(' · ');
}
/** Random loadout for bots (each slot: 45% default part, else a random one). */
export function randomLoadout(rand = Math.random) {
  const lo = {};
  for (const s of SLOTS) {
    const L = PARTS[s.id];
    lo[s.id] = rand() < 0.45 ? s.def : L[1 + Math.floor(rand() * (L.length - 1))].id;
  }
  return lo;
}

/**
 * Coin reward for one finished run. r = { place (1-based, 0 = not finished), chaos, drifts, shop: { got, n } | null }.
 * Returns { lines: [[label, coins]], total }; adds it to the balance and marks today's first win.
 */
export function awardCoins(r, today = new Date().toISOString().slice(0, 10)) {
  const lines = [];
  lines.push([r.place > 0 ? `${r.place}위 완주` : '참가 보상', r.place > 0 ? COINS.place[r.place - 1] || COINS.dnf : COINS.dnf]);
  const ch = Math.min(COINS.chaosMax, Math.floor((r.chaos || 0) / COINS.chaosPer));
  if (ch) lines.push([`💥 혼돈 지수 ${r.chaos}`, ch]);
  const dr = Math.min(COINS.driftMax, (r.drifts || 0) * COINS.driftPer);
  if (dr) lines.push([`🌀 드리프트 콤보 ×${r.drifts}`, dr]);
  if (r.shop && r.shop.n) {
    const g = r.shop.got || 0;
    if (g) lines.push([`🧾 목록 ${g}/${r.shop.n}`, g * COINS.listPer]);
    if (g >= r.shop.n) lines.push(['🧾 목록 완성!', COINS.listFull]);
  }
  if (r.place === 1 && LS.get(K_WIN) !== today) {
    LS.set(K_WIN, today);
    lines.push(['🌅 오늘의 첫 승리', COINS.firstWin]);
  }
  const total = lines.reduce((a, l) => a + l[1], 0);
  addCoins(total);
  return { lines, total, balance: coins() };
}
