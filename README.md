# 🛒💨 마트 카트 레이싱 (Mart Cart Racing)

A browser 3D shopping-cart racing game (three.js + cannon-es), Korean UI. **Play:** https://hyunjk11.github.io/cart-race/

- **Modes:** 레이스 (3 laps) and 장보기 모드 (fill your shopping list, then race to the checkout; receipt-style scoring)
- **4 maps:** 일반 매장 · 냉동 코너 · 지하 주차장 · 2층 무빙워크
- **8 characters** with small stat differences, voice lines and cart decorations
- **Items, drift → N2O, customers that hop into your cart**, PA announcer, podium cutscene
- **🪙 Coins + 🔧 차고 (parts shop):** earn coins every run (place, chaos, drift combos, shopping list, first win of the day), buy wheels/baskets/handles/boosters/toppers/paint/trails that visibly change the cart; small stat tweaks (±5% max) in solo, cosmetic-only online unless the host turns them on
- **Online multiplayer** for up to 4 players (WebRTC via PeerJS, host-authoritative; bots fill empty slots)
- Desktop keyboard and mobile touch controls; installable PWA that works offline (solo)

## Run locally
No build step. Serve the folder statically:
```
python3 -m http.server 8080      # then open http://localhost:8080/
```
Useful query params: `?map=mart|freezer|parking|skywalk`, `?mode=shop`, `?notime`, `?nointro`, `?room=CODE`.
`?debug=1` exposes test hooks (`window.__game` incl. `grantCoins(n)`, `cartInfo(i)`, `setParts(i, lo)`, `?scoop=`); they are hidden in normal play.

## Architecture
Plain ES modules, no build step. `index.html` loads `js/main.js` through an import map that `tools/stamp.py` versions.

- **main.js** owns the game: renderer/scene/physics world, carts, customers, products, the race state machine
  (`title → countdown → race → finished`), the driving model and the render loop.
- Parts of main.js were split into **hud.js, results.js, inputglue.js, netglue.js**. They share state with main.js
  through **state.js**: `S` holds mutable session/race state (`S.state`, `S.MODE`, `S.player`, `S.raceT`, …) that
  any of them may read or write; `ctx` holds long-lived objects and services that main.js registers as soon as they
  exist (`ctx.scene`, `ctx.carts`, `ctx.loadMap()`, …).
- Self-contained subsystems (track, models, chars, fun, shop, fx, audio, net, input, help) take what they need as
  imports or constructor arguments and do not touch state.js.
- **All tuning numbers and data tables live in `js/config/`**; logic modules import them.
- Multiplayer is host-authoritative: the host (or solo game) simulates everything, guests send input and mirror
  snapshots (netglue.js), net.js handles PeerJS rooms, lobby, rejoin and host migration.

## Module map
| path | what |
|---|---|
| `index.html`, `style.css` | UI shell / styles |
| `js/main.js` | entry point, game loop, race logic, driving model, customers/products, PA announcer, cutscenes |
| `js/state.js` | shared state between main.js and the split-out modules (`S`, `ctx`) |
| `js/hud.js` | HUD: flash messages, speech bubbles, announcer, minimap, spectator UI, standings |
| `js/results.js` | race end, results screen, shopping receipt, back to lobby |
| `js/inputglue.js` | wires input/help/audio to the game (start, item/N2O keys, mute & auto-accel buttons) |
| `js/netglue.js` | multiplayer glue: host snapshots, guest prediction/mirroring, remote carts, MP race end |
| `js/track.js` | builds a map (floor, walls, zones, elevation, signs, obstacles); path helpers; current `MAP` |
| `js/models.js` `js/chars.js` `js/charsel.js` | cart/customer meshes; toon characters + decorations; character select |
| `js/parts.js` `js/cartparts.js` `js/garage.js` | coins/owned/equipped parts in localStorage + stat mods + coin awards; cached part geometry/materials (low-quality variants); 🔧 차고 UI with 3D preview |
| `js/fun.js` `js/shop.js` `js/fx.js` `js/audio.js` | items/hazards/events, shopping mode, effects/podium, synthesized audio |
| `js/net.js` `js/netconfig.js` | PeerJS multiplayer (rooms, lobby, rejoin, host migration); STUN/TURN servers |
| `js/input.js` `js/help.js` | keyboard remapping + touch controls; help/settings panel, tips, tutorial |
| `js/store.js` `js/util.js` | safe localStorage + `DEBUG` flag; tiny shared helpers (`$`, `pick`, escaping, …) |
| `js/config/tuning.js` | laps, cart driving model (`CART`), bot difficulty (`DIFFS`), pools, wall size, intro length |
| `js/config/maps.js` | the 4 maps: layout, theme, zones, signs, displays, obstacles |
| `js/config/characters.js` | the 8 characters: stats, palettes, animation style, voice lines |
| `js/config/parts.js` | part slots, parts (price, stat tweaks), coin reward rules |
| `js/config/items.js` `js/config/shop.js` | item table + odds by position; shopping goods, prices, scoring, radii |
| `vendor/` | tree-shaken minified three.js r160 + cannon-es 0.20 bundles (`python3 tools/bundle.py`, rerun after using a new THREE./CANNON. export), PeerJS 1.5.4 (no CDN at runtime) |
| `fonts/jua.woff2` | Jua font subset to the characters the game uses |
| `icons/`, `manifest.json`, `sw.js` | PWA icons, share image, offline service worker |
| `tools/` | maintenance scripts (below) |
| `tests/` | Playwright end-to-end tests |

## Code style
`js/` is formatted with Prettier (`.prettierrc.json`, width 140): `npx prettier --write js/` from the repo root
(run it from the root so the config is picked up). `node tools/undef.mjs js/*.js js/config/*.js` catches undefined
identifiers and imports of names a module does not export.

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
`tests/run_core.sh` runs the core subset used by CI (`MP=1` adds the flaky multiplayer tests).
