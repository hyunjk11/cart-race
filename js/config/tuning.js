/**
 * config/tuning.js — gameplay tuning numbers (race length, cart driving model, bots, physics pools, walls).
 * Values are used unchanged by main.js / track.js; tweak here.
 */

/** Cart driving model (main.js updateCart). Speeds are multipliers on the cart's maxV unless noted. */
export const CART = {
  accel: 12, // throttle acceleration (m/s²) at standstill, fades to 0 at maxV
  boostAccel: 22, // acceleration while boosting
  drag: 0.6, // velocity decay per second
  steerRate: 2.4, // heading change (rad/s) at full steer, times character handling
  driftCharge: 0.2, // drift gauge gain per (slip × speed × s), times character drift stat
  n2oTime: 1.7, // seconds of boost per N2O
  boostSpeed: 1.45,
  autoPushSpeed: 1.1, // auto-accelerate "push" mode
  magnetSpeed: 1.15,
  riderSlow: 0.12, // speed/accel loss per customer riding in the cart
  walkwaySpeed: 1.35, // moving walkway, travelling with it
  escalatorSpeed: 0.9,
};
/** Intro fly-over length before the countdown (s); ?nointro sets 0. */
export const INTRO_S = 4.5;
/** Chance that a hit customer hops into the cart (?debug=1&scoop= overrides). */
export const SCOOP_P = 0.3;

/** Laps per race (race mode). */
export const LAPS = 3;
/** Cart collision radius vs customers/props (m). */
export const CART_R = 1.3;
/** Max spilled products alive in the physics pool. */
export const MAXP = 110;
/** Scale of a customer riding in a cart. */
export const RIDE_S = 0.8;
/** Bot difficulty: label, icon, bot base maxV, +random maxV, max catch-up boost, max slow-down when ahead. */
export const DIFFS = {
  easy: ['쉬움', '🐢', 15.0, 1.9, 0.01, 0.1],
  normal: ['보통', '🐰', 17, 2.5, 0.05, 0.05],
  hard: ['어려움', '🔥', 18.6, 2.0, 0.08, 0.02],
};
/** Wall strip thickness (SD) and height (SH) in m (track.js). */
export const SD = 1.6,
  SH = 3.2;
