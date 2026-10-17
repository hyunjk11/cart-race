import _env  # noqa: F401  (base URL + ?debug=1)
import asyncio
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader"])
        pg = await b.new_page(viewport={"width":1280,"height":720})
        errs=[]
        pg.on("console", lambda m: errs.append(m.text) if m.type in("error","warning") else None)
        pg.on("pageerror", lambda e: errs.append("PAGEERR "+str(e)))
        await pg.goto("http://localhost:8080/")
        await pg.wait_for_timeout(4500)
        await pg.keyboard.down("ArrowUp")
        await pg.wait_for_timeout(2500)
        await pg.wait_for_timeout(2000)
        await pg.keyboard.down("Space"); await pg.wait_for_timeout(2500)
        info = await pg.evaluate("({s:__game.state, p:__game.carts.map(c=>[c.x.toFixed(1),c.z.toFixed(1),c.v.toFixed(1),c.lap,c.idx]), st:__game.stats, prods:__game.products.length})")
        print(info)
        await pg.screenshot(path="/workspace/cart-race/screenshot.png")
        print("ERRORS:", errs)
        await b.close()
asyncio.run(main())
