import _env  # noqa: F401  (base URL + ?debug=1)
import asyncio, sys, json, time
from playwright.async_api import async_playwright
ARGS=["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader","--autoplay-policy=no-user-gesture-required"]
BASE = sys.argv[1] if len(sys.argv)>1 else "http://localhost:8080/"
MAPS = sys.argv[2].split(",") if len(sys.argv)>2 else ["mart","freezer","parking","skywalk"]
LAPWAIT = float(sys.argv[3]) if len(sys.argv)>3 else 170
async def run_map(b, m):
    c = await b.new_context(viewport={"width":1100,"height":650}); pg = await c.new_page(); errs=[]
    pg.on("console", lambda x: errs.append(x.text) if x.type=="error" else None)
    pg.on("pageerror", lambda e: errs.append("PAGEERR "+str(e)+" "+(e.stack or "")[:300]))
    await pg.goto(BASE+"?map="+m); await pg.wait_for_function("window.__game && __game.N>0", timeout=30000)
    info = await pg.evaluate("({map:__game.MAP,N:__game.N,strips:__game.strips.length,doors:__game.trk.doors.length,traffic:__game.traffic.length,items:__game.trk.items.length,perf:__game.perf})")
    print(m, "info", info)
    await pg.screenshot(path=f"/workspace/cart-race-shots/title-{m}6.png")
    await pg.click("#startBtn", force=True)
    await pg.wait_for_function("__game.state==='race'", timeout=90000)
    await pg.evaluate("__game.player.ai=true; __game.player.maxV=18.5")
    t0=time.time(); worst={"cu":0,"cart":0}; shot=False; ys=[]
    while time.time()-t0 < LAPWAIT:
        await asyncio.sleep(1)
        r = await pg.evaluate("""(()=>{const g=__game; const ins=(x,z)=>g.strips.some(s=>!s.off&&x>s.x0+0.05&&x<s.x1-0.05&&z>s.z0+0.05&&z<s.z1-0.05);
          return {laps:g.carts.map(c=>c.lap), cu:g.customers.filter(c=>c.state==='walk'&&ins(c.x,c.z)).length, cart:g.carts.filter(c=>!c.inactive&&ins(c.x,c.z)).length, t:g.raceT, y:+g.hAt(g.player.x,g.player.z).toFixed(2), fps:g.perf.fps, stuck:g.carts.map(c=>Math.round(c.v))}})()""")
        worst["cu"]=max(worst["cu"],r["cu"]); worst["cart"]=max(worst["cart"],r["cart"]); ys.append(r["y"])
        clear = await pg.evaluate("(()=>{const g=__game,p=g.player;return g.carts.every(c=>c===p||Math.hypot(c.x-p.x,c.z-p.z)>9)})()")
        if not shot and r["t"]>10 and (clear or r["t"]>40): shot=True; await pg.screenshot(path=f"/workspace/cart-race-shots/map-{m}6.png"); print(m,"shot at",round(r["t"],1))
        if min(r["laps"])>=1: break
    print(m, "after", round(time.time()-t0), "s raceT", round(r["t"],1), "laps", r["laps"], "inside(max) customers", worst["cu"], "carts", worst["cart"], "maxY", max(ys), "fps", r["fps"], "v", r["stuck"])
    best = await pg.evaluate("__game.getBest(__game.MAP)"); print(m, "best lap stored", best, "lapTimes", await pg.evaluate("__game.carts.map(c=>(c.laps||[]).map(x=>+x.toFixed(1)))"))
    print(m, "errors", errs[:5]); await c.close()
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=ARGS)
        await asyncio.gather(*[run_map(b,m) for m in MAPS])
        await b.close()
asyncio.run(main())
