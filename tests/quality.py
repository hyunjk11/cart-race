"""Draw calls / triangles per map on low vs high quality (renderer.info, debug build). Usage: quality.py [base]"""
import _env  # noqa: F401  (base URL + ?debug=1)
import asyncio, sys
from playwright.async_api import async_playwright
BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8080/"
MAPS = ["mart", "freezer", "parking", "skywalk"]
async def one(b, m, q):
    c = await b.new_context(viewport={"width": 1100, "height": 650}); errs = []
    await c.add_init_script(f"try{{localStorage.setItem('cartQuality','{q}')}}catch(e){{}}")
    pg = await c.new_page()
    pg.on("console", lambda x: errs.append(x.text) if x.type == "error" else None); pg.on("pageerror", lambda e: errs.append(str(e)))
    await pg.goto(BASE + "?map=" + m); await pg.wait_for_function("window.__game && __game.N>0", timeout=30000)
    await pg.click("#startBtn", force=True); await pg.wait_for_function("__game.state==='race'", timeout=90000)
    await pg.evaluate("__game.player.ai=true"); calls = []; tris = []
    for _ in range(6):
        await pg.wait_for_timeout(1000); p = await pg.evaluate("__game.perf"); calls.append(p["calls"]); tris.append(p["tris"])
    await c.close()
    return {"calls": round(sum(calls) / len(calls)), "tris": round(sum(tris) / len(tris)), "q": p["quality"], "errs": errs[:3]}
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
        print(f"{'map':8} {'low calls':>9} {'low tris':>9} {'high calls':>10} {'high tris':>10}")
        for m in MAPS:
            lo, hi = await one(b, m, "low"), await one(b, m, "high")
            print(f"{m:8} {lo['calls']:9} {lo['tris']:9} {hi['calls']:10} {hi['tris']:10}", lo["errs"], hi["errs"])
        await b.close()
asyncio.run(main())
