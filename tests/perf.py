import _env  # noqa: F401  (base URL + ?debug=1)
import asyncio, sys
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(args=["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader"])
        for name,opts in [("desktop",{"viewport":{"width":1280,"height":720}}),("iphone",{k:v for k,v in p.devices["iPhone 13"].items() if k!="default_browser_type"})]:
            c=await b.new_context(**opts); pg=await c.new_page(); errs=[]
            pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("console", lambda m: errs.append(m.text) if m.type=="error" else None)
            await pg.goto(sys.argv[1] if len(sys.argv)>1 else "http://localhost:8080/"); await pg.wait_for_function("window.__game")
            await pg.click("#startBtn", force=True); await pg.wait_for_timeout(9000)
            print(name, await pg.evaluate("__game.perf"), errs); await c.close()
        await b.close()
asyncio.run(main())
