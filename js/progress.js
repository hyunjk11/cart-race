/**
 * progress.js — the game save as one plain object (for the cloud copy in Supabase cart_progress.data) and the guest→account merge.
 * Pure data logic over a key/value store { get(k), set(k, v), keys() } (LS in the game, a Map in tests). No DOM, no network.
 * snapshot = { v, coins, owned{slot:[ids]}, loadout{slot:id}, char, best{mapId:seconds}, stats{…}, winDay, settings{key:string} }
 */
export const K = {
  coins: 'cartCoins',
  owned: 'cartOwned',
  loadout: 'cartLoadout',
  char: 'cartChar',
  stats: 'cartStats',
  winDay: 'cartWinDay',
  nick: 'cartNick',
};
export const BEST_PREFIX = 'cartBest_';
/** plain-string settings that follow the account */
export const SETTINGS = [
  'cartQuality',
  'cartMuted',
  'cartAuto',
  'cartSteer',
  'cartMotion',
  'cartKeys',
  'cartDiff',
  'cartMode',
  'cartTlim',
  'cartMap',
  'cartTips',
  'cartTutShop',
];
export const STAT_KEYS = ['races', 'wins', 'podiums', 'knocked', 'spilled', 'drifts', 'coinsEarned'];
/** true if a localStorage key is part of the synced save */
export const isSynced = k => k === K.nick || Object.values(K).includes(k) || SETTINGS.includes(k) || k.startsWith(BEST_PREFIX);

const obj = v => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const parse = (s, d) => {
  try {
    const v = JSON.parse(s);
    return v ?? d;
  } catch (e) {
    return d;
  }
};
const num = (v, d = 0) => (Number.isFinite(+v) && v !== null && v !== '' ? +v : d);

export const emptyStats = () => Object.fromEntries(STAT_KEYS.map(k => [k, 0]));
export const readStats = st => ({ ...emptyStats(), ...cleanStats(parse(st.get(K.stats), {})) });
function cleanStats(s) {
  const o = {};
  for (const k of STAT_KEYS) o[k] = Math.max(0, Math.floor(num(obj(s)[k])));
  return o;
}
function cleanOwned(o) {
  const out = {};
  for (const [slot, ids] of Object.entries(obj(o)))
    if (Array.isArray(ids)) out[slot] = [...new Set(ids.filter(x => typeof x === 'string'))];
  return out;
}
function cleanBest(b) {
  const out = {};
  for (const [m, t] of Object.entries(obj(b))) if (/^[a-z0-9_]{1,20}$/.test(m) && num(t) > 0) out[m] = +num(t).toFixed(2);
  return out;
}

/** Read the current save out of a store. */
export function snapshot(st, coinStart = 0) {
  const best = {},
    settings = {};
  for (const k of st.keys())
    if (k && k.startsWith(BEST_PREFIX) && num(st.get(k)) > 0) best[k.slice(BEST_PREFIX.length)] = +num(st.get(k)).toFixed(2);
  for (const k of SETTINGS) {
    const v = st.get(k);
    if (v !== null && v !== undefined) settings[k] = String(v);
  }
  return {
    v: 1,
    coins: Math.max(0, Math.floor(num(st.get(K.coins), coinStart))),
    owned: cleanOwned(parse(st.get(K.owned), {})),
    loadout: obj(parse(st.get(K.loadout), {})),
    char: st.get(K.char) || null,
    best: cleanBest(best),
    stats: readStats(st),
    winDay: st.get(K.winDay) || null,
    settings,
  };
}

/** Write a save into a store (cloud → device). */
export function apply(st, d) {
  d = obj(d);
  if (d.coins !== undefined) st.set(K.coins, Math.max(0, Math.floor(num(d.coins))));
  if (d.owned) st.set(K.owned, JSON.stringify(cleanOwned(d.owned)));
  if (d.loadout) st.set(K.loadout, JSON.stringify(obj(d.loadout)));
  if (d.char) st.set(K.char, String(d.char));
  for (const [m, t] of Object.entries(cleanBest(d.best))) st.set(BEST_PREFIX + m, t.toFixed(2));
  if (d.stats) st.set(K.stats, JSON.stringify(cleanStats(d.stats)));
  if (d.winDay) st.set(K.winDay, String(d.winDay));
  for (const [k, v] of Object.entries(obj(d.settings))) if (SETTINGS.includes(k) && typeof v === 'string') st.set(k, v);
}

/**
 * One-time merge of this device's guest progress into the account's cloud save:
 * owned parts = union, best laps = faster, stats = max per counter, coins = max(local, cloud) (never summed, so
 * logging in on several devices can't multiply coins). Loadout/character/settings: cloud wins when it has them.
 */
export function merge(local, cloud) {
  local = obj(local);
  cloud = obj(cloud);
  if (!cloud.v) return { ...local, v: 1 };
  const owned = cleanOwned(cloud.owned);
  for (const [slot, ids] of Object.entries(cleanOwned(local.owned))) owned[slot] = [...new Set([...(owned[slot] || []), ...ids])];
  const best = cleanBest(cloud.best);
  for (const [m, t] of Object.entries(cleanBest(local.best))) if (!best[m] || t < best[m]) best[m] = t;
  const ls = cleanStats(local.stats),
    cs = cleanStats(cloud.stats),
    stats = {};
  for (const k of STAT_KEYS) stats[k] = Math.max(ls[k], cs[k]);
  return {
    v: 1,
    coins: Math.max(Math.floor(num(local.coins)), Math.floor(num(cloud.coins))),
    owned,
    loadout: Object.keys(obj(cloud.loadout)).length ? cloud.loadout : obj(local.loadout),
    char: cloud.char || local.char || null,
    best,
    stats,
    winDay: [cloud.winDay, local.winDay].filter(Boolean).sort().pop() || null,
    settings: { ...obj(local.settings), ...obj(cloud.settings) },
  };
}

/** Count a finished run into the persistent stats. r = { place, knocked, spilled, drifts, coins } */
export function addRun(st, r) {
  const s = readStats(st);
  s.races++;
  if (r.place === 1) s.wins++;
  if (r.place >= 1 && r.place <= 3) s.podiums++;
  s.knocked += Math.max(0, r.knocked | 0);
  s.spilled += Math.max(0, r.spilled | 0);
  s.drifts += Math.max(0, r.drifts | 0);
  s.coinsEarned += Math.max(0, r.coins | 0);
  st.set(K.stats, JSON.stringify(s));
  return s;
}
