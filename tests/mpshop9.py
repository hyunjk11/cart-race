import _env  # noqa: F401  (base URL + ?debug=1)
import asyncio, sys
from playwright.async_api import async_playwright
ARGS=["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader","--autoplay-policy=no-user-gesture-required"]
BASE = sys.argv[1] if len(sys.argv)>1 else "http://localhost:8080/"
O="/workspace/cart-race-shots/"
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=ARGS); errs={}
        async def ctx(name):
            c = await b.new_context(viewport={"width":1100,"height":650}); pg = await c.new_page(); errs[name]=[]
            pg.on("console", lambda m: errs[name].append(m.text) if m.type=="error" else None)
            pg.on("pageerror", lambda e: errs[name].append("PAGEERR "+str(e)+(e.stack or "")[:300]))
            return c, pg
        ca,A = await ctx("host"); cb,B = await ctx("guest")
        await A.goto(BASE+"?nointro"); await A.click("#mpBtn"); await A.fill("#nick","호스트"); await A.click("#createBtn")
        await A.wait_for_function("document.getElementById('roomCode').textContent.length>=4", timeout=30000)
        code = await A.text_content("#roomCode")
        await B.goto(BASE+"?nointro&room="+code)
        await A.wait_for_function("document.querySelectorAll('#slots .slot b').length>=2", timeout=40000)
        await A.click('#lobbyModes [data-mode="shop"]'); await A.click('#lobbyMaps [data-map="freezer"]')
        await B.wait_for_function("__game.GMODE==='shop' && __game.MAP==='freezer'", timeout=10000)
        print("guest mode", await B.evaluate("__game.GMODE"), "locked", await B.evaluate("[...document.querySelectorAll('#lobbyModes button')].every(b=>b.disabled)"), await B.text_content("#lobbyModeNote"))
        await A.click('#lobbyDiff [data-diff="hard"]')  # Batch C: bot difficulty is host-chosen and synced
        await B.wait_for_function("__game.diff==='hard'", timeout=10000)
        dl = await B.evaluate("[...document.querySelectorAll('#lobbyDiff button')].every(b=>b.disabled)")
        print("diff synced", await B.evaluate("__game.diff"), "guest locked", dl, "host saved", await A.evaluate("localStorage.getItem('cartDiff')"))
        assert dl and await A.evaluate("localStorage.getItem('cartDiff')") == 'hard'
        await B.screenshot(path=O+"mp-lobby9b.png")
        await B.click("#lobbyChar"); await B.click('#charRow [data-char="leo"]'); await B.click("#charOk")
        await A.click("#lobbyChar"); await A.click('#charRow [data-char="unni"]'); await A.click("#charOk")
        await asyncio.sleep(2); print("dbg", await B.evaluate("JSON.stringify([__game.NET.mode,__game.MYCHAR,localStorage.getItem('cartChar'),document.getElementById('charSel').className])"), await A.evaluate("JSON.stringify(__game.NET.slots)"))
        await A.wait_for_function("__game.NET.slots[1]&&__game.NET.slots[1].char==='leo'", timeout=10000)
        await B.wait_for_function("__game.NET.slots[0].char==='unni'", timeout=10000)
        await A.click("#addBot"); await asyncio.sleep(0.5)
        print("lobby slots (guest view)", (await B.inner_text("#slots")).replace("\n"," | "))
        await B.screenshot(path=O+"mp-lobby9.png")
        await B.click("#readyBtn")
        await A.wait_for_function("!document.getElementById('startRace').disabled", timeout=15000); await A.click("#startRace")
        for pg in (A,B): await pg.wait_for_function("__game.state==='race'", timeout=90000)
        await asyncio.sleep(1.5)
        hl=await A.evaluate("JSON.stringify(__game.carts.map(c=>__game.shop.S(c).list))"); gl=await B.evaluate("JSON.stringify(__game.carts.map(c=>__game.shop.S(c).list))")
        import json as _j; _h, _g = _j.loads(hl), _j.loads(gl); print("lists synced (active carts)", all(not g or g == h for h, g in zip(_h, _g)), gl); assert len({len(l) for l in _j.loads(gl) if l}) == 1, "list lengths differ"
        print("chars host", await A.evaluate("JSON.stringify(__game.carts.map(c=>[c.name,c.char]))"), "guest", await B.evaluate("JSON.stringify(__game.carts.map(c=>[c.name,c.char]))"))
        print("spots same", await A.evaluate("JSON.stringify(__game.shop.spots.map(s=>[s.k,+s.x.toFixed(1)]))")==await B.evaluate("JSON.stringify(__game.shop.spots.map(s=>[s.k,+s.x.toFixed(1)]))"))
        # guest drives onto a needed spot slowly
        await B.evaluate("(()=>{const g=__game,p=g.player,sh=g.shop;const s=sh.spots.find(s=>sh.need(p,s.k));p.x=s.x;p.z=s.z+0.5;p.v=1;window._k=s.k})()")
        await B.wait_for_function("__game.shop.got(__game.player)>=1", timeout=15000)
        print("guest pickup ok host sees", await A.evaluate("JSON.stringify(__game.shop.S(__game.carts[1]).items)"), "guest HUD", (await B.inner_text("#shopList")).replace("\n"," "))
        await asyncio.sleep(0.3); await B.screenshot(path=O+"mp-pickup9.png")
        # guest key-grab wrong item
        await B.evaluate("(()=>{const g=__game,p=g.player,sh=g.shop;const s=sh.spots.find(s=>!sh.S(p).list.includes(s.k));p.x=s.x+1;p.z=s.z;p.v=0})()"); await asyncio.sleep(0.4)
        await B.keyboard.press("KeyE"); await asyncio.sleep(1.2)
        print("guest wrong via key", await B.evaluate("JSON.stringify(__game.shop.S(__game.player).items.map(i=>[i.k,i.wrong]))"))
        # host-side hit on guest cart -> drop synced
        n0=await B.evaluate("__game.shop.S(__game.player).items.length")
        await A.evaluate("__game.shop.hit(__game.carts[1],'ram')"); await asyncio.sleep(1)
        print("guest items after host hit", n0, "->", await B.evaluate("__game.shop.S(__game.player).items.length"))
        await A.evaluate("__game.shop.spots[0].sale=15"); await asyncio.sleep(0.5)
        print("sale synced", await B.evaluate("__game.shop.spots[0].sale"))
        # complete lists for both humans (host-authoritative) and finish
        await A.evaluate("(()=>{const g=__game,sh=g.shop;for(const c of [g.carts[0],g.carts[1]]) for(const k of sh.S(c).list) if(!sh.has(c,k)) sh.S(c).items.push({k,sale:0,broken:0,wrong:0});})()")
        await B.wait_for_function("__game.shop.complete(__game.player)", timeout=10000)
        await A.evaluate("__game.debugNearFinish()"); await B.evaluate("__game.debugNearFinish()")
        await A.keyboard.down("ArrowUp"); await B.keyboard.down("ArrowUp")
        await A.wait_for_function("__game.player.finished && __game.carts[1].finished", timeout=60000); await asyncio.sleep(2)
        print("after humans finished: host spec", await A.evaluate("!!__game.spec"), "guest spec", await B.evaluate("!!__game.spec"), "results yet", await B.evaluate("__game.podium"), await B.inner_text("#specName"))
        await B.screenshot(path=O+"mp-spectate9.png")
        await A.evaluate("(()=>{const g=__game,sh=g.shop;for(const c of g.carts){if(c.inactive||c.finished)continue;for(const k of sh.S(c).list) if(!sh.has(c,k)) sh.S(c).items.push({k,sale:0,broken:0,wrong:0}); const q=g.path[g.N-4]; c.x=q.x;c.z=q.y;c.idx=g.N-4;c.lap=Math.max(c.lap,0);c.h=c.vd=Math.atan2(g.path[g.N-3].x-q.x,g.path[g.N-3].y-q.y);c.v=10;}})()")
        await B.wait_for_function("__game.podium", timeout=90000); await asyncio.sleep(1.5)
        print("ended at host raceT", await A.evaluate("__game.raceT.toFixed(1)"), "all finished", await A.evaluate("__game.carts.every(c=>c.inactive||c.finished)"))
        print("guest result", (await B.inner_text("#finBody")).replace("\n"," | ")[:260])
        await B.screenshot(path=O+"mp-podium9.png")
        await B.wait_for_selector("#mpLobby:not(.hidden)", timeout=30000)
        print("back in lobby; guest mode", await B.evaluate("__game.GMODE"))
        print("errors", errs); await b.close()
asyncio.run(main())
