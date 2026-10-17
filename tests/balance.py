import _env  # noqa: F401  (base URL + ?debug=1)
"""Bot balance simulation (~50 races, headless, fast-forwarded). Reports character stat fairness, shopping-mode completion,
difficulty vs a strong 'player' bot, and item odds by position. usage: python3 tests/balance.py [races_per_map_mode] [win_races_per_difficulty]"""
import asyncio, json, sys, statistics as S
from playwright.async_api import async_playwright
ARGS = ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"]
CH = ['mango', 'dubu', 'halmi', 'bujang', 'ppoppi', 'mint', 'leo', 'unni']
BASE = "http://localhost:8080/"; MAPS = ['mart', 'freezer', 'parking', 'skywalk']; K = int(sys.argv[1]) if len(sys.argv) > 1 and sys.argv[1].isdigit() else 4
W = int(sys.argv[2]) if len(sys.argv) > 2 and sys.argv[2].isdigit() else 8
SETUP = """async ([mode, ch]) => { const g=__game; if(ch) g.chooseChar(ch); g.setMode(mode, mode==='shop'); g.startGame(); g.skipIntro(); let t=0; while(g.state!=='race'&&t<20){g.simulate(0.5);t+=0.5} }"""
BOTS_ONLY = """async ([mode, eq]) => { const g=__game, p=g.player; p.inactive=true; p.x=999; p.z=999; p.prog=-1e9;
  if(eq) g.carts.forEach(c=>{ if(c!==p){ c.maxV=18.25; } });
  let T=0; while(T<420){ g.simulate(2); T+=2; await new Promise(r=>setTimeout(r,0)); if(g.carts.every(c=>c===p||c.finished)) break; }
  return g.carts.filter(c=>c!==p).map(c=>({char:c.char, v:+c.maxV.toFixed(2), t:c.finished?+c.time.toFixed(1):null, lap:c.lap, got: mode==='shop'? g.shop.got(c)+'/'+g.shop.S(c).list.length : null, un:c.unstuck||0})); }"""
VS_PLAYER = """async () => { const g=__game, p=g.player; p.ai=true; p.maxV=20; let T=0;
  while(T<420){ g.simulate(2); T+=2; await new Promise(r=>setTimeout(r,0)); if(p.finished) break; }
  const order=[...g.carts].sort((a,b)=>b.prog-a.prog); return {rank: order.indexOf(p)+1, t:+p.time.toFixed(1), bots:g.carts.filter(c=>c!==p).map(c=>+c.maxV.toFixed(1))}; }"""
