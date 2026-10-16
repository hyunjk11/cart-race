// Racer roster: chibi characters (big head ~1:1.2 body), toon-shaded vertex-colored merged parts, inverted-hull outlines,
// shared glossy-eye face atlas (blink + expressions), per-character push/idle/win animations, cart decorations & voice lines.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// ---------- shared materials ----------
let _grad = null;
export function toonGrad() { if (_grad) return _grad; const d = new Uint8Array([90, 170, 255]); _grad = new THREE.DataTexture(d, 3, 1, THREE.RedFormat); _grad.minFilter = _grad.magFilter = THREE.NearestFilter; _grad.needsUpdate = true; return _grad; }
export const vcToon = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGrad() });
export const outlineMat = new THREE.MeshBasicMaterial({ color: 0x3b2433, side: THREE.BackSide });
const _c = new THREE.Color();
export function part(g, col, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0) {
  g.scale(sx, sy, sz); g.rotateX(rx); g.rotateY(ry); g.rotateZ(rz); g.translate(x, y, z);
  _c.setHex(col); const n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = _c.r; a[i * 3 + 1] = _c.g; a[i * 3 + 2] = _c.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
  return g;
}
export const merge = parts => { const m = mergeGeometries(parts.map(p => p.index ? p.toNonIndexed() : p), false); parts.forEach(p => p.dispose()); return m; };
const S = (r, ws = 16, hs = 12, ps = 0, pl = Math.PI * 2, ts = 0, tl = Math.PI) => new THREE.SphereGeometry(r, ws, hs, ps, pl, ts, tl);
const Cap = (r, l, s = 10) => new THREE.CapsuleGeometry(r, l, 4, s);
const Box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const Cone = (r, h, s = 8) => new THREE.ConeGeometry(r, h, s);
const Cyl = (a, b, h, s = 12) => new THREE.CylinderGeometry(a, b, h, s);
const Tor = (r, t, s = 16, arc = Math.PI * 2) => new THREE.TorusGeometry(r, t, 6, s, arc);

