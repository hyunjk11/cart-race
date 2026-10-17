import _env  # noqa: F401  (base URL + ?debug=1)
import asyncio, sys
from playwright.async_api import async_playwright
ARGS=["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader"]
BASE=sys.argv[1] if len(sys.argv)>1 else "http://localhost:8080/"
O="/workspace/cart-race-shots/"
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(args=ARGS); errs=[]
        c=await b.new_context(viewport={"width":1100,"height":650}); pg=await c.new_page(); ev=pg.evaluate
        pg.on("console",lambda x: errs.append(x.text) if x.type=="error" else None); pg.on("pageerror",lambda e: errs.append("PE "+str(e)+" "+(e.stack or "")[:400]))
        await pg.goto(BASE+"?map=freezer&mode=shop&nointro"); await pg.wait_for_function("window.__game&&__game.N>0",timeout=30000)
        await pg.click("#startBtn",force=True); await pg.wait_for_function("__game.state==='race'",timeout=60000)
        await ev("__game.simulate(6)")
        await ev("(()=>{const g=__game,p=g.player,sh=g.shop;for(const k of sh.S(p).list) if(!sh.has(p,k)) sh.S(p).items.push({k,sale:0,broken:0,wrong:0});g.debugNearFinish();})()")
        await pg.keyboard.down("ArrowUp"); await pg.wait_for_function("__game.player.finished",timeout=30000); await pg.keyboard.up("ArrowUp"); await asyncio.sleep(1.5)
        print("state", await ev("__game.state"), "spec", await ev("JSON.stringify(__game.spec)"), await pg.inner_text("#specName"))
        await pg.screenshot(path=O+"spectate9.png")
        await pg.click("#specNext"); await asyncio.sleep(0.5); print("next ->", await pg.inner_text("#specName"))
        await pg.click("#specFF"); await asyncio.sleep(2); print("ff", await pg.inner_text("#specFF"), "raceT", await ev("__game.raceT.toFixed(1)"))
        await pg.screenshot(path=O+"spectate-ff9.png")
        await pg.wait_for_function("__game.podium",timeout=180000); await asyncio.sleep(1.5)
        print("finished all", await ev("JSON.stringify(__game.carts.map(c=>[c.name,c.finished,+c.time.toFixed(1)]))"))
        print("result", (await pg.inner_text(".rrank")).replace("\n"," | "))
        await pg.screenshot(path=O+"shop-podium9.png")
        print("errors", errs[:6]); await b.close()
asyncio.run(main())
