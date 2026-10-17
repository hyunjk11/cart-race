# 🛒💨 마트 카트 레이싱 (Mart Cart Racing)

A browser 3D shopping-cart racing game (three.js + cannon-es), Korean UI. **Play:** https://hyunjk11.github.io/cart-race/

- **Modes:** 레이스 (3 laps) and 장보기 모드 (fill your shopping list, then race to the checkout; receipt-style scoring)
- **4 maps:** 일반 매장 · 냉동 코너 · 지하 주차장 · 2층 무빙워크
- **8 characters** with small stat differences, voice lines and cart decorations
- **Items, drift → N2O, customers that hop into your cart**, PA announcer, podium cutscene
- **Online multiplayer** for up to 4 players (WebRTC via PeerJS, host-authoritative; bots fill empty slots)
- Desktop keyboard and mobile touch controls; installable PWA that works offline (solo)

## Run locally
No build step. Serve the folder statically:
```
python3 -m http.server 8080      # then open http://localhost:8080/
```
Useful query params: `?map=mart|freezer|parking|skywalk`, `?mode=shop`, `?notime`, `?nointro`, `?room=CODE`.
`?debug=1` exposes test hooks (`window.__game`, `?scoop=`); they are hidden in normal play.

## Project layout
| path | what |
|---|---|
| `index.html`, `style.css` | UI shell / styles |
| `js/main.js` | game loop, race logic, HUD, input |
| `js/track.js` `js/models.js` `js/chars.js` | maps, props, characters (merged toon geometry) |
| `js/fun.js` `js/shop.js` `js/fx.js` `js/audio.js` | items/hazards, shopping mode, effects, synthesized audio |
| `js/net.js` | multiplayer (PeerJS) |
| `js/store.js` | safe localStorage + `DEBUG` flag |
| `vendor/` | tree-shaken minified three.js r160 + cannon-es 0.20 bundles (`python3 tools/bundle.py`, rerun after using a new THREE./CANNON. export), PeerJS 1.5.4 (no CDN at runtime) |
| `fonts/jua.woff2` | Jua font subset to the characters the game uses |
| `icons/`, `manifest.json`, `sw.js` | PWA icons, share image, offline service worker |
| `tools/` | maintenance scripts (below) |
| `tests/` | Playwright end-to-end tests |

## Maintenance scripts
- **After changing any JS/CSS/asset: `python3 tools/stamp.py`** — rewrites the versioned asset URLs (`?v=<hash>`) in
  `index.html` and regenerates `sw.js`, so a deploy never mixes old and new files. CI fails if you forget (`--check`).
- After adding new UI text: `python3 tools/font.py Jua-Regular.ttf` (re-subsets the font; get the TTF from google/fonts `ofl/jua`).
- `python3 tools/shots.py` re-renders icons and the 1200×630 share image `icons/og.png` (needs the local server).

## Tests
Playwright (Python) with headless Chromium + SwiftShader. Start the local server, then e.g.
```
pip install playwright && python3 -m playwright install chromium
python3 tests/smoke.py
CART_BASE=https://hyunjk11.github.io/cart-race/ python3 tests/mp.py   # against the live site
```
