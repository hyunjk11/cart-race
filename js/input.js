// Keyboard (with remapping) + touch controls (slide-to-steer D-pad or floating joystick)
import { LS } from './store.js';
export const keys = {};
export const analog = { steer: 0, active: false }; // joystick steering, -1 (right) .. 1 (left) like the key steer sign
// action id, label, canonical code the game logic reads, default codes
export const ACTIONS = [
  ['up', '가속 / 힘껏 밀기', 'ArrowUp', ['ArrowUp', 'KeyW']],
  ['down', '브레이크 / 후진', 'ArrowDown', ['ArrowDown', 'KeyS']],
  ['left', '왼쪽 조향', 'ArrowLeft', ['ArrowLeft', 'KeyA']],
  ['right', '오른쪽 조향', 'ArrowRight', ['ArrowRight', 'KeyD']],
  ['drift', '드리프트', 'ShiftLeft', ['ShiftLeft', 'ShiftRight']],
  ['boost', 'N2O 부스트', 'Space', ['Space']],
  ['item', '아이템 / 줍기', 'KeyE', ['KeyE', 'ControlLeft', 'ControlRight']],
];
const DEFAULT_CODES = new Set(ACTIONS.flatMap(a => a[3]));
const RESERVED = ['KeyR', 'KeyM', 'KeyT', 'Enter', 'Escape', 'Tab', 'F1', 'Slash'];
let binds = {};
function loadBinds() {
  let saved = {};
  try {
    saved = JSON.parse(LS.get('cartKeys', '{}')) || {};
  } catch (e) {
    saved = {};
  }
  binds = {};
  for (const [id, , , def] of ACTIONS) binds[id] = Array.isArray(saved[id]) && saved[id].length ? saved[id].slice(0, 3) : def.slice();
}
loadBinds();
let codeMap = new Map();
function rebuild() {
  codeMap = new Map();
  for (const [id, , canon] of ACTIONS) for (const c of binds[id]) if (!codeMap.has(c)) codeMap.set(c, canon);
}
rebuild();
export const getBinds = () => binds;
export function setBind(id, code) {
  // replace the first key of an action; steals the key from any other action
  if (RESERVED.includes(code)) return false;
  for (const k in binds) binds[k] = binds[k].filter(c => c !== code);
  binds[id] = [code, ...binds[id].slice(1).filter(c => c !== code)].slice(0, 3); // replaces the primary key
  for (const [aid, , , def] of ACTIONS)
    if (!binds[aid].length) binds[aid] = def.filter(c => !Object.values(binds).flat().includes(c)).slice(0, 1);
  LS.set('cartKeys', JSON.stringify(binds));
  rebuild();
  return true;
}
export function resetBinds() {
  LS.set('cartKeys', '{}');
  loadBinds();
  rebuild();
}
export const keyName = c =>
  ({
    ArrowUp: '↑',
    ArrowDown: '↓',
    ArrowLeft: '←',
    ArrowRight: '→',
    Space: '스페이스',
    ShiftLeft: '왼쪽 Shift',
    ShiftRight: '오른쪽 Shift',
    ControlLeft: '왼쪽 Ctrl',
    ControlRight: '오른쪽 Ctrl',
    AltLeft: 'Alt',
    Backspace: '⌫',
    Enter: 'Enter',
  })[c] ||
  c
    .replace(/^Key/, '')
    .replace(/^Digit/, '')
    .replace(/^Numpad/, '숫자패드 ');
