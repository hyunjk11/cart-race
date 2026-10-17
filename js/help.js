/**
 * help.js — '?' help & settings panel, first-race tips, 3-step shopping tutorial, reduced-motion preference
 */
import { LS } from './store.js';
import { ACTIONS, getBinds, setBind, resetBinds, keyName, actionKeys, captureNextKey, steerMode, applySteerMode } from './input.js';
import { $ } from './util.js';
const el = (tag, attrs = {}, html = '') => {
  const e = document.createElement(tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  e.innerHTML = html;
  return e;
};
let api = null,
  open = false;
// ---------- reduced motion ----------
const mq = matchMedia('(prefers-reduced-motion: reduce)');
const motionPref = () => LS.get('cartMotion', 'auto'); // auto | reduce | full
export const motionOK = () => {
  const p = motionPref();
  return p === 'full' ? true : p === 'reduce' ? false : !mq.matches;
};
const applyMotion = () => document.body.classList.toggle('reduce-motion', !motionOK());
mq.addEventListener?.('change', applyMotion);
// ---------- tips (first race) ----------
let seen = new Set();
try {
  seen = new Set(JSON.parse(LS.get('cartTips', '[]')));
} catch (e) {
  seen = new Set();
}
const saveSeen = () => LS.set('cartTips', JSON.stringify([...seen]));
const TIPS = [
  {
    id: 'go',
    when: s => s.raceT > 0.6,
    text: s =>
      s.touch
        ? steerMode() === 'stick'
          ? '🕹️ 자동으로 달려요! 왼쪽 화면을 누른 채 좌우로 밀어 조향 · 아래로 당기면 브레이크'
          : '📱 자동으로 달려요! ◀ ▶ 로 조향 (손가락을 미끄러뜨려도 OK) · ▼ 브레이크'
        : `⌨️ ${actionKeys('up')} 가속 · ${actionKeys('left')} / ${actionKeys('right')} 조향 · ${actionKeys('down')} 브레이크`,
  },
  {
    id: 'shopgrab',
    when: s => s.shop && s.raceT > 6,
    text: () => '🛒 빛나는 자리 위를 천천히 지나가면 목록 물건이 담겨요 · 할인 🏷️ 은 보너스!',
  },
  {
    id: 'drift',
    when: s => s.raceT > (s.shop ? 13 : 7),
    text: s =>
      s.touch
        ? '🌀 코너에서 드리프트 버튼(또는 ▼+방향)을 누르면 게이지가 차고 → N2O 획득!'
        : `🌀 코너에서 ${actionKeys('drift')} + 방향으로 드리프트 → 게이지가 차면 N2O 획득!`,
  },
  { id: 'n2o', when: s => s.n2o > 0, text: s => `🔥 N2O 충전! ${s.touch ? '부스트 버튼' : actionKeys('boost')}으로 터보 가속` },
  {
    id: 'item',
    when: s => s.item,
    text: s => `🎁 아이템 획득! ${s.touch ? '아이템 버튼' : actionKeys('item')}으로 사용 — 🍌🪣⚠️ 는 뒤에 떨어뜨려요`,
  },
  { id: 'rider', when: s => s.riders > 0, text: () => '🧍 손님이 카트에 탔어요! 한 명당 속도 -12% · 세게 부딪히면 내려요' },
];
let tipUntil = 0,
  tipCool = 0;
export function tutorialTick(s) {
  // called every frame with { state, raceT, touch, shop, n2o, item, riders }
  const now = Date.now(),
    tip = $('tip');
  if (!tip) return;
  if (tipUntil && now > tipUntil) {
    tip.classList.remove('show');
    tipUntil = 0;
    tipCool = now + 1200;
  }
  if (s.state !== 'race' || seen.has('*') || open || tipUntil || now < tipCool) return;
  const t = TIPS.find(t => !seen.has(t.id) && (t.id !== 'shopgrab' || s.shop) && t.when(s));
  if (!t) return;
  seen.add(t.id);
  saveSeen();
  $('tipText').textContent = t.text(s);
  tip.classList.add('show');
  tipUntil = now + 6000;
}
function hideTip() {
  tipUntil = 0;
  $('tip')?.classList.remove('show');
}
// ---------- shopping tutorial (3 steps) ----------
const SHOP_STEPS = [
  [
    '🧾',
    '1. 장보기 목록 확인',
    '왼쪽 위 <b>장보기 목록</b>에 살 물건 5개가 있어요. 미니맵의 <b style="color:#fdd835">노란 점</b>이 목록 물건 자리예요.',
  ],
  [
    '✨',
    '2. 천천히 지나가며 담기',
    '빛나는 자리 위를 <b>천천히</b> 지나가면 카트에 쏙! 급하면 <b>아이템 키</b>로 바로 집어요 (목록 외 물건은 감점). <b>🏷️ 할인</b> 자리는 보너스, <b>🥚 계란</b>은 부딪히면 깨져요.',
  ],
  [
    '🏁',
    '3. 계산대로 질주!',
    '목록을 다 채우면 <b>계산대(결승선)</b>를 통과해 계산 완료! 빨리 계산할수록 순위·시간 보너스가 커요. 상대에게 부딪히면 물건이 떨어질 수 있어요.',
  ],
];
export function maybeShopTutorial(then, force) {
  if (!force && LS.get('cartTutShop') === '1') {
    then?.();
    return false;
  }
  const m = $('shopTut');
  let i = 0;
  const show = () => {
    const [ic, h, p] = SHOP_STEPS[i];
    $('stIcon').textContent = ic;
    $('stTitle').textContent = h;
    $('stBody').innerHTML = p;
    $('stDots').innerHTML = SHOP_STEPS.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('');
    $('stNext').textContent = i < SHOP_STEPS.length - 1 ? '다음 ▶' : '시작! 🛒';
  };
  const done = () => {
    m.classList.add('hidden');
    LS.set('cartTutShop', '1');
    seen.add('shopgrab');
    saveSeen();
    then?.();
  };
  $('stNext').onclick = () => {
    if (++i >= SHOP_STEPS.length) done();
    else show();
  };
  $('stSkip').onclick = done;
  show();
  m.classList.remove('hidden');
  $('stNext').focus();
  return true;
}
// ---------- help & settings panel ----------
export const isHelpOpen = () => open;
function tabControls() {
  const touch = api.isTouch();
  const kb = ACTIONS.map(([id, label]) => `<tr><td>${label}</td><td><b>${actionKeys(id)}</b></td></tr>`).join('');
  return `${touch ? `<h4>📱 터치</h4><ul><li><b>자동 가속</b>이 기본이에요 (설정에서 끌 수 있어요)</li><li>${steerMode() === 'stick' ? '<b>조이스틱</b>: 왼쪽 화면을 누른 채 좌우로 밀어 조향, 위로 밀면 힘껏 밀기, 아래로 당기면 브레이크' : '<b>D-패드</b>: ◀ ▶ 조향 — 손가락을 떼지 않고 좌우로 미끄러뜨려도 돼요. ▼ 브레이크, ▼+방향 = 드리프트, ▲ 힘껏 밀기'}</li><li>오른쪽: <b>드리프트</b> · <b>부스트</b>(N2O) · <b>아이템</b></li></ul>` : ''}
  <h4>⌨️ 키보드</h4><table class="keys">${kb}<tr><td>자동 가속 켜기/끄기</td><td><b>T</b></td></tr><tr><td>소리</td><td><b>M</b></td></tr><tr><td>다시 시작 (혼자 하기)</td><td><b>R</b></td></tr><tr><td>도움말</td><td><b>? / F1</b></td></tr></table>`;
}
const TABS = {
  controls: ['🎮 조작', tabControls],
  race: [
    '🏁 레이스',
    () =>
      `<ul><li>마트를 <b>3바퀴</b> 먼저 도는 사람이 1등!</li><li><b>드리프트</b>로 코너를 돌면 게이지가 차고, 가득 차면 <b>N2O</b> 1개 (최대 2개). 드리프트를 풀 때 반대 방향을 누르면 <b>순간 부스트</b>!</li><li>손님을 치면 <b>카트에 타요</b> — 한 명당 속도 -12%. 세게 부딪히면 내려요.</li><li>선반·자동차·계산대에 부딪히면 느려지고 상품이 쏟아져요 (혼돈 지수 ↑).</li><li>무빙워크는 진행 방향이면 빨라지고 반대면 느려져요. 과속방지턱 주의!</li></ul>`,
  ],
  shop: [
    '🛒 장보기',
    () =>
      `<ol>${SHOP_STEPS.map(([ic, h, p]) => `<li><b>${ic} ${h.replace(/^\d\. /, '')}</b><br>${p}</li>`).join('')}</ol><p class="note">점수: 목록 물건 +200 · 할인 +150 · 목록 완료 +500 · 계산 순위 보너스 · 남은 시간 보너스 / 목록 외 -100 · 깨진 물건 -150</p><button id="hShopTut" class="sec">튜토리얼 다시 보기</button>`,
  ],
  items: [
    '🎁 아이템',
    () =>
      `<p>상자(🎁)를 지나가면 아이템을 얻어요. <b>뒤쪽 순위일수록 강한 아이템</b>이 잘 나와요.</p><table class="keys"><tr><td>🍌 바나나 껍질</td><td>뒤에 떨어뜨려 미끄러지게</td></tr><tr><td>🪣 물 양동이</td><td>미끄러운 물웅덩이</td></tr><tr><td>⚠️ 미끄럼 주의</td><td>부딪히면 감속</td></tr><tr><td>🛍️ 장바구니 미사일</td><td>앞 카트를 추적해 맞혀요</td></tr><tr><td>🛡️ 실드</td><td>한 번 막아줘요</td></tr><tr><td>🧲 자석</td><td>잠깐 빨라지고 앞 카트에 끌려가요</td></tr></table>`,
  ],
  settings: [
    '⚙️ 설정',
    () => {
      const b = getBinds(),
        mp = motionPref(),
        sm = steerMode();
      const q = $('quality')?.value || 'auto';
      return `<div class="srow"><span>화질 <small class="note">(바꾸면 새로고침)</small></span><span class="seg">${[
        ['auto', '자동'],
        ['low', '낮음'],
        ['high', '높음'],
      ]
        .map(([v, n]) => `<button data-q="${v}" class="${q === v ? 'on' : ''}">${n}</button>`)
        .join('')}</span></div>
    <div class="srow"><span>터치 조향</span><span class="seg"><button data-steer="dpad" class="${sm === 'dpad' ? 'on' : ''}">D-패드 (밀어서 조향)</button><button data-steer="stick" class="${sm === 'stick' ? 'on' : ''}">조이스틱</button></span></div>
    <div class="srow"><span>자동 가속</span><span class="seg"><button data-auto="1" class="${api.getAuto() ? 'on' : ''}">켜기</button><button data-auto="0" class="${api.getAuto() ? '' : 'on'}">끄기</button></span></div>
    <div class="srow"><span>화면 흔들림·번쩍임</span><span class="seg"><button data-motion="auto" class="${mp === 'auto' ? 'on' : ''}">시스템 설정</button><button data-motion="reduce" class="${mp === 'reduce' ? 'on' : ''}">줄이기</button><button data-motion="full" class="${mp === 'full' ? 'on' : ''}">모두 켜기</button></span></div>
    <h4>⌨️ 키 설정 <small>(버튼을 누르고 새 키 입력 · R/M/T/Enter/Esc 제외)</small></h4>
    <table class="keys">${ACTIONS.map(([id, label]) => `<tr><td>${label}</td><td><button class="kb" data-bind="${id}" aria-label="${label} 키 변경">${b[id].map(keyName).join(' / ')}</button></td></tr>`).join('')}</table>
    <div class="srow"><button id="hResetKeys" class="sec">키 기본값</button><button id="hResetTips" class="sec">튜토리얼 팁 다시 보기</button></div>`;
    },
  ],
};
let tab = 'controls';
function render() {
  $('helpTabs').innerHTML = Object.entries(TABS)
    .map(([k, [n]]) => `<button role="tab" aria-selected="${k === tab}" data-tab="${k}" class="${k === tab ? 'on' : ''}">${n}</button>`)
    .join('');
  $('helpBody').innerHTML = TABS[tab][1]();
}
function onClick(e) {
  const t = e.target.closest('button');
  if (!t) return;
  if (t.dataset.tab) {
    tab = t.dataset.tab;
    render();
    return;
  }
  if (t.dataset.q) {
    const q = $('quality');
    if (q && q.value !== t.dataset.q) {
      q.value = t.dataset.q;
      q.dispatchEvent(new Event('change'));
    }
    return;
  }
  if (t.dataset.steer) {
    LS.set('cartSteer', t.dataset.steer);
    applySteerMode();
    render();
    return;
  }
  if (t.dataset.auto) {
    api.setAuto(t.dataset.auto === '1');
    render();
    return;
  }
  if (t.dataset.motion) {
    LS.set('cartMotion', t.dataset.motion);
    applyMotion();
    render();
    return;
  }
  if (t.dataset.bind) {
    const id = t.dataset.bind;
    t.textContent = '새 키를 누르세요…';
    t.classList.add('wait');
    captureNextKey(code => {
      if (code !== 'Escape' && !setBind(id, code)) api.flash?.('그 키는 쓸 수 없어요');
      render();
    });
    return;
  }
  if (t.id === 'hResetKeys') {
    resetBinds();
    render();
    return;
  }
  if (t.id === 'hResetTips') {
    seen = new Set();
    saveSeen();
    LS.set('cartTutShop', '0');
    t.textContent = '✔ 다음 레이스에서 다시 보여요';
    return;
  }
  if (t.id === 'hShopTut') {
    closeHelp();
    maybeShopTutorial(null, true);
    return;
  }
}
function openHelp(which) {
  if (which) tab = which;
  open = true;
  render();
  $('help2').classList.remove('hidden');
  api.pause?.(true);
  hideTip();
  $('helpClose').focus();
}
function closeHelp() {
  open = false;
  $('help2').classList.add('hidden');
  api.pause?.(false);
}
export function initHelp(a) {
  api = a;
  applyMotion();
  document.body.append(
    el('button', { id: 'helpBtn', 'aria-label': '도움말과 설정', title: '도움말 · 설정 (?)' }, '?'),
    el(
      'div',
      { id: 'help2', class: 'hidden', role: 'dialog', 'aria-modal': 'true', 'aria-label': '도움말과 설정' },
      `<div class="panel hpanel scrolly"><div class="hhead"><h2>❓ 도움말 · 설정</h2><button id="helpClose" aria-label="닫기">✕</button></div><div id="helpTabs" role="tablist"></div><div id="helpBody"></div><div class="lbtns"><button id="helpOk">확인</button></div></div>`,
    ),
    el(
      'div',
      { id: 'tip', role: 'status', 'aria-live': 'polite' },
      `<span id="tipText"></span><button id="tipSkip" aria-label="튜토리얼 팁 모두 건너뛰기">팁 끄기</button>`,
    ),
    el(
      'div',
      { id: 'shopTut', class: 'hidden', role: 'dialog', 'aria-modal': 'true', 'aria-label': '장보기 모드 튜토리얼' },
      `<div class="panel stpanel"><div id="stIcon"></div><h2 id="stTitle"></h2><p id="stBody"></p><div id="stDots"></div><div class="lbtns"><button id="stSkip" class="sec">건너뛰기</button><button id="stNext">다음 ▶</button></div></div>`,
    ),
  );
  $('helpBtn').addEventListener('click', e => {
    e.stopPropagation();
    open ? closeHelp() : openHelp();
  });
  $('helpBtn').addEventListener('pointerdown', e => e.stopPropagation());
  $('tHelp')?.addEventListener('click', () => openHelp('controls'));
  $('tSet')?.addEventListener('click', () => openHelp('settings'));
  $('helpClose').onclick = closeHelp;
  $('helpOk').onclick = closeHelp;
  $('help2').addEventListener('click', e => {
    if (e.target.id === 'help2') closeHelp();
    else onClick(e);
  });
  $('tipSkip').onclick = e => {
    e.stopPropagation();
    seen.add('*');
    saveSeen();
    hideTip();
  };
  addEventListener('keydown', e => {
    if (e.target.closest?.('input,select,textarea')) return;
    if (open && e.code === 'Escape') {
      e.preventDefault();
      closeHelp();
    } else if (!open && (e.code === 'F1' || (e.code === 'Slash' && e.shiftKey))) {
      e.preventDefault();
      openHelp();
    }
  });
  setInterval(() => {
    const tip = $('tip');
    if (tipUntil && Date.now() > tipUntil + 500) {
      tip.classList.remove('show');
      tipUntil = 0;
    }
  }, 300); // watchdog
}
