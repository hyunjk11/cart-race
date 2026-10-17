/**
 * config/items.js — item table (icon + Korean name) and item-box odds by race position.
 * fun.js implements the items; itemOdds() blends W_FRONT (leader) -> W_BACK (last place).
 */
export const ITEMS = {
  banana: { icon: '🍌', name: '바나나 껍질' },
  puddle: { icon: '🪣', name: '물 양동이' },
  sign: { icon: '⚠️', name: '미끄럼 주의' },
  bag: { icon: '🛍️', name: '장바구니 미사일' },
  shield: { icon: '🛡️', name: '실드' },
  magnet: { icon: '🧲', name: '자석' },
};
// item odds by race position: leaders get mostly defensive/drop items, the back of the pack gets catch-up items
//                 banana puddle sign  bag  shield magnet
export const W_FRONT = [3, 2, 2, 0.6, 3, 0.4],
  W_BACK = [0.8, 0.8, 0.4, 3, 1, 3];
