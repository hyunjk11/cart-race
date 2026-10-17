// split out of main.js (no behavior change): shared main.js state is reached through G (getters/setters)
import { isHelpOpen, maybeShopTutorial, initHelp } from './help.js';
import { initAudio, suspendAudio, isMuted, onMuteChange, setMuted } from './audio.js';
import { LS } from './store.js';
import { initInput } from './input.js';
import { flash } from './hud.js';
let G = null; export const bind = g => { G = g; };
let pressEdge, unlock, muteBtn, showMute, SCROLLABLE, autoBtn, showAuto;
function startGame() { initAudio(); if (G.GMODE === 'shop' && G.state === 'title' && G.MODE === 'solo' && LS.get('cartTutShop') !== '1') { maybeShopTutorial(startGame); return; } G.$('title').classList.add('hidden'); if ((G.state === 'title' || G.state === 'lobby') && G.MODE === 'solo') G.startRaceMP(G.SOLO_SLOTS(), 0, 'solo'); }
export function init0() {
  pressEdge = k => { if (k === 'Space') G.player.useN2O = true; if (k === 'KeyE' || k === 'ControlLeft' || k === 'ControlRight' || k === 'Item') G.player.useItem = true; };
  addEventListener('keydown', e => { if (e.code === 'KeyR' && G.MODE === 'solo' && !e.target.closest?.('input,select') && !isHelpOpen()) location.reload(); });
  G.$('restart').onclick = () => location.reload();
  G.$('startBtn').addEventListener('click', startGame);
  G.$('quality').value = G.QUALITY;
  G.$('quality').addEventListener('change', e => { LS.set('cartQuality', e.target.value); location.reload(); });
  G.$('quality').addEventListener('keydown', e => e.stopPropagation());
  addEventListener('keydown', e => { if (G.state === 'title' && !G.$('title').classList.contains('hidden') && (e.code === 'Enter' || e.code === 'Space')) startGame(); });
  unlock = () => initAudio();
  ['pointerdown', 'keydown', 'touchstart', 'touchend', 'click'].forEach(ev => addEventListener(ev, unlock, { passive: true }));
  document.addEventListener('visibilitychange', () => { if (document.hidden) suspendAudio(); else { initAudio(); G.last = performance.now(); } });
  muteBtn = G.$('mute');
  showMute = m => muteBtn.textContent = m ? '🔇' : '🔊';
  showMute(isMuted());
  onMuteChange(showMute);
  muteBtn.addEventListener('pointerdown', e => { e.stopPropagation(); initAudio(); setMuted(!isMuted()); });
  addEventListener('keydown', e => { if (e.code === 'KeyM' && !e.repeat) setMuted(!isMuted()); });
}
export function init1() {
  if (G.IS_TOUCH) document.body.classList.add('touch');
  initInput({ pressEdge, touch: G.IS_TOUCH });
  SCROLLABLE = '#title,#mp,#charSel,#finish,.scrolly';
  ['touchmove', 'gesturestart', 'dblclick'].forEach(ev => document.addEventListener(ev, e => { const t = e.target; if (t.closest?.('button') && ev !== 'touchmove') return; if (t.closest?.(SCROLLABLE)) return; e.preventDefault(); }, { passive: false }));
}
export function init2() {
  autoBtn = G.$('auto');
  showAuto = () => autoBtn.textContent = G.autoAccel ? '자동가속 ON' : '자동가속 OFF';
  showAuto();
  autoBtn.addEventListener('pointerdown', e => { e.stopPropagation(); G.autoAccel = !G.autoAccel; LS.set('cartAuto', G.autoAccel ? '1' : '0'); showAuto(); });
  addEventListener('keydown', e => { if (e.code === 'KeyT' && !e.repeat && !e.target.closest?.('input,select')) autoBtn.dispatchEvent(new PointerEvent('pointerdown')); });
  initHelp({ isTouch: () => G.IS_TOUCH, getAuto: () => G.autoAccel, setAuto: v => { G.autoAccel = v; LS.set('cartAuto', v ? '1' : '0'); showAuto(); }, pause: on => { G.paused = on && G.MODE === 'solo'; if (!on) G.last = performance.now(); }, flash: t => flash(t) });
}
export { startGame };