// ---------- face atlas: 9 frames ----------
export const FACE = { normal: 0, blink: 1, happy: 2, focus: 3, dizzy: 4, angry: 5, win: 6, shock: 7, sleepy: 8 };
const NF = 9;
let faceTex = null;
export function getFaceTex() {
  if (faceTex) return faceTex;
  const W = 160, H = 128, c = document.createElement('canvas'); c.width = W * NF; c.height = H; const g = c.getContext('2d');
  g.lineCap = 'round'; g.lineJoin = 'round'; const ink = '#2a1622';
  const eye = (x, y, sx = 1) => { // big glossy eye
    const gr = g.createLinearGradient(0, y - 22, 0, y + 22); gr.addColorStop(0, '#1b0f1a'); gr.addColorStop(0.55, '#4a2a3a'); gr.addColorStop(1, '#8a5a6e');
    g.fillStyle = gr; g.beginPath(); g.ellipse(x, y, 15 * sx, 21, 0, 0, 7); g.fill();
    g.fillStyle = '#fff'; g.beginPath(); g.ellipse(x + 5, y - 9, 6, 7, 0, 0, 7); g.fill(); g.beginPath(); g.arc(x - 6, y + 9, 3, 0, 7); g.fill();
    g.fillStyle = 'rgba(255,255,255,.35)'; g.beginPath(); g.ellipse(x, y + 12, 9, 4, 0, 0, 7); g.fill(); };
  const blush = ox => { g.fillStyle = 'rgba(255,110,140,0.5)'; for (const x of [ox + 24, ox + 136]) { g.beginPath(); g.ellipse(x, 86, 15, 9, 0, 0, 7); g.fill(); } };
  const smile = (ox, w = 10, y = 84) => { g.strokeStyle = ink; g.lineWidth = 5; g.beginPath(); g.arc(ox + 80, y - 4, w, 0.25, Math.PI - 0.25); g.stroke(); };
  for (let f = 0; f < NF; f++) {
    const ox = f * W, ex = [ox + 50, ox + 110], ey = 58; blush(ox); g.strokeStyle = g.fillStyle = ink; g.lineWidth = 6;
    if (f === 0) { ex.forEach(x => eye(x, ey)); g.fillStyle = ink; g.beginPath(); g.moveTo(ox + 74, 82); g.quadraticCurveTo(ox + 80, 90, ox + 86, 82); g.stroke(); }
    if (f === 1) { for (const x of ex) { g.beginPath(); g.arc(x, ey - 2, 14, 0.2, Math.PI - 0.2); g.stroke(); } smile(ox, 8); }
    if (f === 2) { for (const x of ex) { g.beginPath(); g.arc(x, ey + 8, 14, Math.PI + 0.25, -0.25); g.stroke(); } g.fillStyle = '#c2185b'; g.beginPath(); g.moveTo(ox + 64, 80); g.quadraticCurveTo(ox + 80, 104, ox + 96, 80); g.closePath(); g.fill(); g.fillStyle = '#ff8a9a'; g.beginPath(); g.ellipse(ox + 80, 92, 7, 4, 0, 0, 7); g.fill(); }
    if (f === 3) { ex.forEach(x => eye(x, ey + 4, 0.9)); g.strokeStyle = ink; g.lineWidth = 6; for (const [x, s] of [[ex[0], 1], [ex[1], -1]]) { g.beginPath(); g.moveTo(x - 16 * s, ey - 24); g.lineTo(x + 12 * s, ey - 16); g.stroke(); } g.beginPath(); g.moveTo(ox + 70, 88); g.lineTo(ox + 90, 86); g.stroke(); }
    if (f === 4) { for (const x of ex) { g.beginPath(); for (let a = 0; a < 13; a += 0.3) { const r = a * 1.25; g.lineTo(x + Math.cos(a) * r, ey + Math.sin(a) * r); } g.lineWidth = 4; g.stroke(); } g.lineWidth = 5; g.beginPath(); for (let k = 0; k <= 4; k++) g.lineTo(ox + 62 + k * 9, 90 + (k % 2 ? -6 : 6)); g.stroke(); }
    if (f === 5) { for (const [x, s] of [[ex[0], 1], [ex[1], -1]]) { g.beginPath(); g.moveTo(x - 18 * s, ey - 24); g.lineTo(x + 12 * s, ey - 10); g.stroke(); g.beginPath(); g.ellipse(x, ey + 4, 9, 11, 0, 0, 7); g.fill(); g.fillStyle = '#fff'; g.beginPath(); g.arc(x + 3, ey, 3, 0, 7); g.fill(); g.fillStyle = ink; }
      g.beginPath(); g.arc(ox + 80, 100, 12, Math.PI + 0.35, -0.35); g.stroke(); g.strokeStyle = '#e53935'; g.lineWidth = 5; const mx = ox + 138, my = 22; for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { g.beginPath(); g.moveTo(mx + a * 4, my + b * 4); g.lineTo(mx + a * 12, my + b * 4); g.moveTo(mx + a * 4, my + b * 4); g.lineTo(mx + a * 4, my + b * 12); g.stroke(); } }
    if (f === 6) { for (const x of ex) { g.fillStyle = '#ffc107'; g.beginPath(); for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, r = k % 2 ? 8 : 19; g.lineTo(x + Math.cos(a) * r, ey + Math.sin(a) * r); } g.closePath(); g.fill(); g.strokeStyle = '#e65100'; g.lineWidth = 3; g.stroke(); }
      g.fillStyle = '#c2185b'; g.beginPath(); g.arc(ox + 80, 82, 15, 0, Math.PI); g.fill(); }
    if (f === 7) { for (const x of ex) { g.fillStyle = '#fff'; g.beginPath(); g.arc(x, ey, 17, 0, 7); g.fill(); g.lineWidth = 3; g.strokeStyle = ink; g.stroke(); g.fillStyle = ink; g.beginPath(); g.arc(x, ey, 6, 0, 7); g.fill(); } g.beginPath(); g.ellipse(ox + 80, 92, 10, 13, 0, 0, 7); g.fill(); }
    if (f === 8) { for (const x of ex) { g.fillStyle = ink; g.beginPath(); g.ellipse(x, ey + 6, 15, 10, 0, 0, Math.PI); g.fill(); g.lineWidth = 5; g.beginPath(); g.moveTo(x - 16, ey + 4); g.lineTo(x + 16, ey + 4); g.stroke(); g.fillStyle = '#fff'; g.beginPath(); g.arc(x + 5, ey + 9, 2.5, 0, 7); g.fill(); }
      g.strokeStyle = ink; g.lineWidth = 4; g.beginPath(); g.ellipse(ox + 80, 88, 6, 7, 0, 0, 7); g.stroke(); }
  }
  faceTex = new THREE.CanvasTexture(c); faceTex.colorSpace = THREE.SRGBColorSpace; faceTex.repeat.set(1 / NF, 1); faceTex.anisotropy = 2; return faceTex;
}
// curved face patch on the front of the head sphere (uv 0..1 across the patch)
export function facePatch(r, sx = 1.05, sy = 0.95) { const g = new THREE.SphereGeometry(r, 20, 14, Math.PI / 2 - 0.82, 1.64, Math.PI / 2 - 0.62, 1.24); g.scale(sx, sy, 1); return g; }
export function faceMat() { const m = new THREE.MeshBasicMaterial({ map: getFaceTex().clone(), transparent: true, depthWrite: false }); m.map.needsUpdate = true; return m; }

