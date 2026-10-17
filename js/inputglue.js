/**
 * inputglue.js — connects input.js/help.js/audio.js to the game: start button, item/N2O key edges, mute and
 * auto-accelerate buttons. init0/1/2 are called by main.js at fixed points during startup.
 * Split out of main.js; shared state comes from state.js (S, ctx).
 */
import { isHelpOpen, maybeShopTutorial, initHelp } from './help.js';
import { initAudio, suspendAudio, isMuted, onMuteChange, setMuted } from './audio.js';
import { LS } from './store.js';
import { initInput } from './input.js';
import { flash } from './hud.js';
import { S, ctx } from './state.js';
import { $ } from './util.js';

let pressEdge, unlock, muteBtn, showMute, SCROLLABLE, autoBtn, showAuto;
function startGame() {
  initAudio();
  if (S.GMODE === 'shop' && S.state === 'title' && S.MODE === 'solo' && LS.get('cartTutShop') !== '1') {
    maybeShopTutorial(startGame);
    return;
  }
  $('title').classList.add('hidden');
  if ((S.state === 'title' || S.state === 'lobby') && S.MODE === 'solo') ctx.startRaceMP(ctx.SOLO_SLOTS(), 0, 'solo');
}
export function init0() {
  pressEdge = k => {
    if (k === 'Space') S.player.useN2O = true;
    if (k === 'KeyE' || k === 'ControlLeft' || k === 'ControlRight' || k === 'Item') S.player.useItem = true;
  };
  addEventListener('keydown', e => {
    if (e.code === 'KeyR' && S.MODE === 'solo' && !e.target.closest?.('input,select') && !isHelpOpen()) location.reload();
  });
  $('restart').onclick = () => location.reload();
  $('startBtn').addEventListener('click', startGame);
  $('quality').value = ctx.QUALITY;
  $('quality').addEventListener('change', e => {
    LS.set('cartQuality', e.target.value);
    location.reload();
  });
  $('quality').addEventListener('keydown', e => e.stopPropagation());
  addEventListener('keydown', e => {
    if (S.state === 'title' && !$('title').classList.contains('hidden') && (e.code === 'Enter' || e.code === 'Space')) startGame();
  });
  unlock = () => initAudio();
  ['pointerdown', 'keydown', 'touchstart', 'touchend', 'click'].forEach(ev => addEventListener(ev, unlock, { passive: true }));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) suspendAudio();
    else {
      initAudio();
      S.last = performance.now();
    }
  });
  muteBtn = $('mute');
  showMute = m => (muteBtn.textContent = m ? '🔇' : '🔊');
  showMute(isMuted());
  onMuteChange(showMute);
  muteBtn.addEventListener('pointerdown', e => {
    e.stopPropagation();
    initAudio();
    setMuted(!isMuted());
  });
  addEventListener('keydown', e => {
    if (e.code === 'KeyM' && !e.repeat) setMuted(!isMuted());
  });
}
export function init1() {
  if (ctx.IS_TOUCH) document.body.classList.add('touch');
  initInput({ pressEdge, touch: ctx.IS_TOUCH });
  SCROLLABLE = '#title,#mp,#charSel,#garage,#finish,.scrolly';
  ['touchmove', 'gesturestart', 'dblclick'].forEach(ev =>
    document.addEventListener(
      ev,
      e => {
        const t = e.target;
        if (t.closest?.('button') && ev !== 'touchmove') return;
        if (t.closest?.(SCROLLABLE)) return;
        e.preventDefault();
      },
      { passive: false },
    ),
  );
}
export function init2() {
  autoBtn = $('auto');
  showAuto = () => (autoBtn.textContent = S.autoAccel ? '자동가속 ON' : '자동가속 OFF');
  showAuto();
  autoBtn.addEventListener('pointerdown', e => {
    e.stopPropagation();
    S.autoAccel = !S.autoAccel;
    LS.set('cartAuto', S.autoAccel ? '1' : '0');
    showAuto();
  });
  addEventListener('keydown', e => {
    if (e.code === 'KeyT' && !e.repeat && !e.target.closest?.('input,select')) autoBtn.dispatchEvent(new PointerEvent('pointerdown'));
  });
  initHelp({
    isTouch: () => ctx.IS_TOUCH,
    getAuto: () => S.autoAccel,
    setAuto: v => {
      S.autoAccel = v;
      LS.set('cartAuto', v ? '1' : '0');
      showAuto();
    },
    pause: on => {
      S.paused = on && S.MODE === 'solo';
      if (!on) S.last = performance.now();
    },
    flash: t => flash(t),
  });
}
export { startGame };