async def page(b, q):
    pg = await b.new_page(viewport={"width": 480, "height": 320}); errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
    await pg.goto(BASE + q); await pg.wait_for_function("window.__game&&__game.N>0", timeout=60000); return pg, errs
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=ARGS); allerr = []; per = {}; races = 0
        rel = {}  # char -> list of time / race-median
        DONLY = '--diff-only' in sys.argv
        for mode in ([] if DONLY else ['race', 'shop']):
            for m in MAPS:
                for k in range(K):
                    pg, errs = await page(b, f"?map={m}&nointro&mode={mode}"); await pg.evaluate(SETUP, [mode, CH[(MAPS.index(m) * K + k) % 8]])
                    r = await pg.evaluate(BOTS_ONLY, [mode, True]); races += 1; allerr += errs; await pg.close()
                    ts = [x['t'] for x in r if x['t']]; med = S.median(ts) if ts else None
                    for x in r:
                        per.setdefault(mode, []).append({**x, 'map': m})
                        if mode == 'race' and x['t'] and med: rel.setdefault(x['char'], []).append(x['t'] / med)
        spread, fin, sh, extra = 0, [], [], []
        if not DONLY:
            print("== character fairness (race mode, equal bot top speed; time / race median, lower = faster)")
            for ch, v in sorted(rel.items(), key=lambda kv: S.median(kv[1])): print(f"  {ch:7s} n={len(v):2d} median={S.median(v):.3f} mean={S.mean(v):.3f}")
            big = [v for v in rel.values() if len(v) >= 4]; spread = max(S.median(v) for v in big) - min(S.median(v) for v in big) if big else 1  # median: robust to the odd crash pile-up; ~5 samples/char so ±2-3% is noise
            un = sum(x.get('un', 0) for v in per.values() for x in v); print(f"  watchdog resets (AI wedged >7s): {un} over {sum(len(v) for v in per.values())} bot-races")
            sh = per.get('shop', []); fin = [x for x in sh if x['t']]; extra = [x for x in sh if x['lap'] is not None and x['lap'] >= 2]
            print(f"== shopping: {len(fin)}/{len(sh)} bots checked out, extra laps: {len(extra)} (mostly items knocked out by hits), times median {S.median([x['t'] for x in fin]):.1f}s max {max(x['t'] for x in fin):.1f}s, incomplete: {[x for x in sh if not x['t']]}")
        print("== bot-only race wins per character x difficulty (game's own bot speeds; 7 bots, 8 chars rotated)")
        wins = {}
        for d in ['easy', 'normal', 'hard']:
            for k in range(W):
                m = MAPS[k % 4]; pg, errs = await page(b, f"?map={m}&nointro&mode=race&diff={d}"); await pg.evaluate(SETUP, ['race', CH[k % 8]])
                r = await pg.evaluate(BOTS_ONLY, ['race', False]); races += 1; allerr += errs; await pg.close()
                fin_ = sorted([x for x in r if x['t']], key=lambda x: x['t'])
                if fin_: wins.setdefault(d, {}).setdefault(fin_[0]['char'], 0); wins[d][fin_[0]['char']] += 1
                wins.setdefault(d + '_t', []).append(fin_[0]['t'] if fin_ else None)
            print(f"  {d:6s} wins {dict(sorted(wins.get(d, {}).items(), key=lambda kv: -kv[1]))}  winner times median {S.median([t for t in wins[d + '_t'] if t]):.1f}s")
        tot = {}
        for d in ['easy', 'normal', 'hard']:
            for ch, n in wins.get(d, {}).items(): tot[ch] = tot.get(ch, 0) + n
        print(f"  total  wins {dict(sorted(tot.items(), key=lambda kv: -kv[1]))}")
        print("== difficulty vs strong player-bot (maxV 20, ~good human)")
        diffres = {}
        for d in ['easy', 'normal', 'hard']:
            for m in ['mart', 'skywalk']:
                for k in range(3):
                    pg, errs = await page(b, f"?map={m}&nointro&mode=race&diff={d}"); await pg.evaluate(SETUP, ['race', None])
                    r = await pg.evaluate(VS_PLAYER); races += 1; allerr += errs; await pg.close(); diffres.setdefault(d, []).append(r['rank'])
            print(f"  {d:6s} player ranks {diffres[d]} (mean {S.mean(diffres[d]):.2f})")
        pg, errs = await page(b, "?map=mart&nointro"); odds = await pg.evaluate("[0,1].map(t=>__game.itemOdds(t).map(x=>+x.toFixed(2)))"); await pg.close()
        print("== item odds banana/puddle/sign/bag/shield/magnet  leader:", odds[0], " last:", odds[1])
        if DONLY: print("difficulty only"); sys.exit(0 if S.mean(diffres['easy']) <= S.mean(diffres['hard']) and not allerr else 1)
        print(f"  fairness spread (medians, chars with n>=4): {spread:.3f}")
        ok = spread < 0.05 and len(fin) == len(sh) and len(extra) <= max(1, len(sh) // 5) and S.mean(diffres['easy']) <= S.mean(diffres['hard']) and not allerr
        print(f"races simulated: {races}; errors: {allerr[:3]}"); print("BALANCE", "PASS" if ok else "FAIL"); sys.exit(0 if ok else 1)
if __name__ == "__main__": asyncio.run(main())