// ---------- roster ----------
const L = (o) => o;
export const ROSTER = [
  { id: 'mango', name: '망고', emoji: '🥭', color: 0xffa726, title: '에너자이저 소녀', desc: '양갈래 번머리! 넘치는 에너지로 드리프트 게이지를 빨리 채워요.',
    st: { spd: 1.0, hdl: 1.02, drf: 1.1 }, pal: { skin: 0xffe0c8, hair: 0x6d3b1f, top: 0xffd54f, bottom: 0xff7043, shoe: 0xff5252, acc: 0xff1744 }, anim: 'bouncy', win: 'jump',
    lines: L({ start: ['가자가자~! 망고 출동!', '오늘도 신나게~!'], boost: ['망고 파워~!!', '슝슝~!'], drift: ['빙글빙글 신난다~', '꺄르르~!'], hit: ['으앗, 내 번머리!', '아야야!'], crash: ['앗 뜨거!', '꽈당!'], grab: ['찾았다 찾았다~!', '이거 맛있겠다!'], win: ['망고가 1등이다~!!', '야호~!'] }) },
  { id: 'dubu', name: '두부', emoji: '🐰', color: 0xf8bbd0, title: '졸린 토끼 소년', desc: '토끼 후드를 쓴 말랑 소년. 느긋하지만 핸들링이 부드러워요.',
    st: { spd: 0.97, hdl: 1.08, drf: 1.0 }, pal: { skin: 0xfff0e0, hair: 0xa1887f, top: 0xffffff, bottom: 0xf48fb1, shoe: 0xffffff, acc: 0xffc1d9 }, anim: 'sleepy', win: 'sleepy', sleepy: true,
    lines: L({ start: ['음냐… 벌써 출발이야?', '하암~ 갈게…'], boost: ['어… 빨라졌다…?', '우와… 바람…'], drift: ['우와아… 어지러…', '빙그르르…'], hit: ['아야… 졸려…', '으응…?'], crash: ['쿨…', '꿈인가…'], grab: ['이거… 맞지…?', '찾았다… 냠.'], win: ['이겼다… 이제 자도 돼?', '헤헤… 1등…'] }) },
  { id: 'halmi', name: '할미', emoji: '👵', color: 0xba68c8, title: '스피드광 할머니', desc: '뽀글 파마에 돋보기. 최고 속도는 빠르지만 핸들이 묵직해요.',
    st: { spd: 1.05, hdl: 0.94, drf: 0.97 }, pal: { skin: 0xf6d5bd, hair: 0xd1c4e9, top: 0x9575cd, bottom: 0x6d4c41, shoe: 0x5d4037, acc: 0x5d4037 }, anim: 'hunch', win: 'peace',
    lines: L({ start: ['할미 아직 안 죽었다!', '젊은이들, 따라와 봐~'], boost: ['비켜라 젊은이들~!', '할미 터보다!'], drift: ['라떼는 말이야~ 드리프트를~', '호호호~!'], hit: ['아이고 허리야!', '이놈들이!'], crash: ['아이고 내 카트!', '어머나!'], grab: ['이거 싸네!', '좋은 물건이구먼~'], win: ['할미가 최고지~ 호호', '손주들아 봤냐~!'] }) },
  { id: 'bujang', name: '김부장', emoji: '💼', color: 0x42a5f5, title: '정시 퇴근 직장인', desc: '넥타이와 서류가방. 모든 능력치가 반듯하게 평균이에요.',
    st: { spd: 1.02, hdl: 1.0, drf: 1.0 }, pal: { skin: 0xf1c9a5, hair: 0x212121, top: 0xffffff, bottom: 0x37474f, shoe: 0x212121, acc: 0x1565c0 }, anim: 'stiff', win: 'fist',
    lines: L({ start: ['업무 시작합니다.', '정시 퇴근 간다!'], boost: ['야근 모드 ON!', '결재 속도 UP!'], drift: ['회의는 짧게! 드리프트는 길게!', '보고 체계 무시!'], hit: ['보고서가!!', '이건 인사 고과 감점이야!'], crash: ['넥타이 꼬였다!', '아 출장비…'], grab: ['결재 완료!', '법카로 결제…'], win: ['이번 분기 실적 1위!', '칼퇴 성공!'] }) },
  { id: 'ppoppi', name: '뽀삐', emoji: '🦖', color: 0x66bb6a, title: '공룡 옷 꼬마', desc: '공룡 잠옷을 입은 꼬마. 작아서 핸들링이 아주 민첩해요.',
    st: { spd: 0.98, hdl: 1.07, drf: 1.03 }, pal: { skin: 0xffe3cf, hair: 0x5d4037, top: 0x66bb6a, bottom: 0x66bb6a, shoe: 0x43a047, acc: 0xc5e1a5 }, anim: 'waddle', win: 'roar', scale: 0.92,
    lines: L({ start: ['크아앙~!', '공룡 출동이다!'], boost: ['공룡 돌진!', '크앙크앙~!'], drift: ['빙글빙글 공룡~', '꼬리 회전!'], hit: ['으앙 엄마~', '아파 크앙…'], crash: ['쿵! 공룡도 아파!', '으앙!'], grab: ['맘마 찾았다!', '냠냠 크앙!'], win: ['뽀삐가 이겼다 크앙!', '공룡 최고!'] }) },
  { id: 'mint', name: '민트초코', emoji: '🍫', color: 0x4dd0c4, title: '쿨한 음악 소녀', desc: '선글라스와 헤드폰. 빠르고 드리프트도 깔끔하지만 살짝 예민해요.',
    st: { spd: 1.03, hdl: 0.97, drf: 1.04 }, pal: { skin: 0xffe0c8, hair: 0x4dd0c4, top: 0x5d4037, bottom: 0x212121, shoe: 0xffffff, acc: 0x212121 }, anim: 'nod', win: 'cool',
    lines: L({ start: ['…따라올 수 있으면 와봐.', '비트 시작.'], boost: ['비트 올린다.', '드롭!'], drift: ['이 정도는 기본.', '깔끔하지?'], hit: ['쳇.', '…짜증나.'], crash: ['내 헤드폰!', '…아웃.'], grab: ['민초는 진리.', '득템.'], win: ['당연한 결과지.', '앵콜은 없어.'] }) },
  { id: 'leo', name: '레오', emoji: '🐱', color: 0x7e57c2, title: '고양이 후드 게이머', desc: '고양이 귀 후드의 프로게이머. 드리프트 콤보 장인이에요.',
    st: { spd: 0.99, hdl: 1.03, drf: 1.08 }, pal: { skin: 0xffe6d5, hair: 0x37474f, top: 0x9fa8da, bottom: 0x283593, shoe: 0xffffff, acc: 0xff80ab }, anim: 'lean', win: 'spin',
    lines: L({ start: ['GG 각이다냥', '게임 스타트!'], boost: ['부스트 버프 ON!', '풀악셀이다냥!'], drift: ['드리프트 콤보!', '컨트롤 보소냥'], hit: ['렉 걸렸다!!', '핵이다냥!'], crash: ['핑 튀었다!', '버그다냥!'], grab: ['아이템 획득!', '레어템이다냥'], win: ['GG~ 이지냥', '랭킹 1위다냥!'] }) },
  { id: 'unni', name: '언니', emoji: '🧁', color: 0xff8fab, title: '파티시에 언니', desc: '키 큰 셰프 모자의 제빵사. 부드럽고 균형 잡힌 주행!',
    st: { spd: 1.0, hdl: 1.02, drf: 1.03 }, pal: { skin: 0xffe3d3, hair: 0x8d5a3b, top: 0xffffff, bottom: 0xff8fab, shoe: 0xff8fab, acc: 0xff4f8b }, anim: 'elegant', win: 'bow',
    lines: L({ start: ['오늘의 레시피는 1등!', '오븐 예열 완료~'], boost: ['반죽처럼 쭉쭉~', '휘핑 최고 속도!'], drift: ['휘핑~ 휘핑~', '크림처럼 부드럽게~'], hit: ['어머, 크림 다 쏟아져!', '내 케이크!'], crash: ['앗 밀가루!', '어머나!'], grab: ['신선한 재료 득템!', '이걸로 타르트를~'], win: ['달콤한 승리~♡', '오늘의 디저트는 승리!'] }) },
];
export const CHAR = Object.fromEntries(ROSTER.map(r => [r.id, r]));
export const charOf = id => CHAR[id] || ROSTER[0];
export const statBar = v => Math.max(1, Math.min(5, Math.round((v - 0.94) / 0.03) + 1));

