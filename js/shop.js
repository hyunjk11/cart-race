// 장보기 모드: shopping lists, glowing pickup spots, basket contents, sales, receipt scoring.
// Host/solo is authoritative; guests mirror state from snapshots (snap/applySnap). Effects are diff-driven so they play everywhere.
import * as THREE from 'three';

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
const GI = Object.fromEntries(GOODS.map((g, i) => [g.id, i]));
const MAP_GOODS = {
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
export const won = n => '₩' + Math.round(n).toLocaleString('ko-KR');

function iconTex(emoji, label, col) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(255,255,255,.92)';
  g.beginPath();
  g.arc(128, 104, 88, 0, 7);
  g.fill();
  g.lineWidth = 10;
  g.strokeStyle = col;
  g.stroke();
  g.font = "104px 'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji',sans-serif";
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(emoji, 128, 110);
  g.font = '44px Jua, sans-serif';
  g.lineWidth = 8;
  g.strokeStyle = 'rgba(0,0,0,.55)';
  g.strokeText(label, 128, 226, 250);
  g.fillStyle = '#fff';
  g.fillText(label, 128, 226, 250);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function saleTex() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 96;
  const g = c.getContext('2d');
  g.fillStyle = '#ff1744';
  if (g.roundRect) {
    g.beginPath();
    g.roundRect(4, 4, 248, 88, 20);
    g.fill();
  } else g.fillRect(0, 0, 256, 96);
  g.fillStyle = '#fff';
  g.font = '56px Jua, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('🏷️ 할인 30%', 128, 52, 240);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createShop(G) {
  const { scene, carts, path, N, HW, atLane, insideShelf, hAt, low } = G;
  const group = new THREE.Group();
  group.visible = false;
  scene.add(group);
  const disp = [];
  const own = o => {
    disp.push(o);
    return o;
  };
  const ringG = own(new THREE.RingGeometry(1.15, 1.6, 28)),
    beamG = own(new THREE.CylinderGeometry(1.1, 1.3, 3.2, 16, 1, true)),
    discG = own(new THREE.CircleGeometry(1.15, 24));
  const saleT = own(saleTex()),
    saleM = own(new THREE.SpriteMaterial({ map: saleT, depthTest: false }));
  const kinds = MAP_GOODS[G.mapId] || MAP_GOODS.mart;
  const mats = {};
  for (const id of kinds) {
    const g = GOODS[GI[id]],
      col = '#' + g.c.toString(16).padStart(6, '0');
    mats[id] = {
      ring: own(
        new THREE.MeshBasicMaterial({
          color: 0xfff176,
          transparent: true,
          opacity: 0.85,
          side: THREE.DoubleSide,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      ),
      beam: own(
        new THREE.MeshBasicMaterial({
          color: 0xffee58,
          transparent: true,
          opacity: 0.16,
          side: THREE.DoubleSide,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      ),
      disc: own(new THREE.MeshBasicMaterial({ color: 0xfff59d, transparent: true, opacity: 0.25, depthWrite: false })),
      icon: own(new THREE.SpriteMaterial({ map: own(iconTex(g.i, g.n, col)) })),
    };
  }
  // ---- spots: 2 per kind, half a lap apart, on alternating sides of the aisle, never inside shelves/obstacles ----
  const order = kinds
    .map((k, i) => [k, Math.random()])
    .sort((a, b) => a[1] - b[1])
    .map(a => a[0]);
  const spots = [],
    NS = kinds.length * 2;
  const blocked = (x, z) => {
    for (const [dx, dz] of [
      [0, 0],
      [1.2, 0],
      [-1.2, 0],
      [0, 1.2],
      [0, -1.2],
    ])
      if (insideShelf(x + dx, z + dz)) return true;
    for (const o of G.obstacles()) if (Math.hypot(o.x - x, o.z - z) < (o.r || 1) + 1.6) return true;
    return spots.some(s => Math.hypot(s.x - x, s.z - z) < 4);
  };
  for (let j = 0; j < NS; j++) {
    const base = Math.floor(14 + (j * (N - 22)) / NS);
    let side = j % 2 ? 1 : -1,
      p = null,
      ii = base;
    outer: for (const di of [0, 2, -2, 4, -4, 6])
      for (const s of [side, -side])
        for (const lat of [HW - 1.35, HW - 2.1, HW - 2.8]) {
          const q = atLane(base + di, s * lat);
          if (!blocked(q.x, q.z)) {
            p = q;
            ii = (base + di + N) % N;
            side = s;
            break outer;
          }
        }
    if (!p) {
      p = atLane(base, 0);
      ii = base;
    }
    const k = order[j % order.length],
      M = mats[k],
      y = hAt(p.x, p.z);
    const g = new THREE.Group();
    g.position.set(p.x, y, p.z);
    group.add(g);
    const ring = new THREE.Mesh(ringG, M.ring);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.06;
    g.add(ring);
    const disc = new THREE.Mesh(discG, M.disc);
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = 0.05;
    g.add(disc);
    let beam = null;
    if (!low) {
      beam = new THREE.Mesh(beamG, M.beam);
      beam.position.y = 1.6;
      g.add(beam);
    }
    const icon = new THREE.Sprite(M.icon);
    icon.scale.set(1.5, 1.5, 1);
    icon.position.y = 2.6;
    g.add(icon);
    const tag = new THREE.Sprite(saleM);
    tag.scale.set(1.9, 0.72, 1);
    tag.position.y = 3.75;
    tag.visible = false;
    g.add(tag);
    spots.push({ id: j, k, x: p.x, z: p.z, i: ii, g, ring, disc, beam, icon, tag, sale: 0, cool: new Map() });
  }
  // ---- per-cart basket meshes ----
  const boxG = own(new THREE.BoxGeometry(0.26, 0.24, 0.26)),
    bigG = own(new THREE.SphereGeometry(0.22, 10, 8)),
    brokenM = own(new THREE.MeshLambertMaterial({ color: 0xffd54f })),
    gMat = {};
  const matOf = id => gMat[id] || (gMat[id] = own(new THREE.MeshLambertMaterial({ color: GOODS[GI[id]].c })));
  for (const c of carts) {
    if (c.basket) {
      c.g.root.remove(c.basket);
    }
    c.basket = new THREE.Group();
    c.basket.position.set(0, 0.98, 0.62);
    c.g.root.add(c.basket);
    c.basketN = -1;
    c.shop = { list: [], items: [] };
    c.shopSeen = 0;
  }

  // ---- state helpers ----
  const S = c => c.shop || (c.shop = { list: [], items: [] });
  const has = (c, k) => S(c).items.some(it => it.k === k && !it.broken && !it.wrong);
  const need = (c, k) => S(c).list.includes(k) && !has(c, k);
  const complete = c => S(c).list.length > 0 && S(c).list.every(k => has(c, k));
  const got = c => S(c).list.filter(k => has(c, k)).length;
  let saleNext = 14;
  function newRace(active) {
    for (const s of spots) {
      s.sale = 0;
      s.cool.clear();
    }
    saleNext = 14;
    for (const c of carts) {
      const pool = kinds.filter(k => k !== 'egg').sort(() => Math.random() - 0.5),
        n = LIST_N; // same list length for everyone in a match
      const list = Math.random() < 0.7 ? ['egg', ...pool.slice(0, n - 1)] : pool.slice(0, n);
      c.shop = { list, items: [] };
      c.shopSeen = 0;
      c.shopFx = [];
      c.basketN = -1;
    }
  }
  function grab(c, s, byKey) {
    const ok = need(c, s.k);
    if (!ok && !byKey) return false;
    s.cool.set(c, 2.5);
    const it = { k: s.k, sale: s.sale > 0 ? 1 : 0, broken: 0, wrong: ok ? 0 : 1 };
    S(c).items.push(it);
    return true;
  }
  function nearest(c, r, f) {
    let b = null,
      bd = r;
    for (const s of spots) {
      const d = Math.hypot(s.x - c.x, s.z - c.z);
      if (d < bd && !(s.cool.get(c) > 0) && (!f || f(s))) {
        bd = d;
        b = s;
      }
    }
    return b;
  }
  function crash(c, impact) {
    if (c.finished) return 0; // shelf/wall crash: eggs break; very hard crash drops an item
    let ev = 0;
    for (const it of S(c).items)
      if (!it.broken && GOODS[GI[it.k]].fragile) {
        it.broken = 1;
        ev = 1;
      }
    if (impact > 12) drop(c, 1, 'crash');
    return ev;
  }
  function drop(c, n, why) {
    if (c.finished) return;
    const its = S(c).items;
    for (let k = 0; k < n; k++) {
      const cand = its.map((it, i) => [it, i]).filter(([it]) => !it.broken);
      if (!cand.length) return;
      const [it, i] = cand[cand.length - 1 - ((Math.random() * Math.min(2, cand.length)) | 0)];
      its.splice(i, 1);
      (c.shopFx = c.shopFx || []).push(['drop', it.k, why]);
    }
  }
  function hit(c, why) {
    crash(c, 0);
    drop(c, 1, why);
  }
  function aiGoal(c) {
    let best = null,
      bd = 1e9;
    for (const s of spots) {
      if (!need(c, s.k) || s.cool.get(c) > 0) continue;
      let d = (s.i - c.idx + N) % N;
      if (d > N - 6 && Math.hypot(s.x - c.x, s.z - c.z) < 7) d = 0;
      /* just beside/behind: still go for it */ if (d < bd && d < 40) {
        bd = d;
        best = s;
      }
    }
    return best && { s: best, d: Math.hypot(best.x - c.x, best.z - c.z), di: bd };
  }
  function update(dt, state, raceT, mode) {
    // host/solo
    if (state !== 'race') return;
    for (const s of spots) {
      for (const [c, t] of s.cool) s.cool.set(c, t - dt);
      if (s.sale > 0) s.sale -= dt;
    }
    saleNext -= dt;
    if (saleNext <= 0) {
      saleNext = 22 + Math.random() * 10;
      const cand = spots
        .filter(s => s.sale <= 0)
        .sort(() => Math.random() - 0.5)
        .slice(0, 2);
      for (const s of cand) s.sale = 15;
      if (cand.length) G.paSay(`🏷️ 타임 할인! ${cand.map(s => GOODS[GI[s.k]].n).join(', ')} 30% 할인 중입니다~!`);
    }
    for (const c of carts) {
      if (c.inactive || c.finished) continue;
      const key = c.useItem || (c.ai && c.aiGrab),
        R = KEY_R;
      /* some spots sit against shelves: a cart nose-in stops ~3.4m from the centre */ c.aiGrab = false;
      const s = nearest(c, key ? R : GRAB_R, c.ai ? q => need(c, q.k) : null);
      if (s && key && Math.hypot(s.x - c.x, s.z - c.z) < R && (!c.ai || need(c, s.k))) {
        c.useItem = false;
        grab(c, s, true);
      } else if (s && Math.hypot(s.x - c.x, s.z - c.z) < GRAB_R && Math.abs(c.v) < GRAB_V) grab(c, s, false);
    }
  }
  function score(c, rank, finished, time) {
    const its = S(c).items,
      L = [];
    let pts = 0,
      money = 0;
    for (const it of its) {
      const g = GOODS[GI[it.k]],
        price = g.p * (it.sale ? 0.7 : 1);
      if (it.broken) {
        L.push([`${g.i} ${g.n} (파손)`, 0, PTS.broken]);
        pts += PTS.broken;
      } else if (it.wrong) {
        L.push([`${g.i} ${g.n} (목록 외)`, price, PTS.wrong]);
        pts += PTS.wrong;
        money += price;
      } else {
        const p = PTS.item + (it.sale ? PTS.sale : 0);
        L.push([`${g.i} ${g.n}${it.sale ? ' 🏷️할인' : ''}`, price, p]);
        pts += p;
        money += price;
      }
    }
    for (const k of S(c).list)
      if (!has(c, k)) {
        const g = GOODS[GI[k]];
        L.push([`${g.i} ${g.n} (못 삼)`, 0, 0]);
      }
    const B = [];
    if (complete(c)) B.push(['✅ 목록 완료 보너스', PTS.complete]);
    if (finished && rank >= 0) {
      B.push([`🏁 계산 순위 ${rank + 1}위`, PTS.place[rank] || 0]);
      const tb = Math.max(0, Math.round((T_LIMIT - time) * PTS.timeK));
      if (tb) B.push(['⏱ 시간 보너스', tb]);
    }
    for (const b of B) pts += b[1];
    return { lines: L, bonus: B, score: pts, money, got: got(c), n: S(c).list.length };
  }
  // ---- sync ----
  const pack = it => GI[it.k] * 8 + (it.sale ? 1 : 0) + (it.broken ? 2 : 0) + (it.wrong ? 4 : 0);
  const unpack = v => ({ k: GOODS[v >> 3].id, sale: v & 1, broken: (v >> 1) & 1, wrong: (v >> 2) & 1 });
  function snap() {
    return {
      s: spots.map(s => (s.sale > 0 ? Math.ceil(s.sale) : 0)),
      c: carts.map(c => (c.inactive ? 0 : [S(c).list.map(k => GI[k]), S(c).items.map(pack)])),
    };
  }
  function applySnap(m) {
    if (!m) return;
    m.s.forEach((v, i) => {
      if (spots[i]) spots[i].sale = v;
    });
    m.c.forEach((a, i) => {
      const c = carts[i];
      if (!a || !c) return;
      const prev = S(c).items,
        nx = a[1].map(unpack);
      // drops are inferred: items that vanished
      const cnt = its => {
          const o = {};
          for (const it of its) o[it.k] = (o[it.k] || 0) + 1;
          return o;
        },
        A = cnt(prev),
        B = cnt(nx);
      for (const k in A) for (let q = B[k] || 0; q < A[k]; q++) (c.shopFx = c.shopFx || []).push(['drop', k, 'hit']);
      c.shop = { list: a[0].map(v => GOODS[v].id), items: nx };
    });
  }
  // ---- visuals / diff-driven effects ----
  let t = 0;
  function render(dt, P) {
    t += dt;
    for (const s of spots) {
      const want = P && need(P, s.k),
        sale = s.sale > 0;
      s.tag.visible = sale;
      s.tag.position.y = 3.75 + Math.sin(t * 5) * 0.08;
      s.icon.position.y = 2.6 + Math.sin(t * 2.4 + s.id) * 0.18;
      s.ring.rotation.z = t * 1.5;
      const k = want ? 1 : 0.35;
      s.icon.material.opacity = 1;
      s.ring.scale.setScalar(want ? 1 + Math.sin(t * 6 + s.id) * 0.08 : 0.8);
      s.ring.material.opacity = 0.85;
      s.g.visible = true;
      s.icon.scale.setScalar(want ? 1.6 : 1.05);
      if (s.beam) s.beam.visible = want || sale;
      s.ring.visible = true;
      s.ring.material.color.setHex(0xfff176);
      s.disc.visible = want;
      void k;
    }
    for (const c of carts) {
      if (c.inactive) {
        c.basket.visible = false;
        continue;
      }
      c.basket.visible = true;
      const its = S(c).items,
        sig = its.map(pack).join(',');
      if (sig !== c.basketSig) {
        // new item(s) in: effects
        const n0 = c.shopSeen || 0;
        if (its.length > n0)
          for (const it of its.slice(n0)) (c.shopFx = c.shopFx || []).push(['grab', it.k, it.wrong ? 'wrong' : it.sale ? 'sale' : 'ok']);
        const brk = its.filter(it => it.broken).length;
        if (brk > (c.brokenSeen || 0)) (c.shopFx = c.shopFx || []).push(['break', 'egg']);
        c.brokenSeen = brk;
        c.shopSeen = its.length;
        c.basketSig = sig;
        while (c.basket.children.length) c.basket.remove(c.basket.children[0]);
        its.slice(0, 12).forEach((it, j) => {
          const g = GOODS[GI[it.k]],
            m = new THREE.Mesh(g.big ? bigG : boxG, it.broken ? brokenM : matOf(it.k));
          m.position.set(((j % 2) - 0.5) * 0.3, 0.13 + Math.floor(j / 6) * 0.25, ((Math.floor(j / 2) % 3) - 1) * 0.3);
          m.rotation.y = j * 0.7;
          if (it.broken) m.scale.set(1.3, 0.3, 1.3);
          c.basket.add(m);
        });
      }
      if (c.shopFx && c.shopFx.length) {
        for (const f of c.shopFx) G.onFx(c, f);
        c.shopFx.length = 0;
      }
    }
  }
  function setActive(on) {
    group.visible = on;
    for (const c of carts) if (c.basket) c.basket.visible = on && !c.inactive;
    if (!on)
      for (const c of carts)
        if (c.basket) {
          while (c.basket.children.length) c.basket.remove(c.basket.children[0]);
          c.basketSig = '';
        }
  }
  function dispose() {
    scene.remove(group);
    for (const c of carts)
      if (c.basket) {
        c.g.root.remove(c.basket);
        c.basket = null;
      }
    for (const o of disp) o.dispose();
  }
  return {
    spots,
    kinds,
    newRace,
    update,
    grab,
    nearest,
    crash,
    hit,
    drop,
    aiGoal,
    need,
    has,
    complete,
    got,
    score,
    snap,
    applySnap,
    render,
    setActive,
    dispose,
    S,
    GOODS,
    GI,
  };
}
