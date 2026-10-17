import _env  # noqa: F401  (base URL + ?debug=1)
import asyncio, sys, json
from playwright.async_api import async_playwright
ARGS=["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader","--autoplay-policy=no-user-gesture-required"]
BASE = sys.argv[1] if len(sys.argv)>1 else "http://localhost:8080/"
OUT = sys.argv[2] if len(sys.argv)>2 else "/workspace/cart-race-shots/"
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=ARGS); errs={}
        async def ctx(name, opts={"viewport":{"width":1100,"height":650}}):
            c = await b.new_context(**opts); pg = await c.new_page(); errs[name]=[]
            pg.on("console", lambda m: errs[name].append(m.text) if m.type in("error",) else None)
            pg.on("pageerror", lambda e: errs[name].append("PAGEERR "+str(e)+" "+(e.stack or "")[:400]))
            return c, pg
        ca, A = await ctx("host"); cb, B = await ctx("guest"); cc, C = await ctx("guest2", dict({k:v for k,v in p.devices["iPhone 13"].items() if k!="default_browser_type"}))
        ev = lambda pg, e: pg.evaluate(e)
        await A.goto(BASE+"?scoop=1"); await A.click("#mpBtn"); await A.fill("#nick","호스트"); await A.click("#createBtn")
        await A.wait_for_function("document.getElementById('roomCode').textContent.length>=4", timeout=30000)
        code = await A.text_content("#roomCode"); print("room", code)
        await B.goto(BASE); await B.click("#mpBtn"); await B.fill("#nick","게스트1"); await B.fill("#joinCode", code); await B.click("#joinBtn")
        await C.goto(BASE+"?room="+code)   # invite link auto-join
        try:
            await A.wait_for_function("document.querySelectorAll('#slots .slot b').length>=3", timeout=40000)
        except Exception as e:
            print("JOINFAIL", errs, await B.text_content("#mpMsg"), await C.text_content("#mpMsg")); raise
        await A.click("#addBot")
        await A.wait_for_function("document.querySelectorAll('#slots .slot b').length===4")
        await B.click("#readyBtn"); await C.click("#readyBtn")
        await A.wait_for_function("!document.getElementById('startRace').disabled", timeout=15000)
        await A.screenshot(path=OUT+"lobby5.png")
        lobbyB = await B.inner_text("#slots"); print("guest lobby view:", lobbyB.replace("\n"," | "))
        await A.click("#startRace")
        for pg in (A,B,C): await pg.wait_for_function("__game.state==='race'", timeout=90000)
        print("modes", [await ev(pg,"__game.MODE") for pg in (A,B,C)])
        for pg in (A,B,C): await pg.keyboard.down("ArrowUp")
        await C.evaluate("__game.keys.ArrowUp=true")
        await asyncio.sleep(6)
        hostView = await ev(A,"__game.carts.map(c=>[c.name,+c.x.toFixed(1),+c.z.toFixed(1),c.remote?'remote':c.ai?'bot':c.inactive?'off':'me'])")
        guestView = await ev(B,"__game.carts.map(c=>[c.name,+c.x.toFixed(1),+c.z.toFixed(1),c.net?'net':'me'])")
        print("host view ", hostView); print("guest view", guestView)
        cuA = await ev(A,"__game.customers.slice(0,3).map(c=>[+c.holder.position.x.toFixed(1),+c.holder.position.z.toFixed(1)])")
        cuB = await ev(B,"__game.customers.slice(0,3).map(c=>[+c.holder.position.x.toFixed(1),+c.holder.position.z.toFixed(1)])")
        print("customers host", cuA, "guest", cuB)
        await B.screenshot(path=OUT+"mp-race5-start.png")
        # item over network: give guest cart an item on host, guest uses it
        await ev(A,"__game.carts[1].item='shield'"); await asyncio.sleep(0.5)
        print("guest sees item", await ev(B,"__game.player.item")); await B.keyboard.press("e"); await asyncio.sleep(0.8)
        print("host: guest shield active", await ev(A,"__game.carts[1].shieldT>0"))
        G1="__game.carts[1]"
        async def gv(e): return await ev(B, e)
        # wet-floor sign right in front of guest -> guest slows locally
        await ev(A,f"(()=>{{const c={G1};__game.fun.addHazard('sign',c.x+Math.sin(c.vd)*3.5,c.z+Math.cos(c.vd)*3.5,30,1.0,null)}})()")
        v0=await gv("__game.player.v"); await asyncio.sleep(1.2); v1=await gv("__game.player.v"); print("sign: guest v", round(v0,1),"->",round(v1,1), "signs hit", await gv("__game.fun.hazards.filter(h=>h.type==='sign'&&h.gone).length"))
        await ev(A,f"(()=>{{const c={G1};__game.fun.addHazard('puddle',c.x+Math.sin(c.vd)*2,c.z+Math.cos(c.vd)*2,10,3.5,null)}})()"); await asyncio.sleep(0.8)
        print("puddle: guest slipT", round(await gv("__game.player.slipT||0"),2))
        await ev(A,f"{G1}.shieldT=0"); await asyncio.sleep(0.3)
        await ev(A,f"(()=>{{const c={G1};__game.fun.addHazard('banana',c.x+Math.sin(c.vd)*4.5,c.z+Math.cos(c.vd)*4.5,30,1.2,null)}})()")
        await B.wait_for_function("__game.player.spin>0", timeout=8000); print("banana: guest spun (predicted)", await gv("!!__game.player.predHitAt"))
        await A.keyboard.up("ArrowUp"); await ev(A,"__game.player.v=0"); await asyncio.sleep(2.0)
        gp=await gv("[__game.player.x,__game.player.z]"); await ev(A,f"(()=>{{const p=__game.player;p.x={gp[0]}+18;p.z={gp[1]}-5;p.v=0}})()"); await asyncio.sleep(0.4)
        d0=await gv("Math.abs(__game.player.z-__game.carts[0].z)")
        await ev(A,f"{G1}.magnetT=3;{G1}.magTarget=__game.carts[0]"); await asyncio.sleep(1.5)
        d1=await gv("Math.abs(__game.player.z-__game.carts[0].z)"); print("magnet: guest lateral gap to host", round(d0,1),"->",round(d1,1), "guest magnetT>0", await gv("__game.player.magnetT>0")); await A.keyboard.down("ArrowUp")
        await ev(A,f"(()=>{{const g=__game;for(let k=0;k<2;k++){{const i=g.customers.findIndex(c=>c.state==='walk');g.knock(i,{G1})}}}})()"); await asyncio.sleep(0.8)
        print("riders: host", await ev(A,f"{G1}.riders.length"), "guest HUD", await gv("document.getElementById('riders').textContent"),
              "guest rider dist to own cart", await gv("__game.customers.filter(c=>c.state==='ride').map(c=>+Math.hypot(c.holder.position.x-__game.player.x,c.holder.position.z-__game.player.z).toFixed(2))"))
        await ev(B,"(()=>{const p=__game.player;p.x=10;p.z=-26.2;p.h=p.vd=0;p.v=15;p.spin=0})()"); await asyncio.sleep(1.0)
        print("guest shelf crash -> host riders", await ev(A,f"{G1}.riders.length"), "guest riderN", await gv("__game.player.riderN"))
        await B.screenshot(path=OUT+"mp-race5.png")
        # disconnect guest2 -> replaced by bot
        await cc.close(); await asyncio.sleep(8)
        print("after guest2 left, host slot2:", await ev(A,"[__game.carts[2].name,__game.carts[2].ai,__game.carts[2].remote]"))
        # finish both humans
        await ev(A,"__game.debugNearFinish()"); await ev(B,"__game.debugNearFinish()")
        await A.wait_for_selector("#finish:not(.hidden)", timeout=90000); await B.wait_for_selector("#finish:not(.hidden)", timeout=90000)
        print("results host:", (await A.inner_text("#finBody")).replace("\n"," | "))
        print("results guest:", (await B.inner_text("#finBody")).replace("\n"," | "))
        await B.wait_for_selector("#mpLobby:not(.hidden)", timeout=20000); await A.wait_for_selector("#mpLobby:not(.hidden)", timeout=20000)
        print("back to lobby states", await ev(A,"__game.state"), await ev(B,"__game.state"))
        # host leaves -> guest gets message
        # host leaves -> (E3) the remaining guest takes over the room as the new host, same room code
        await ca.close(); await B.wait_for_function("__game.NET.mode==='host'", timeout=40000)
        print("after host left: guest is new host of", await B.text_content("#roomCode"), "(was", code + ")", "| chat:", (await B.inner_text("#chatLog")).split("\n")[-1])
        print("ERRORS", json.dumps(errs, ensure_ascii=False))
        await b.close()
asyncio.run(main())