// ---------- racer model ----------
export function makeRacer(def, opt = {}) {
  def = typeof def === 'string' ? charOf(def) : def; const P = def.pal, id = def.id, low = !!opt.low;
  const root = new THREE.Group(), bob = new THREE.Group(); root.add(bob);
  const bp = [part(Cap(0.25, 0.2, 12), P.top, 0, 0.66, 0)];
  // outfits
  if (id === 'mango') bp.push(part(Box(0.38, 0.3, 0.06), P.bottom, 0, 0.56, 0.22), part(Box(0.05, 0.25, 0.03), P.bottom, -0.13, 0.78, 0.22, 1, 1, 1, 0, 0, 0.1), part(Box(0.05, 0.25, 0.03), P.bottom, 0.13, 0.78, 0.22, 1, 1, 1, 0, 0, -0.1), part(S(0.03, 6, 4), 0xffeb3b, 0, 0.6, 0.26));
  if (id === 'dubu') bp.push(part(S(0.16, 10, 8), P.acc, 0, 0.58, 0.2, 1, 0.8, 0.4), part(S(0.1, 8, 6), 0xffffff, 0, 0.42, -0.26));
  if (id === 'halmi') bp.push(part(Cap(0.265, 0.14, 12), P.top, 0, 0.72, -0.01, 1.04, 1, 1.04), part(S(0.03, 6, 4), 0xfff59d, 0, 0.8, 0.27), part(S(0.03, 6, 4), 0xfff59d, 0, 0.68, 0.27), part(Cone(0.3, 0.3, 14), P.bottom, 0, 0.44, 0));
  if (id === 'bujang') bp.push(part(Box(0.08, 0.3, 0.04), P.acc, 0, 0.7, 0.245), part(Cone(0.055, 0.08, 4), P.acc, 0, 0.53, 0.25, 1, 1, 0.6, Math.PI), part(Box(0.24, 0.05, 0.05), 0xffffff, 0, 0.88, 0.2), part(Box(0.5, 0.12, 0.42), P.bottom, 0, 0.47, 0));
  if (id === 'ppoppi') { bp.push(part(S(0.19, 10, 8), P.acc, 0, 0.6, 0.17, 1, 1.1, 0.5), part(Cone(0.15, 0.55, 8), P.top, 0, 0.45, -0.38, 1, 1, 1, -1.9)); for (let k = 0; k < 3; k++) bp.push(part(Cone(0.06, 0.12, 4), 0x2e7d32, 0, 0.88 - k * 0.16, -0.25 - k * 0.02, 1, 1, 1, -0.5)); }
  if (id === 'mint') bp.push(part(Box(0.4, 0.06, 0.06), 0x4dd0c4, 0, 0.7, 0.22), part(Box(0.4, 0.06, 0.06), 0x4dd0c4, 0, 0.58, 0.22));
  if (id === 'leo') bp.push(part(Box(0.26, 0.12, 0.05), P.bottom, 0, 0.56, 0.23), part(Cap(0.05, 0.4, 6), P.top, 0.05, 0.5, -0.32, 1, 1, 1, -0.9, 0, 0.3), part(S(0.07, 6, 5), P.acc, 0, 0.72, 0.25));
  if (id === 'unni') bp.push(part(Box(0.36, 0.42, 0.04), 0xffffff, 0, 0.58, 0.24), part(Box(0.12, 0.08, 0.02), P.acc, 0, 0.62, 0.265), part(Cone(0.3, 0.28, 14), P.bottom, 0, 0.45, 0));
  const bodyG = merge(bp), body = new THREE.Mesh(bodyG, vcToon); bob.add(body);
  // head
  const headG = new THREE.Group(); headG.position.y = 1.22; bob.add(headG);
  const R = 0.5, hp = [part(S(R, 24, 18), P.skin, 0, 0, 0, 1.05, 0.95, 1)];
  const cap = (c, sc = 1.04, tl = 0.55, rx = -0.32, y = 0.02) => part(S(R * sc, 22, 12, 0, Math.PI * 2, 0, Math.PI * tl), c, 0, y, -0.02, 1.05, 1, 1, rx);
  const ear = (x, c, ci, h = 0.42) => [part(Cap(0.09, h, 8), c, x, 0.62, -0.06, 1, 1, 0.55, 0, 0, -x * 0.5), part(Cap(0.05, h * 0.8, 6), ci, x, 0.62, -0.02, 1, 1, 0.4, 0, 0, -x * 0.5)];
  if (id === 'mango') { hp.push(cap(P.hair), part(S(0.2, 12, 10), P.hair, -0.36, 0.38, -0.06), part(S(0.2, 12, 10), P.hair, 0.36, 0.38, -0.06), part(Tor(0.12, 0.035), P.acc, -0.3, 0.3, -0.04, 1, 1, 1, 0.9, 0, 0.6), part(Tor(0.12, 0.035), P.acc, 0.3, 0.3, -0.04, 1, 1, 1, 0.9, 0, -0.6));
    for (let k = -2; k <= 2; k++) hp.push(part(S(0.1, 8, 6), P.hair, k * 0.13, 0.33, 0.33, 1, 0.7, 0.6)); }
  if (id === 'dubu') { hp.push(part(S(R * 1.14, 22, 14, 0, Math.PI * 2, 0, Math.PI * 0.62), P.top, 0, 0.02, -0.05, 1.05, 1, 1, -0.55), part(Tor(0.48, 0.07, 20, Math.PI), P.top, 0, -0.02, 0.06, 1.1, 1.05, 1, 0, 0, 0), ...ear(-0.2, P.top, P.acc, 0.5), ...ear(0.2, P.top, P.acc, 0.5));
    for (let k = -1; k <= 1; k++) hp.push(part(S(0.09, 8, 6), P.hair, k * 0.13, 0.32, 0.36, 1, 0.6, 0.5)); }
  if (id === 'halmi') { for (let a = 0; a < 14; a++) { const th = a / 14 * Math.PI * 2, ring = a % 2; hp.push(part(S(0.15, 8, 6), P.hair, Math.cos(th) * (0.36 - ring * 0.1), 0.32 + ring * 0.1, Math.sin(th) * (0.34 - ring * 0.1) - 0.08)); }
    hp.push(part(S(0.17, 8, 6), P.hair, 0, 0.52, -0.06), part(Tor(0.11, 0.018, 14), 0x5d4037, -0.18, -0.02, 0.47), part(Tor(0.11, 0.018, 14), 0x5d4037, 0.18, -0.02, 0.47), part(Box(0.12, 0.02, 0.02), 0x5d4037, 0, 0.0, 0.5)); }
  if (id === 'bujang') { hp.push(cap(P.hair, 1.04, 0.5, -0.25), part(S(0.2, 10, 8), P.hair, -0.16, 0.36, 0.22, 1.3, 0.5, 0.8, 0, 0, 0.4), part(Box(0.02, 0.06, 0.2), 0xf1c9a5, 0.12, 0.43, 0.15)); }
  if (id === 'ppoppi') { hp.push(part(S(R * 1.16, 22, 14, 0, Math.PI * 2, 0, Math.PI * 0.6), P.top, 0, 0.03, -0.06, 1.05, 1, 1, -0.5));
    for (let k = 0; k < 5; k++) hp.push(part(Cone(0.08, 0.18, 4), 0x2e7d32, 0, 0.6 - k * 0.03, 0.18 - k * 0.15, 1, 1, 0.5, -0.4 + k * 0.25));
    for (let k = -3; k <= 3; k++) hp.push(part(Cone(0.035, 0.08, 4), 0xffffff, k * 0.09, 0.3 - Math.abs(k) * 0.03, 0.45 - Math.abs(k) * 0.02, 1, 1, 1, Math.PI)); }
  if (id === 'mint') { hp.push(cap(P.hair, 1.06, 0.6, -0.4), part(Box(0.24, 0.42, 0.2), P.hair, -0.4, -0.16, -0.02), part(Box(0.24, 0.42, 0.2), P.hair, 0.4, -0.16, -0.02), part(Tor(0.5, 0.04, 20, Math.PI), 0xffffff, 0, 0.12, 0, 1.05, 1, 1, 0, 0, 0),
      part(Cyl(0.13, 0.13, 0.1), 0x5d4037, -0.53, -0.02, 0, 1, 1, 1, 0, 0, Math.PI / 2), part(Cyl(0.13, 0.13, 0.1), 0x5d4037, 0.53, -0.02, 0, 1, 1, 1, 0, 0, Math.PI / 2),
      part(Box(0.24, 0.1, 0.04), P.acc, -0.15, 0.36, 0.33, 1, 1, 1, -0.5), part(Box(0.24, 0.1, 0.04), P.acc, 0.15, 0.36, 0.33, 1, 1, 1, -0.5), part(Box(0.08, 0.025, 0.03), P.acc, 0, 0.37, 0.34, 1, 1, 1, -0.5)); }
  if (id === 'leo') { hp.push(part(S(R * 1.14, 22, 14, 0, Math.PI * 2, 0, Math.PI * 0.62), P.top, 0, 0.02, -0.05, 1.05, 1, 1, -0.55), part(Cone(0.17, 0.3, 4), P.top, -0.3, 0.5, -0.02, 1, 1, 0.6, 0, 0, 0.35), part(Cone(0.17, 0.3, 4), P.top, 0.3, 0.5, -0.02, 1, 1, 0.6, 0, 0, -0.35),
      part(Cone(0.09, 0.17, 4), P.acc, -0.29, 0.5, 0.05, 1, 1, 0.4, 0, 0, 0.35), part(Cone(0.09, 0.17, 4), P.acc, 0.29, 0.5, 0.05, 1, 1, 0.4, 0, 0, -0.35));
    for (let k = -2; k <= 2; k++) hp.push(part(Cone(0.07, 0.2, 5), P.hair, k * 0.1, 0.33, 0.36, 1, 1, 0.6, Math.PI + 0.5)); }
  if (id === 'unni') { hp.push(cap(P.hair), part(Cyl(0.3, 0.27, 0.36, 16), 0xffffff, 0, 0.58, -0.04), part(S(0.22, 10, 8), 0xffffff, -0.15, 0.8, -0.04), part(S(0.24, 10, 8), 0xffffff, 0.12, 0.84, -0.04), part(S(0.2, 10, 8), 0xffffff, 0, 0.9, 0.08),
      part(Cap(0.08, 0.3, 6), P.hair, 0.44, -0.3, -0.1, 1, 1, 1, 0, 0, 0.2), part(S(0.05, 6, 5), P.acc, 0.47, -0.52, -0.1)); }
  const headGeo = merge(hp), head = new THREE.Mesh(headGeo, vcToon); headG.add(head);
  const fm = faceMat(), face = new THREE.Mesh(facePatch(R + 0.006), fm); face.position.y = -0.03; headG.add(face);
  if (!low) { const ob = new THREE.Mesh(bodyG, outlineMat); ob.scale.setScalar(1.06); ob.position.y = -0.04; bob.add(ob); const oh = new THREE.Mesh(headGeo, outlineMat); oh.scale.setScalar(1.045); headG.add(oh); }
  // limbs
  const arms = [], legs = [];
  for (const s of [-1, 1]) {
    const ap = new THREE.Group(); ap.position.set(s * 0.3, 0.84, 0.05); bob.add(ap);
    const ag = [part(Cap(0.085, 0.34, 8), P.top, 0, -0.24, 0), part(S(0.105, 10, 8), id === 'ppoppi' ? P.top : P.skin, 0, -0.5, 0), part(S(0.05, 6, 5), id === 'ppoppi' ? P.top : P.skin, 0.06, -0.5, 0.07)];
    if (id === 'unni' && s > 0) ag.push(part(Cyl(0.03, 0.03, 0.3, 6), 0xbcaaa4, 0, -0.56, 0.1, 1, 1, 1, 1.4), part(S(0.06, 6, 5), 0xffffff, 0, -0.58, 0.25));
    ap.add(new THREE.Mesh(merge(ag), vcToon)); arms.push(ap);
    const lp = new THREE.Group(); lp.position.set(s * 0.12, 0.42, 0); root.add(lp);
    lp.add(new THREE.Mesh(merge([part(Cap(0.085, 0.16, 8), P.bottom, 0, -0.17, 0), part(S(0.11, 10, 8), P.shoe, 0, -0.34, 0.05, 1, 0.65, 1.35)]), vcToon)); legs.push(lp);
  }
  const sc = def.scale || 1; root.scale.setScalar(sc);
  // face / blink
  let cur = -1, mood = 'normal', blinkT = 1 + Math.random() * 3, blinking = 0, t = 0;
  const setF = n => { const f = FACE[n] ?? 0; if (f !== cur) { cur = f; fm.map.offset.x = f / NF; } };
  const A = def.anim;
  const V = (a, i, spread, fwd) => a.rotation.set(fwd, 0, (i ? 1 : -1) * spread); // spread: 0 = down, π/2 = sideways, ~2.3 = raised V
  const api = { root, def, headG, arms, legs, bob,
    face(name) { mood = name; },
    tick(dt) { t += dt; blinkT -= dt; if (blinkT <= 0) { blinking = 0.13; blinkT = 2 + Math.random() * 3.5; } if (blinking > 0) blinking -= dt;
      const base = mood === 'normal' && def.sleepy ? 'sleepy' : mood; setF(blinking > 0 && (base === 'normal' || base === 'sleepy' || base === 'focus') ? 'blink' : base); },
    walk(ph, k = 1) { // per-character push gait
      const sw = Math.sin(ph), b = Math.abs(sw);
      const amp = { bouncy: [0.22, 1.0, 0.12], sleepy: [0.06, 0.6, 0.05], hunch: [0.08, 1.2, 0.04], stiff: [0.05, 0.7, 0.0], waddle: [0.1, 0.7, 0.22], nod: [0.08, 0.8, 0.05], lean: [0.1, 0.9, 0.06], elegant: [0.09, 0.75, 0.08] }[A] || [0.12, 0.8, 0.08];
      legs[0].rotation.x = sw * amp[1] * k; legs[1].rotation.x = -sw * amp[1] * k; bob.position.y = b * amp[0] * k;
      bob.scale.set(1 + (1 - b) * 0.05 * k, 1 - (1 - b) * 0.05 * k, 1); bob.rotation.z = A === 'waddle' ? sw * amp[2] * k : 0;
      bob.rotation.x = A === 'hunch' ? 0.28 : A === 'lean' ? 0.22 + 0.1 * k : A === 'stiff' ? 0.02 : 0.06 * k;
      headG.rotation.z = A === 'stiff' ? 0 : sw * amp[2] * k; headG.rotation.x = A === 'nod' ? Math.sin(ph * 2) * 0.12 : A === 'sleepy' ? 0.15 + Math.sin(ph * 0.5) * 0.08 : A === 'hunch' ? -0.2 : 0.05;
      arms.forEach((a, i) => a.rotation.set(-1.3 + Math.sin(ph * 2 + i) * 0.05 * k, 0, (i ? -1 : 1) * -0.12)); },
    idle(tt) { const br = Math.sin(tt * 2.2); legs[0].rotation.x = legs[1].rotation.x = 0; bob.position.y = Math.max(0, br) * 0.02; bob.scale.set(1 + br * 0.015, 1 - br * 0.015, 1); bob.rotation.set(A === 'hunch' ? 0.25 : 0, 0, A === 'waddle' ? Math.sin(tt * 3) * 0.08 : 0);
      headG.rotation.set(A === 'nod' ? Math.abs(Math.sin(tt * 4)) * 0.2 : A === 'sleepy' ? 0.2 : 0, A === 'lean' ? Math.sin(tt * 0.8) * 0.3 : 0, A === 'sleepy' ? Math.sin(tt * 0.7) * 0.25 : A === 'bouncy' ? Math.sin(tt * 5) * 0.1 : 0);
      if (A === 'bouncy') bob.position.y = Math.abs(Math.sin(tt * 5)) * 0.08;
      arms.forEach((a, i) => a.rotation.set(-1.3, 0, (i ? -1 : 1) * -0.12)); },
    cheer(tt, k = 1) { const j = Math.abs(Math.sin(tt * 8)); bob.position.y = j * 0.25 * k; bob.rotation.set(0, 0, 0); arms.forEach((a, i) => V(a, i, 2.3 + Math.sin(tt * 10 + i) * 0.3 * k, 0.35)); legs.forEach(l => l.rotation.x = 0); headG.rotation.set(0, 0, Math.sin(tt * 4) * 0.12); setF(k > 0.7 ? 'win' : 'happy'); mood = 'happy'; },
    win(tt) { // character-specific victory pose; arms always angled out/forward so they read beside the big head
      const W = def.win; legs.forEach(l => l.rotation.x = 0); bob.rotation.set(0, 0, 0); headG.rotation.set(0, 0, 0); bob.position.y = 0; setF('win'); mood = 'win';
      if (W === 'jump') { const j = Math.abs(Math.sin(tt * 7)); bob.position.y = j * 0.45; arms.forEach((a, i) => V(a, i, 2.2 + j * 0.35, 0.3)); legs[0].rotation.x = -j * 0.6; legs[1].rotation.x = j * 0.3; }
      else if (W === 'sleepy') { headG.rotation.z = Math.sin(tt * 1.5) * 0.25; V(arms[0], 0, 0.7, 0.3); V(arms[1], 1, 2.0 + Math.sin(tt * 4) * 0.4, 0.5); setF(Math.sin(tt * 0.9) > 0.6 ? 'sleepy' : 'happy'); }
      else if (W === 'peace') { bob.rotation.x = 0.1; V(arms[0], 0, 0.8, 0.2); V(arms[1], 1, 2.3 + Math.sin(tt * 6) * 0.1, 0.6); headG.rotation.z = 0.15 + Math.sin(tt * 3) * 0.05; bob.position.y = Math.abs(Math.sin(tt * 4)) * 0.05; }
      else if (W === 'fist') { const p = Math.sin(tt * 9); V(arms[0], 0, 0.6, 0.2); V(arms[1], 1, 2.2 + p * 0.35, 0.6); bob.position.y = Math.max(0, p) * 0.08; }
      else if (W === 'roar') { bob.rotation.x = -0.1; arms.forEach((a, i) => V(a, i, 1.4 + Math.sin(tt * 10) * 0.15, 0.9)); headG.rotation.x = -0.2; bob.position.y = Math.abs(Math.sin(tt * 3)) * 0.1; }
      else if (W === 'cool') { V(arms[0], 0, 1.0, 1.1); V(arms[1], 1, 2.3, 0.3); headG.rotation.x = Math.abs(Math.sin(tt * 4)) * 0.18; headG.rotation.z = -0.1; }
      else if (W === 'spin') { bob.rotation.y = tt * 6; arms.forEach((a, i) => V(a, i, 1.75, 0)); bob.position.y = 0.1; }
      else if (W === 'bow') { const b = (Math.sin(tt * 2) + 1) / 2; bob.rotation.x = b * 0.4; V(arms[0], 0, 0.9, 0.3); V(arms[1], 1, 2.0 + b * 0.4, 0.5); }
      else arms.forEach((a, i) => V(a, i, 2.4, 0.3)); },
    dispose() { bodyG.dispose(); headGeo.dispose(); face.geometry.dispose(); fm.map.dispose(); fm.dispose(); root.traverse(o => { if (o.isMesh && o.geometry !== bodyG && o.geometry !== headGeo && o !== face) o.geometry.dispose(); }); }
  };
  api.tick(0);
  return api;
}

