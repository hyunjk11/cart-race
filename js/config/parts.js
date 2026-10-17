/**
 * config/parts.js — cart parts shop (차고): slots, parts, prices, stat tweaks; coin (🪙) reward rules.
 * Stat tweaks are fractions (0.02 = +2%) on the character's speed / handling / drift stats; the total per stat is clamped
 * to ±PART_STAT_CAP. Geometry for each part id is built in js/cartparts.js.
 */

/** Slot order = garage tab order. `def` is the free starter part everyone owns. */
export const SLOTS = [
  { id: 'wheel', name: '바퀴', icon: '🛞', def: 'basic' },
  { id: 'body', name: '바구니', icon: '🧺', def: 'wire' },
  { id: 'handle', name: '손잡이', icon: '🎮', def: 'basic' },
  { id: 'boost', name: '부스터', icon: '🚀', def: 'none' },
  { id: 'top', name: '장식', icon: '🎀', def: 'none' },
  { id: 'paint', name: '페인트', icon: '🎨', def: 'char' },
  { id: 'trail', name: '트레일', icon: '✨', def: 'basic' },
];

/** PARTS[slot] = [{ id, name, icon, price, desc, st: { spd, hdl, drf } }] */
export const PARTS = {
  wheel: [
    { id: 'basic', name: '기본 바퀴', icon: '⚫', price: 0, desc: '마트 기본 플라스틱 바퀴' },
    { id: 'offroad', name: '오프로드', icon: '🛻', price: 180, desc: '큼직한 깍두기 타이어. 접지력 업', st: { hdl: 0.03, spd: -0.01 } },
    { id: 'neon', name: '네온', icon: '💡', price: 240, desc: '빛나는 네온 링 휠 (외형)' },
    {
      id: 'slick',
      name: '레이싱 슬릭',
      icon: '🏎️',
      price: 320,
      desc: '넓적한 슬릭 타이어. 빠르지만 미끄러움',
      st: { spd: 0.02, hdl: -0.02 },
    },
  ],
  body: [
    { id: 'wire', name: '와이어', icon: '🛒', price: 0, desc: '튼튼한 철망 바구니' },
    { id: 'acrylic', name: '투명 아크릴', icon: '🧊', price: 220, desc: '속이 훤히 보이는 아크릴 (외형)' },
    { id: 'gold', name: '골드', icon: '👑', price: 600, desc: '번쩍번쩍 황금 바구니 (외형)' },
    { id: 'carbon', name: '카본', icon: '⬛', price: 450, desc: '가벼운 카본 패널. 속도 업, 드리프트 다운', st: { spd: 0.02, drf: -0.02 } },
  ],
  handle: [
    { id: 'basic', name: '기본 손잡이', icon: '➖', price: 0, desc: '평범한 손잡이 봉' },
    { id: 'bike', name: '자전거 핸들', icon: '🚲', price: 160, desc: '그립 달린 자전거 핸들. 핸들링 업', st: { hdl: 0.02, spd: -0.01 } },
    { id: 'wheel', name: '레이싱 휠', icon: '🏁', price: 300, desc: '레이싱 스티어링 휠. 드리프트 업', st: { drf: 0.03, hdl: -0.01 } },
  ],
  boost: [
    { id: 'none', name: '없음', icon: '⭕', price: 0, desc: '부스터 없음' },
    {
      id: 'rocket',
      name: '로켓 (주황 불꽃)',
      icon: '🚀',
      price: 350,
      desc: '등에 단 로켓. 부스트 때 불꽃!',
      st: { spd: 0.02, hdl: -0.02 },
    },
    { id: 'rocketb', name: '로켓 (파랑 불꽃)', icon: '🔵', price: 380, desc: '파란 불꽃 로켓', st: { spd: 0.02, hdl: -0.02 } },
    { id: 'double', name: '더블 배기', icon: '💨', price: 260, desc: '크롬 머플러 두 개. 드리프트 업', st: { drf: 0.02, spd: -0.01 } },
  ],
  top: [
    { id: 'none', name: '없음', icon: '⭕', price: 0, desc: '장식 없음' },
    { id: 'wing', name: '날개 스포일러', icon: '🪽', price: 280, desc: '레이싱 스포일러. 핸들링 업', st: { hdl: 0.02, spd: -0.01 } },
    { id: 'flag', name: '깃발', icon: '🚩', price: 100, desc: '펄럭이는 체크무늬 깃발 (외형)' },
    { id: 'cat', name: '고양이 귀', icon: '🐱', price: 150, desc: '바구니에 고양이 귀 (외형)' },
    { id: 'balloon', name: '풍선', icon: '🎈', price: 120, desc: '둥실둥실 하트 풍선 (외형)' },
  ],
  paint: [
    { id: 'char', name: '캐릭터 색', icon: '🌈', price: 0, desc: '캐릭터 고유 색' },
    { id: 'red', name: '레드 스트라이프', icon: '🟥', price: 120, desc: '빨간색 + 레이싱 줄무늬', col: 0xe53935, pat: 'stripe' },
    { id: 'blue', name: '블루 땡땡이', icon: '🟦', price: 120, desc: '파란색 + 물방울 무늬', col: 0x1e88e5, pat: 'dots' },
    { id: 'black', name: '블랙 불꽃', icon: '⬛', price: 200, desc: '검정 + 불꽃 데칼', col: 0x263238, pat: 'flame' },
    { id: 'mint', name: '민트 별빛', icon: '🟩', price: 160, desc: '민트 + 별 데칼', col: 0x26c6a6, pat: 'star' },
  ],
  trail: [
    { id: 'basic', name: '기본', icon: '💨', price: 0, desc: '기본 먼지 연기' },
    {
      id: 'rainbow',
      name: '무지개',
      icon: '🌈',
      price: 220,
      desc: '드리프트·부스트 때 무지개 트레일',
      cols: [0xff1744, 0xffa000, 0xffee58, 0x00e676, 0x2979ff, 0xd500f9],
    },
    { id: 'fire', name: '불꽃', icon: '🔥', price: 220, desc: '활활 불꽃 트레일', cols: [0xff3d00, 0xff9100, 0xffd600] },
    { id: 'star', name: '별', icon: '⭐', price: 260, desc: '반짝이는 별가루 트레일', cols: [0xfff59d, 0xffffff, 0x80d8ff] },
  ],
};

/** Max total stat tweak per stat from all parts (±5%). */
export const PART_STAT_CAP = 0.05;

/** Coin rewards after every race / shopping run (results.js). */
export const COINS = {
  place: [100, 70, 50, 35], // by finishing place (1st..4th); not finished = dnf
  dnf: 20,
  chaosPer: 100, // +1 coin per this many chaos points…
  chaosMax: 40, // …up to this
  driftPer: 3, // per drift combo (drift > 0.5 s)
  driftMax: 45,
  listPer: 8, // shopping mode: per list item collected
  listFull: 30, // whole list collected
  firstWin: 100, // first win of the day (local date)
  start: 0, // starting balance
};