export const actionKeys = id => (binds[id] || []).map(keyName).join(' / ');
const held = new Map(); // canonical -> Set of physical codes / pointer sources
function press(canon, src, on) {
  let s = held.get(canon);
  if (!s) held.set(canon, (s = new Set()));
  if (on) s.add(src);
  else s.delete(src);
  keys[canon] = s.size > 0;
}
let capture = null; // settings UI waiting for a key
export function captureNextKey(cb) {
  capture = cb;
}
export function initInput({ pressEdge, touch }) {
  addEventListener('keydown', e => {
    if (capture) {
      e.preventDefault();
      const cb = capture;
      capture = null;
      cb(e.code);
      return;
    }
    if (e.target.closest?.('input,select,textarea')) return;
    const canon = codeMap.get(e.code);
    if (canon) {
      if (!e.repeat) pressEdge(canon);
      press(canon, e.code, true);
    } else if (!DEFAULT_CODES.has(e.code)) keys[e.code] = true; // an unbound default key does nothing
    if (e.code.startsWith('Arrow') || e.code === 'Space' || canon) e.preventDefault();
  });
  addEventListener('keyup', e => {
    const canon = codeMap.get(e.code);
    if (canon) press(canon, e.code, false);
    else if (!DEFAULT_CODES.has(e.code)) keys[e.code] = false;
  });
  addEventListener('blur', () => {
    for (const k of Object.keys(keys)) keys[k] = false;
    held.clear();
  });
  if (touch) setupTouch(pressEdge);
}
// ---------- touch ----------
export const steerMode = () => LS.get('cartSteer', 'dpad'); // 'dpad' (slide between buttons) | 'stick' (floating joystick)
function setupTouch(pressEdge) {
  const T = document.getElementById('touch');
  // right-hand action buttons: one finger each
  T.querySelectorAll('.tr [data-key]').forEach(b => {
    const k = b.dataset.key,
      on = e => {
        e.preventDefault();
        pressEdge(k);
        press(k, 'p' + e.pointerId, true);
        b.classList.add('on');
      },
      off = e => {
        press(k, 'p' + e.pointerId, false);
        b.classList.remove('on');
      };
    b.addEventListener('pointerdown', e => {
      b.setPointerCapture?.(e.pointerId);
      on(e);
    });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(ev => b.addEventListener(ev, off));
  });
  // D-pad: the pad captures each finger and maps its position to directions, so a finger can slide ◀ ↔ ▶ (and ▼+◀ for drift)
  const pad = T.querySelector('.dpad'),
    btn = {};
  pad.querySelectorAll('[data-key]').forEach(b => (btn[b.dataset.key] = b));
  const fingers = new Map();
  const dirsAt = (x, y) => {
    const r = pad.getBoundingClientRect(),
      cx = r.left + r.width / 2,
      cy = r.top + r.height / 2,
      dx = (x - cx) / (r.width / 2),
      dy = (y - cy) / (r.height / 2),
      out = [];
    if (Math.hypot(dx, dy) < 0.2) return out;
    if (dx < -0.3) out.push('ArrowLeft');
    else if (dx > 0.3) out.push('ArrowRight');
    if (dy > 0.38 && Math.abs(dx) < 1.05) out.push('ArrowDown');
    else if (dy < -0.38 && Math.abs(dx) < 0.55) out.push('ArrowUp');
    return out;
  };
  const sync = () => {
    const on = new Set();
    for (const d of fingers.values()) d.forEach(k => on.add(k));
    for (const k of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']) {
      const was = keys[k];
      press(k, 'pad', on.has(k));
      if (on.has(k) && !was) pressEdge(k);
      btn[k]?.classList.toggle('on', on.has(k));
    }
  };
  pad.addEventListener('pointerdown', e => {
    if (steerMode() !== 'dpad') return;
    e.preventDefault();
    pad.setPointerCapture?.(e.pointerId);
    fingers.set(e.pointerId, dirsAt(e.clientX, e.clientY));
    sync();
  });
  pad.addEventListener('pointermove', e => {
    if (!fingers.has(e.pointerId)) return;
    fingers.set(e.pointerId, dirsAt(e.clientX, e.clientY));
    sync();
  });
  const up = e => {
    if (fingers.delete(e.pointerId)) sync();
  };
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(ev => pad.addEventListener(ev, up));
  // joystick: touch anywhere on the left half (outside buttons/HUD); horizontal = analog steering, up = push, down = brake
  const stick = document.createElement('div');
  stick.id = 'stick';
  stick.innerHTML = '<i></i>';
  stick.setAttribute('aria-hidden', 'true');
  T.appendChild(stick);
  const knob = stick.firstChild;
  let sid = null,
    sx = 0,
    sy = 0;
  const R = 56;
  const zone = document.createElement('div');
  zone.id = 'stickZone';
  T.appendChild(zone);
  zone.addEventListener('pointerdown', e => {
    if (steerMode() !== 'stick' || sid !== null) return;
    e.preventDefault();
    sid = e.pointerId;
    zone.setPointerCapture?.(sid);
    sx = e.clientX;
    sy = e.clientY;
    stick.style.left = sx + 'px';
    stick.style.top = sy + 'px';
    stick.classList.add('on');
    knob.style.transform = '';
    analog.active = true;
  });
  zone.addEventListener('pointermove', e => {
    if (e.pointerId !== sid) return;
    let dx = e.clientX - sx,
      dy = e.clientY - sy;
    const d = Math.hypot(dx, dy);
    if (d > R) {
      dx *= R / d;
      dy *= R / d;
    }
    knob.style.transform = `translate(${dx}px,${dy}px)`;
    const nx = dx / R;
    analog.steer = Math.abs(nx) < 0.12 ? 0 : -Math.sign(nx) * Math.min(1, (Math.abs(nx) - 0.12) / 0.7);
    const wasDown = keys.ArrowDown;
    press('ArrowUp', 'stick', dy / R < -0.55);
    press('ArrowDown', 'stick', dy / R > 0.55);
    if (keys.ArrowDown && !wasDown) pressEdge('ArrowDown');
  });
  const end = e => {
    if (e.pointerId !== sid) return;
    sid = null;
    stick.classList.remove('on');
    analog.steer = 0;
    analog.active = false;
    press('ArrowUp', 'stick', false);
    press('ArrowDown', 'stick', false);
  };
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(ev => zone.addEventListener(ev, end));
  applySteerMode();
}
export function applySteerMode() {
  document.body.classList.toggle('stickmode', steerMode() === 'stick');
}
