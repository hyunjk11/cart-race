/**
 * config/maps.js — map data. Each map is a rectilinear closed loop of vertices (travel order) with aisle half-width (hw),
 * corner radius (r), wall style, floor/theme colours, shelf product kinds, signs, displays, zones
 * (ice / moving walkway / speed bumps / escalator), optional elevation yAt(x, z) and an optional obstacle
 * generator obs(add, trackHelpers). track.js builds geometry and physics from this.
 */
import { clamp01 } from '../util.js';
export const MAPS = {
  mart: {
    name: '일반 매장',
    icon: '🛒',
    desc: '선반 사이를 달리는 기본 매장. 상품을 쏟고 손님을 피해라!',
    verts: [
      [-50, -30],
      [50, -30],
      [50, 30],
      [-50, 30],
    ],
    hw: 6,
    r: 8,
    wall: 'shelf',
    floor: ['#e8e4da', '#d4cfc2'],
    decor: 'aisles',
    theme: { bg: 0xbfd4e6, fog: [40, 110], hemi: 1.25, dl: 1.2, dl2: 0.5, light: 0xffffff, ceil: 6.5 },
    kinds: ['cereal', 'bottle', 'can', 'tp', 'egg'],
    spill: [0, 1, 2, 3, 4, 5, 6],
    signs: [
      [0.1, '과자·음료'],
      [0.3, '신선식품'],
      [0.55, '생활용품'],
      [0.8, '라면 대전'],
      [0.42, '오늘의 특가'],
      [0.68, '1+1 행사'],
      [0.93, '반값 할인'],
    ],
    displays: [
      { t: 'pyramid', f: 0.12 },
      { t: 'water', f: 0.24 },
      { t: 'pyramid', f: 0.36 },
      { t: 'stand', f: 0.6, label: '수박 특가' },
      { t: 'pyramid', f: 0.66 },
      { t: 'water', f: 0.84 },
      { t: 'stand', f: 0.9, label: '제철 과일', n: 3 },
    ],
    pyrLabel: '통조림 특가',
    zones: [],
  },
  freezer: {
    name: '냉동 코너',
    icon: '🧊',
    desc: '꽁꽁 언 바닥은 미끄럽고, 냉동고 문이 갑자기 열린다!',
    verts: [
      [-55, -30],
      [30, -30],
      [30, -6],
      [55, -6],
      [55, 30],
      [-12, 30],
      [-12, 10],
      [-55, 10],
    ],
    hw: 6,
    r: 6,
    wall: 'freezer',
    floor: ['#e6f2fb', '#d2e4f2'],
    theme: { bg: 0xd6ecfa, fog: [18, 75], fogCol: 0xe8f6ff, hemi: 1.15, dl: 0.9, dl2: 0.7, light: 0xd8f0ff, ceil: 6 },
    kinds: ['tub', 'pizza', 'icebag', 'dumpling', 'pop'],
    spill: [7, 8, 9, 2, 10],
    signs: [
      [0.08, '아이스크림'],
      [0.28, '냉동만두'],
      [0.5, '얼음·빙수'],
      [0.7, '냉동피자'],
      [0.88, '❄ 냉동식품 ❄'],
    ],
    displays: [
      { t: 'stand', f: 0.14, label: '아이스크림 1+1', fruit: 'tub' },
      { t: 'pyramid', f: 0.33 },
      { t: 'water', f: 0.56 },
      { t: 'stand', f: 0.8, label: '빙수 재료', fruit: 'tub', n: 3 },
    ],
    pyrLabel: '냉동 특가',
    waterCol: 0xe3f6ff,
    doors: true,
    zones: [
      { t: 'ice', x0: 0, x1: 22, z0: -36, z1: -24 },
      { t: 'ice', x0: 49, x1: 61, z0: 2, z1: 22 },
      { t: 'ice', x0: -46, x1: -20, z0: 4, z1: 16 },
      { t: 'ice', x0: -61, x1: -49, z0: -20, z1: 0 },
    ],
  },
  parking: {
    name: '지하 주차장',
    icon: '🅿️',
    desc: '넓은 코너, 기둥과 주차된 차, 과속방지턱, 경사로. 지나가는 차 조심!',
    verts: [
      [-60, -36],
      [60, -36],
      [60, 36],
      [-60, 36],
    ],
    hw: 10,
    r: 14,
    wall: 'wall',
    floor: ['#4b4f55', '#45494f'],
    theme: { bg: 0x2a2e35, fog: [25, 95], hemi: 0.95, dl: 0.55, dl2: 0.35, light: 0xe8f4ff, ceil: 5 },
    kinds: [],
    spill: [0, 1, 2, 3, 6],
    pyrLabel: '카트 보관소',
    waterCol: 0xbcaaa4,
    signs: [
      [0.1, 'B1 주차장'],
      [0.3, '출구 →'],
      [0.5, '마트 입구 ↑'],
      [0.72, '서행 10km'],
      [0.9, '카트 보관소'],
    ],
    displays: [
      { t: 'water', f: 0.22 },
      { t: 'pyramid', f: 0.58 },
      { t: 'water', f: 0.86 },
    ],
    yAt: (x, z) => (x > 48 ? 2.4 * clamp01(1 - Math.abs(z) / 18) : 0),
    ramps: [
      { x0: 48, x1: 72, z0: -18, z1: 0, y0: 0, y1: 2.4 },
      { x0: 48, x1: 72, z0: 0, z1: 18, y0: 2.4, y1: 0 },
    ],
    traffic: true,
    zones: [
      { t: 'bump', x0: 24.6, x1: 25.4, z0: -46, z1: -26 },
      { t: 'bump', x0: -0.4, x1: 0.4, z0: 26, z1: 46 },
      { t: 'bump', x0: -32.4, x1: -31.6, z0: 26, z1: 46 },
      { t: 'bump', x0: -70, x1: -50, z0: -0.4, z1: 0.4 },
    ],
    obs(add, { MAP, path, straightAt, atLane, HW, tangentAt }) {
      // pillars (slalom) and parked cars along the outer wall
      const out = -MAP.inSign;
      for (let i = 0, k = 0; i < path.length; i++) {
        if (i < 6 || i > path.length - 10 || !straightAt(i, 7)) continue;
        if (i % 11 === 0) {
          const p = atLane(i, (k++ % 2 ? 2.5 : -4.2) * out * -1);
          add({ x0: p.x - 0.7, x1: p.x + 0.7, z0: p.z - 0.7, z1: p.z + 0.7, kind: 'pillar' });
        } else if (i % 22 === 6) {
          const p = atLane(i, out * (HW - 1.25)),
            [tx] = tangentAt(i),
            ax = Math.abs(tx) > 0.5;
          add({
            x0: p.x - (ax ? 2.1 : 1),
            x1: p.x + (ax ? 2.1 : 1),
            z0: p.z - (ax ? 1 : 2.1),
            z1: p.z + (ax ? 1 : 2.1),
            kind: 'car',
            col: [0xd32f2f, 0x1976d2, 0xeeeeee, 0x424242, 0xfbc02d][i % 5],
          });
        }
      }
    },
  },
  skywalk: {
    name: '2층 무빙워크',
    icon: '🛗',
    desc: '무빙워크 경사로로 2층까지! 에스컬레이터 옆 지름길을 노려라.',
    verts: [
      [-50, -28],
      [50, -28],
      [50, 28],
      [14, 28],
      [14, 8],
      [-14, 8],
      [-14, 28],
      [-50, 28],
    ],
    hw: 6,
    r: 6,
    wall: 'rail',
    floor: ['#f3efe8', '#e4ddd2'],
    win: 42,
    theme: { bg: 0xf0e6da, fog: [45, 120], hemi: 1.3, dl: 1.1, dl2: 0.6, light: 0xfff6e0, ceil: 6.5 },
    kinds: [],
    spill: [0, 1, 2, 4, 5, 6],
    pyrLabel: '2층 특가',
    signs: [
      [0.08, '1F 식품관'],
      [0.27, '무빙워크 ↗'],
      [0.45, '2F 의류·잡화'],
      [0.6, '에스컬레이터 지름길 →'],
      [0.88, '1F로 내려가기 ↘'],
    ],
    displays: [
      { t: 'pyramid', f: 0.12 },
      { t: 'water', f: 0.42 },
      { t: 'stand', f: 0.76, label: '2층 과일가게' },
    ],
    yAt: (x, z) => (Math.abs(x) < 44 ? (z > 1 ? 4 : 0) : 4 * clamp01((z + 10) / 25)),
    decks: [
      { x0: -58, x1: 58, z0: 15, z1: 40, y: 4 },
      { x0: -44, x1: 44, z0: 1, z1: 15, y: 4 },
    ],
    ramps: [
      { x0: 44, x1: 58, z0: -10, z1: 15, y0: 0, y1: 4 },
      { x0: -58, x1: -44, z0: -10, z1: 15, y0: 0, y1: 4 },
    ],
    open: [{ x0: -9, x1: 9, z0: 23.9, z1: 32.1 }],
    camOpen: [{ x0: -16, x1: 16, z0: 22, z1: 34 }],
    extra: [
      { x0: -8, x1: 8, z0: 22.4, z1: 24, nx: 0, nz: 1, kind: 'rail' },
      { x0: -8, x1: 8, z0: 32, z1: 33.6, nx: 0, nz: -1, kind: 'rail' },
    ],
    zones: [
      { t: 'walk', x0: 47.5, x1: 52.5, z0: -10, z1: 15, dx: 0, dz: 1 },
      { t: 'walk', x0: -52.5, x1: -47.5, z0: -10, z1: 15, dx: 0, dz: -1 },
      { t: 'walk', x0: -10, x1: 10, z0: 6, z1: 10, dx: -1, dz: 0 },
      { t: 'esc', x0: -8, x1: 8, z0: 24, z1: 32, dx: -1, dz: 0 },
    ],
  },
};