// ---------- cart decorations (one merged mesh each, in cart-local space; basket floor y≈0.55, rim y≈1.3, handle z≈-0.95) ----------
export function makeDeco(id) {
  const p = [];
  if (id === 'mango') { p.push(part(Cyl(0.015, 0.015, 1.0, 6), 0x8d6e63, 0.55, 1.75, 0.75)); p.push(part(Box(0.02, 0.28, 0.42), 0xffa726, 0.55, 2.1, 0.55), part(S(0.1, 8, 6), 0xffeb3b, 0.56, 2.1, 0.55, 0.3, 1, 1), part(Cone(0.05, 0.1, 4), 0x43a047, 0.56, 2.27, 0.65)); }
  if (id === 'dubu') { p.push(part(Box(0.55, 0.16, 0.4), 0xffffff, 0, 0.66, 0.5), part(Box(0.5, 0.04, 0.35), 0xf8bbd0, 0, 0.76, 0.5), part(Cone(0.08, 0.36, 8), 0xff9800, -0.3, 0.82, -0.2, 1, 1, 1, 0.3, 0, 0.6), part(Cone(0.08, 0.15, 5), 0x43a047, -0.4, 1.02, -0.27, 1, 1, 1, 0.3, 0, 0.6));
    p.push(part(Cap(0.06, 0.25, 6), 0xffffff, -0.25, 1.5, 0.78), part(Cap(0.06, 0.25, 6), 0xffffff, 0.25, 1.5, 0.78), part(Cap(0.035, 0.18, 6), 0xf8bbd0, -0.25, 1.5, 0.82), part(Cap(0.035, 0.18, 6), 0xf8bbd0, 0.25, 1.5, 0.82)); }
  if (id === 'halmi') { const cols = [0xff4081, 0xffeb3b, 0xff7043, 0xe040fb, 0xffffff]; for (let k = 0; k < 10; k++) { const side = k < 5 ? -1 : 1, z = -0.7 + (k % 5) * 0.35; p.push(part(S(0.08, 8, 6), cols[k % 5], side * 0.58, 1.35, z, 1, 0.6, 1), part(S(0.03, 6, 4), 0xfff176, side * 0.58, 1.4, z), part(S(0.05, 6, 4), 0x66bb6a, side * 0.6, 1.3, z + 0.1, 1, 0.4, 1.4)); }
    p.push(part(Cyl(0.22, 0.18, 0.3, 12), 0xd7a35b, 0.2, 0.72, 0.4), part(S(0.12, 8, 6), 0xff4081, 0.2, 0.95, 0.4)); }
  if (id === 'bujang') { p.push(part(Box(0.6, 0.42, 0.14), 0x4e342e, 0, 0.78, 0.2), part(Tor(0.08, 0.02, 10, Math.PI), 0x212121, 0, 1.0, 0.2), part(Box(0.08, 0.06, 0.15), 0xffd54f, 0, 0.88, 0.2), part(Box(0.3, 0.04, 0.4), 0xffffff, -0.2, 0.6, 0.6, 1, 1, 1, 0, 0.3)); }
  if (id === 'ppoppi') { for (let k = 0; k < 5; k++) p.push(part(Cone(0.12, 0.26, 4), 0x2e7d32, 0, 1.45, -0.6 + k * 0.32, 1, 1, 0.6)); p.push(part(S(0.18, 10, 8), 0xfff8e1, 0.15, 0.75, 0.5, 1, 1.25, 1), part(S(0.04, 6, 4), 0x81c784, 0.2, 0.85, 0.66), part(Cone(0.18, 0.45, 8), 0x66bb6a, 0, 0.5, -1.05, 1, 1, 1, -1.4)); }
  if (id === 'mint') { p.push(part(Box(0.42, 0.3, 0.26), 0x212121, 0.2, 0.72, 0.3), part(Cyl(0.08, 0.08, 0.02, 12), 0x4dd0c4, 0.2, 0.74, 0.44, 1, 1, 1, Math.PI / 2), part(Cyl(0.05, 0.05, 0.02, 12), 0x4dd0c4, 0.32, 0.8, 0.44, 1, 1, 1, Math.PI / 2));
    for (let k = 0; k < 6; k++) p.push(part(Box(1.18, 0.07, 0.12), k % 2 ? 0x5d4037 : 0x4dd0c4, 0, 1.22, -0.65 + k * 0.26)); }
  if (id === 'leo') { p.push(part(Cone(0.16, 0.3, 4), 0x9fa8da, -0.35, 1.48, 0.8, 1, 1, 0.5), part(Cone(0.16, 0.3, 4), 0x9fa8da, 0.35, 1.48, 0.8, 1, 1, 0.5), part(Cone(0.08, 0.16, 4), 0xff80ab, -0.35, 1.46, 0.84, 1, 1, 0.3), part(Cone(0.08, 0.16, 4), 0xff80ab, 0.35, 1.46, 0.84, 1, 1, 0.3));
    const rgb = [0xff1744, 0xffea00, 0x00e676, 0x2979ff, 0xd500f9]; for (let k = 0; k < 5; k++) p.push(part(Box(1.17, 0.05, 0.3), rgb[k], 0, 0.33, -0.6 + k * 0.3)); p.push(part(Box(0.5, 0.06, 0.3), 0x212121, 0, 0.62, 0.3), part(Box(0.12, 0.06, 0.12), 0x212121, -0.3, 0.62, 0.3), part(Box(0.12, 0.06, 0.12), 0x212121, 0.3, 0.62, 0.3)); }
  if (id === 'unni') { p.push(part(Cyl(0.3, 0.3, 0.22, 16), 0xffe0b2, 0, 0.7, 0.35), part(Cyl(0.31, 0.31, 0.06, 16), 0xff8fab, 0, 0.84, 0.35), part(Cyl(0.2, 0.2, 0.16, 16), 0xfff3e0, 0, 0.95, 0.35), part(S(0.07, 8, 6), 0xd50000, 0, 1.07, 0.35));
    for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; p.push(part(S(0.05, 6, 4), 0xffffff, Math.cos(a) * 0.25, 0.89, 0.35 + Math.sin(a) * 0.25)); } p.push(part(Cone(0.12, 0.12, 12), 0xff8fab, -0.58, 1.4, 0, 1, 1, 1, Math.PI)); }
  return p.length ? new THREE.Mesh(merge(p), vcToon) : null;
}
