import _env  # noqa: F401  (base URL + ?debug=1)
import asyncio, sys, time
from playwright.async_api import async_playwright
ARGS=["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader"]
M=sys.argv[1]
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=ARGS); c=await b.new_context(viewport={"width":640,"height":360}); pg=await c.new_page()
        await pg.goto("http://localhost:8080/?map="+M); await pg.wait_for_function("window.__game&&__game.N>0")
        await pg.click("#startBtn", force=True); await pg.wait_for_function("__game.state==='race'")
        await pg.evaluate("__game.player.ai=true")
        slow={}
        for k in range(int(sys.argv[2]) if len(sys.argv)>2 else 110):
            await asyncio.sleep(1)
            r=await pg.evaluate("__game.carts.map(c=>[+c.x.toFixed(1),+c.z.toFixed(1),+c.v.toFixed(1),c.idx,c.lap,c.spin>0?1:0,c.slipT>0?1:0])")
            for i,a in enumerate(r):
                if abs(a[2])<3: slow[i]=slow.get(i,0)+1
                else: slow[i]=0
                if slow.get(i,0)>=3: print(k,"cart",i,a, "ev", await pg.evaluate("__game.fun.ev.name"))
        print("laps", await pg.evaluate("__game.carts.map(c=>(c.laps||[]).map(x=>+x.toFixed(1)))"))
asyncio.run(main())
