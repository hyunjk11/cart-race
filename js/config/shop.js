/**
 * config/shop.js — 장보기 (shopping) mode tables: goods (name, icon, price, colour, big/fragile flags), which goods
 * each map stocks, scoring points, time limit (s), list length and pickup radii/speed.
 */
export const GOODS = [
  { id: 'tofu', n: '두부', i: '🧈', p: 1500, c: 0xfff8e1 },
  { id: 'milk', n: '우유', i: '🥛', p: 2500, c: 0xffffff },
  { id: 'melon', n: '수박', i: '🍉', p: 15000, c: 0x43a047, big: 1 },
  { id: 'ramen', n: '라면', i: '🍜', p: 4500, c: 0xe53935 },
  { id: 'egg', n: '계란', i: '🥚', p: 6000, c: 0xffe0b2, fragile: 1 },
  { id: 'apple', n: '사과', i: '🍎', p: 5000, c: 0xd32f2f },
  { id: 'kimchi', n: '김치', i: '🥬', p: 8000, c: 0x7cb342 },
  { id: 'bread', n: '식빵', i: '🍞', p: 3000, c: 0xd7a35b },
  { id: 'ice', n: '아이스크림', i: '🍦', p: 2000, c: 0xf8bbd0 },
  { id: 'mandu', n: '냉동만두', i: '🥟', p: 7000, c: 0xeeeeee },
  { id: 'fish', n: '생선', i: '🐟', p: 9000, c: 0x90caf9 },
  { id: 'cheese', n: '치즈', i: '🧀', p: 4000, c: 0xffca28 },
  { id: 'water', n: '생수', i: '💧', p: 1000, c: 0x4fc3f7 },
  { id: 'tissue', n: '휴지', i: '🧻', p: 6500, c: 0xfafafa, big: 1 },
  { id: 'cola', n: '콜라', i: '🥤', p: 2000, c: 0xc62828 },
  { id: 'washer', n: '워셔액', i: '🧴', p: 3500, c: 0x29b6f6 },
  { id: 'shirt', n: '티셔츠', i: '👕', p: 12000, c: 0x42a5f5 },
  { id: 'shoes', n: '운동화', i: '👟', p: 39000, c: 0xff7043 },
  { id: 'toy', n: '장난감', i: '🧸', p: 15000, c: 0xa1887f },
  { id: 'juice', n: '주스', i: '🧃', p: 1800, c: 0xffb300 },
];
export const MAP_GOODS = {
  mart: ['tofu', 'milk', 'melon', 'ramen', 'egg', 'apple', 'kimchi', 'bread'],
  freezer: ['ice', 'mandu', 'fish', 'milk', 'egg', 'tofu', 'cheese', 'kimchi'],
  parking: ['water', 'tissue', 'cola', 'ramen', 'egg', 'washer', 'melon', 'bread'],
  skywalk: ['shirt', 'shoes', 'toy', 'juice', 'egg', 'cheese', 'cola', 'bread'],
};
export const PTS = { item: 200, sale: 150, wrong: -100, broken: -150, complete: 500, place: [800, 500, 300, 150], timeK: 3 };
export const T_LIMIT = 120,
  LIST_N = 5,
  GRAB_R = 2.1,
  KEY_R = 3.4,
  GRAB_V = 8.5;
