import _env  # noqa: F401  (base URL + ?debug=1)
import asyncio
from playwright.async_api import async_playwright
ARGS=["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader"]
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(args=ARGS); errs=[]
        for name,ctxa,url in (("mobile7",dict(**p.devices["iPhone 13"]),"?map=skywalk"),("desktop7",dict(viewport={"width":1280,"height":720}),"?map=parking&q=low")):
            c=await b.new_context(**ctxa); pg=await c.new_page(); pg.on("console",lambda m: errs.append(m.text) if m.type=="error" else None); pg.on("pageerror",lambda e: errs.append(str(e)))
            await pg.goto("http://localhost:8080/"+url); await pg.wait_for_function("window.__game&&__game.N>0",timeout=30000)
            if name=="desktop7": await pg.evaluate("document.getElementById('quality')&&(document.getElementById('quality').value='low',document.getElementById('quality').dispatchEvent(new Event('change')))")
            await pg.click("#startBtn",force=True); await pg.wait_for_function("__game.state==='race'",timeout=90000); await asyncio.sleep(4)
            print(name, await pg.evaluate("JSON.stringify(__game.perf)"), "lowfx", await pg.evaluate("document.body.classList.contains('lowfx')"))
            await pg.screenshot(path="/workspace/cart-race-shots/"+name+".png"); await c.close()
        print("errors",errs); await b.close()
asyncio.run(main())
