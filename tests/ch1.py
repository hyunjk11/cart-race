import _env  # noqa: F401  (base URL + ?debug=1)
import asyncio, sys
from playwright.async_api import async_playwright
ARGS=["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader"]
BASE=sys.argv[1] if len(sys.argv)>1 else "http://localhost:8080/"
O="/workspace/cart-race-shots/"
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(args=ARGS); errs=[]
        c=await b.new_context(viewport={"width":1100,"height":700}); pg=await c.new_page(); ev=pg.evaluate
        pg.on("console",lambda x: errs.append(x.text) if x.type=="error" else None); pg.on("pageerror",lambda e: errs.append("PE "+str(e)+" "+(e.stack or "")[:400]))
        await pg.goto(BASE+"?map=mart&nointro"); await pg.wait_for_function("window.__game&&__game.N>0",timeout=30000); await asyncio.sleep(1)
        print("errs0",errs[:3])
        await pg.screenshot(path=O+"title9.png")
        await pg.click("#charBtn"); await asyncio.sleep(1)
        await pg.click('#charRow [data-char="halmi"]'); await asyncio.sleep(1.5)
        await pg.screenshot(path=O+"charselect9.png")
        await pg.click("#charLineup"); await asyncio.sleep(1.5)
        await pg.screenshot(path=O+"lineup9.png")
        await pg.click("#charLineup"); await pg.click('#charRow [data-char="ppoppi"]'); await pg.click("#charOk"); await asyncio.sleep(0.5)
        print("mychar", await ev("__game.MYCHAR"), await ev("localStorage.getItem('cartChar')"), "player char", await ev("__game.player.char"))
        print("perf title", await ev("JSON.stringify(__game.perf)"))
        await pg.click("#startBtn",force=True); await pg.wait_for_function("__game.state==='race'",timeout=60000)
        print("chars", await ev("JSON.stringify(__game.carts.map(c=>[c.name,c.char]))"))
        await pg.keyboard.down("ArrowUp"); await asyncio.sleep(3)
        print("perf race", await ev("JSON.stringify(__game.perf)"))
        await pg.screenshot(path=O+"race9.png")
        await ev("__game.debugNearFinish()"); await pg.wait_for_function("__game.podium",timeout=60000); await asyncio.sleep(1.5)
        await pg.screenshot(path=O+"podium9.png")
        print("errors", errs[:6]); await b.close()
asyncio.run(main())
