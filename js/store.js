/**
 * store.js — Safe persistent storage (private-mode / disabled-storage browsers throw on access) + debug flag
 */
const mem = new Map();
const subs = [];
export const LS = {
  /** Subscribe to writes: fn(key, value). Used by account.js to sync progress to the cloud. */
  onSet(fn) {
    subs.push(fn);
  },
  get(k, d = null) {
    try {
      const v = localStorage.getItem(k);
      return v === null ? (mem.has(k) ? mem.get(k) : d) : v;
    } catch (e) {
      return mem.has(k) ? mem.get(k) : d;
    }
  },
  set(k, v) {
    v = String(v);
    mem.set(k, v);
    try {
      localStorage.setItem(k, v);
    } catch (e) {
      /* quota / private mode: keep in memory */
    }
    for (const f of subs) f(k, v);
  },
  del(k) {
    mem.delete(k);
    try {
      localStorage.removeItem(k);
    } catch (e) {
      /* ignore */
    }
  },
  keys() {
    const ks = new Set(mem.keys());
    try {
      for (let i = 0; i < localStorage.length; i++) ks.add(localStorage.key(i));
    } catch (e) {
      /* ignore */
    }
    return [...ks];
  },
};
// test/debug hooks (window.__game, tuning query params) are only exposed with ?debug=1
export const DEBUG = (() => {
  try {
    return new URLSearchParams(location.search).get('debug') === '1';
  } catch (e) {
    return false;
  }
})();
