import _env  # noqa: F401  (base URL + ?debug=1)
import asyncio, sys, json
from playwright.async_api import async_playwright
ARGS=["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader"]
BASE=sys.argv[1] if len(sys.argv)>1 else "http://localhost:8080/"
MAPS=sys.argv[2].split(",") if len(sys.argv)>2 else ["mart","freezer","parking","skywalk"]
async def run(b,m):
    errs=[]; c=await b.new_context(viewport={"width":1100,"height":650}); pg=await c.new_page()
    pg.on("console",lambda x: errs.append(x.text) if x.type=="error" else None); pg.on("pageerror",lambda e: errs.append("PE "+str(e)+" "+(e.stack or "")[:400]))
    await pg.goto(BASE+f"?map={m}&mode=shop&nointro"); await pg.wait_for_function("window.__game&&__game.N>0",timeout=30000)
    await pg.evaluate("localStorage.removeItem('cartMode')")
    info=await pg.evaluate("JSON.stringify({spots:__game.shop.spots.length, inside:__game.shop.spots.filter(s=>__game.insideShelf(s.x,s.z)).length, kinds:__game.shop.kinds})")
    await pg.click("#startBtn",force=True)
    await pg.evaluate("__game.simulate(4.5)")
    # make player AI so it also shops
    await pg.evaluate("__game.player.ai=true")
    hist=[]
    for k in range(22):
        await pg.evaluate("__game.simulate(8)")
        st=await pg.evaluate("JSON.stringify({t:+__game.raceT.toFixed(0),state:__game.state,c:__game.carts.map(c=>[__game.shop.got(c),__game.shop.S(c).list.length,c.shop.items.length,c.finished?+c.time.toFixed(1):0,c.lap,c.idx,+c.v.toFixed(1),c.x|0,c.z|0])})")
        hist.append(st)
        if json.loads(st)["state"]!="race": break
    print(m,info); print(m,hist[-1]); 
    if json.loads(hist[-1])["state"]!="finished": _env.fail(m+" race did not finish")
    await asyncio.sleep(7)
    await pg.screenshot(path=f'/workspace/cart-race-shots/receipt-{m}8.png')
    body=await pg.evaluate("document.getElementById('finBody').innerText.slice(0,400)")
    print(m,"finish:",body.replace("\n"," | ")[:300]); print(m,"errors",errs[:5]); await c.close()
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(args=ARGS)
        for m in MAPS: await run(b,m)
        await b.close()
asyncio.run(main())
