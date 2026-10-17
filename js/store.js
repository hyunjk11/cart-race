/**
 * store.js — Safe persistent storage (private-mode / disabled-storage browsers throw on access) + debug flag
 */
const mem = new Map();
export const LS = {
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
