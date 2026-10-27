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

/**
 * 점장 (store manager) catch-up NPC (js/manager.js). He pops up on a scissor lift ahead of the race leader and throws
 * comic stuff at them. Distances in m, times in s. The bigger the leader's lead over 2nd, the more often / more throws.
 */
export const MANAGER = {
  on: true, // race mode only (not 장보기)
  firstDelay: 20, // earliest visit after the start
  cdMax: 28, // cooldown after a visit when the lead is just over minGap
  cdMin: 12, // cooldown when the lead is >= fullGap
  retry: 3, // re-check interval while the race is close
  minGap: 22, // leader must be this far ahead of 2nd before he cares (m)
  fullGap: 110, // lead at which he goes all-out (m)
  maxThrows: 3, // throws per visit at fullGap (1 at minGap)
  p2nd: 0.25, // chance a throw goes at 2nd place instead (3+ racers)
  ahead: 34, // appears this far ahead of the target (m), on top of the shelf line
  windup: 0.45, // arm swing before release
  flight: 1.35, // projectile air time — the warning circle shows for this long
  gap: 1.05, // time between throws
  lead: 0.85, // how much of the target's predicted motion he aims for (1 = perfect lead)
  aimErr: 1.3, // random aim error (m)
  hitR: 1.9, // impact radius (m); the warning circle is drawn this size
  aiSee: 0.45, // chance a bot notices a warning circle and steers around it
  liftH: 3.35, // standing height (top of the shelves)
  // hit effects
  slowMelon: 0.8, // maxV multiplier while carrying a watermelon
  melonT: 3.5,
  overlayT: 2.6, // screen stickers / tissue / splat on the player's screen
};
/** Back-of-pack help: slipstream behind a cart ahead + faster drift gauge the lower your position. */
export const CATCHUP = {
  draftMin: 2.2, // slipstream window behind the cart ahead (m)
  draftMax: 13,
  draftW: 1.7, // max sideways offset (m)
  draftMinV: 8, // both carts above this speed
  draftDelay: 0.35, // s in the window before it kicks in
  draftSpeed: 1.07, // maxV multiplier while drafting
  draftAccel: 3, // extra m/s² while drafting
  draftGauge: 0.22, // drift-gauge fill per second while drafting (1 = one N2O)
  rankGauge: 0.6, // drift gauge fills up to +60% faster in last place (0 for the leader)
  mpPartK: 0.5, // multiplayer: parts stat bonuses count at 50% (when the host turns them on)
};
