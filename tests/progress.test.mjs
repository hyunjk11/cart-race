// Unit tests for js/progress.js (guest→account merge, snapshot/apply). Run: node tests/progress.test.mjs
import * as P from '../js/progress.js';
let fails = 0;
const ok = (c, m) => (c ? console.log('ok  ', m) : (fails++, console.log('FAIL', m)));
const store = init => {
  const m = new Map(Object.entries(init || {}));
  return { get: k => (m.has(k) ? m.get(k) : null), set: (k, v) => m.set(k, String(v)), keys: () => [...m.keys()], m };
};
const a = store({ cartCoins: '500', cartOwned: '{"wheel":["neon"],"body":["gold"]}', cartLoadout: '{"wheel":"neon"}', cartChar: 'mango',
  cartBest_mart: '31.50', cartBest_freezer: '40.00', cartStats: '{"races":3,"wins":1}', cartMuted: '1', other: 'x' });
const s = P.snapshot(a, 100);
ok(s.coins === 500 && s.owned.wheel[0] === 'neon' && s.best.mart === 31.5 && s.stats.races === 3 && s.settings.cartMuted === '1' && !('other' in s.settings), 'snapshot reads save');
ok(P.snapshot(store({}), 100).coins === 100, 'snapshot default coins');
const cloud = { v: 1, coins: 300, owned: { wheel: ['chrome'] }, loadout: { wheel: 'chrome' }, char: 'kiwi', best: { mart: 33, parking: 50 }, stats: { races: 10, wins: 0 }, settings: { cartMuted: '0' } };
const m = P.merge(s, cloud);
ok(m.coins === 500, 'coins = max(local, cloud)');
ok(m.owned.wheel.includes('neon') && m.owned.wheel.includes('chrome') && m.owned.body[0] === 'gold', 'owned = union');
ok(m.best.mart === 31.5 && m.best.freezer === 40 && m.best.parking === 50, 'best = faster per map');
ok(m.stats.races === 10 && m.stats.wins === 1, 'stats = max');
ok(m.char === 'kiwi' && m.loadout.wheel === 'chrome' && m.settings.cartMuted === '0', 'cloud wins loadout/char/settings');
ok(P.merge(s, null).coins === 500 && P.merge(s, null).v === 1, 'no cloud row -> local');
ok(P.merge(s, { v: 1, coins: 9000 }).coins === 9000, 'cloud richer -> cloud coins');
const b = store({});
P.apply(b, m);
const s2 = P.snapshot(b, 0);
ok(JSON.stringify(P.merge(s2, m)) === JSON.stringify(P.merge(m, m)), 'apply round-trips');
ok(b.get('cartBest_mart') === '31.50' && b.get('cartChar') === 'kiwi', 'apply writes LS format');
P.apply(b, { coins: -5, best: { 'bad key': 3, mart: -1 }, settings: { evil: 'x', cartSteer: 'stick' } });
ok(b.get('cartCoins') === '0' && !b.get('evil') && b.get('cartSteer') === 'stick', 'apply sanitizes');
const r = P.addRun(b, { place: 1, knocked: 2, spilled: 3, drifts: 4, coins: 215 });
ok(r.races === 11 && r.wins === 2 && r.podiums === 1 && r.coinsEarned === 215, 'addRun');
ok(P.isSynced('cartBest_mart') && P.isSynced('cartCoins') && P.isSynced('cartNick') && !P.isSynced('cartSyncDirty') && !P.isSynced('cartSbAuth'), 'isSynced');
console.log(fails ? `FAIL ${fails}` : 'PROGRESS TESTS PASS');
process.exit(fails ? 1 : 0);
