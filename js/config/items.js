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

/** 점장 throwables (js/manager.js): icon, name, comic text + colour, effect, relative pick weight. */
export const MG_THROWS = {
  mop: { icon: '🧹', name: '대걸레', pow: '철퍼덕!', col: '#4fc3f7', fx: 'slip', w: 1 },
  fish: { icon: '🐟', name: '냉동 고등어', pow: '고등어 싸대기!', col: '#90caf9', fx: 'spin', w: 1 },
  chicken: { icon: '🐔', name: '고무닭', pow: '꽤애액!!', col: '#ffeb3b', fx: 'bonk', w: 1 },
  sticker: { icon: '🏷️', name: '가격표 스티커', pow: '철컥철컥! 특가!', col: '#ff7043', fx: 'sticker', w: 1 },
  melon: { icon: '🍉', name: '수박', pow: '수박 배달~!', col: '#66bb6a', fx: 'melon', w: 0.9 },
  tissue: { icon: '🧻', name: '휴지 롤', pow: '휴지 폭탄!', col: '#ffffff', fx: 'tissue', w: 1 },
};
/** What he yells through the megaphone ({n} = target's name). */
export const MG_LINES = {
  first: [
    '1등 손님! 매장에서 뛰지 마세요!!',
    '{n} 고객님~ 과속하시면 안 됩니다!!',
    '거기 1등! 카트는 천천히~!!',
    '매장 내 질주 금지! 이거나 받아라~!',
    '1등 손님, 오늘의 특가 상품 배달 갑니다~!',
    '삐빅! {n} 고객님 과속 단속입니다!!',
  ],
  second: ['2등 손님도 예외 없습니다~!', '{n} 고객님! 뛰지 마시라니까요!!'],
  miss: ['아이고 빗나갔네~', '다음엔 안 놓쳐요!', '어허, 피하시면 안 되죠~'],
  hit: ['명중~! 천천히 다니세요~', '고객님 감사합니다~ ㅎㅎ', '안전 운전 부탁드려요~!'],
  block: ['실드라니! 반칙이에요~!', '어라? 튕겼네?!'],
};
