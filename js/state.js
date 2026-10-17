/**
 * state.js — state shared between main.js and the modules split out of it (hud, results, inputglue, netglue).
 *
 *  S   mutable session/race state. main.js and the split-out modules read and write these fields directly
 *      (e.g. S.state = 'race'). Fields whose initial value depends on other setup start as null and are
 *      assigned by main.js during startup.
 *  ctx long-lived objects and services owned by main.js (scene, camera, physics world, cart list, helpers
 *      such as loadMap/resetCart). main.js registers each one as soon as it exists; modules only read them.
 */
export const S = {
  autoAccel: null,
  cd: 3.99,
  cut: null,
  cutDone: null,
  firstFinT: 0,
  fun: null,
  GMODE: null,
  last: null,
  MODE: 'solo',
  mpDone: false,
  msgT: 0,
  MYCHAR: null,
  N: 0,
  netAcc: 0,
  paused: false,
  player: null,
  raceT: 0,
  shake: 0,
  shop: null,
  shopHudSig: '',
  snapN: 0,
  spec: null,
  specSig: '',
  standSig: '',
  state: 'title',
  TLIM: null,
};

/** Registered by main.js: CU_ST, IS_TOUCH, MAXP, PKINDS, QUALITY, SHOPON, SOLO_SLOTS, ang, bubbleLayer, bubbles, camPos, camera, carts, chaos, circlePush, customers, endCut, endSpectate, finishOrder, fmt, getBest, hopOut, loadMap, nRiders, nameTag, onOpts, optsNow, pMats, products, puff, pushOut, renderMaps, resetCart, retarget, ridePose, scene, showIntro, spawnProduct, specCart, specList, startCut, startRaceMP, startSpectate, stats, traffic, world */
export const ctx = {};
