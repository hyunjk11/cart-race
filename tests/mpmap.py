import _env  # noqa: F401  (base URL + ?debug=1)
import asyncio, sys
from playwright.async_api import async_playwright
ARGS=["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader","--autoplay-policy=no-user-gesture-required"]
BASE = sys.argv[1] if len(sys.argv)>1 else "http://localhost:8080/"
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=ARGS); errs={}
        async def ctx(name, opts={"viewport":{"width":1100,"height":650}}):
            c = await b.new_context(**opts); pg = await c.new_page(); errs[name]=[]
            pg.on("console", lambda m: errs[name].append(m.text) if m.type=="error" else None)
            pg.on("pageerror", lambda e: errs[name].append("PAGEERR "+str(e)))
            return c, pg
        ca,A = await ctx("host"); cb,B = await ctx("guest")
        await A.goto(BASE); await A.click("#mpBtn"); await A.fill("#nick","호스트"); await A.click("#createBtn")
        await A.wait_for_function("document.getElementById('roomCode').textContent.length>=4", timeout=30000)
        code = await A.text_content("#roomCode")
        await B.goto(BASE+"?room="+code)
        await A.wait_for_function("document.querySelectorAll('#slots .slot b').length>=2", timeout=40000)
        await A.click('#lobbyMaps [data-map="skywalk"]')
        await B.wait_for_function("__game.MAP==='skywalk'", timeout=10000)
        print("guest map after host select:", await B.evaluate("__game.MAP"), "guest cards disabled", await B.evaluate("[...document.querySelectorAll('#lobbyMaps button')].every(b=>b.disabled)"), "note", await B.text_content("#lobbyMapNote"))
        await B.screenshot(path="/workspace/cart-race-shots/map-lobby6.png")
        await A.click('#lobbyMaps [data-map="parking"]'); await B.wait_for_function("__game.MAP==='parking'", timeout=10000)
        await A.click("#addBot"); await B.click("#readyBtn")
        await A.wait_for_function("!document.getElementById('startRace').disabled", timeout=15000); await A.click("#startRace")
        for pg in (A,B): await pg.wait_for_function("__game.state==='race'", timeout=30000)
        for pg in (A,B): await pg.keyboard.down("ArrowUp")
        await asyncio.sleep(5)
        sa = await A.evaluate("[__game.MAP,__game.N,__game.strips.length,JSON.stringify(__game.strips.slice(0,12).map(s=>[s.x0,s.z0]))]")
        sb = await B.evaluate("[__game.MAP,__game.N,__game.strips.length,JSON.stringify(__game.strips.slice(0,12).map(s=>[s.x0,s.z0]))]")
        print("host", sa[:3], "guest", sb[:3], "identical layout", sa[3]==sb[3])
        print("traffic host", await A.evaluate("__game.traffic.map(t=>[+t.x.toFixed(1),+t.z.toFixed(1)])"), "guest", await B.evaluate("__game.traffic.map(t=>[+t.x.toFixed(1),+t.z.toFixed(1)])"))
        print("guest sees host cart", await B.evaluate("[+__game.carts[0].x.toFixed(1),+__game.carts[0].z.toFixed(1)]"), "host", await A.evaluate("[+__game.carts[0].x.toFixed(1),+__game.carts[0].z.toFixed(1)]"))
        await B.screenshot(path="/workspace/cart-race-shots/map-mp6.png")
        await A.evaluate("__game.debugNearFinish()"); await B.evaluate("__game.debugNearFinish()")
        await A.wait_for_selector("#finish:not(.hidden)", timeout=90000)
        await B.wait_for_selector("#mpLobby:not(.hidden)", timeout=25000)
        print("back in lobby, guest map", await B.evaluate("__game.MAP"))
        print("errors", errs); await b.close()
asyncio.run(main())
