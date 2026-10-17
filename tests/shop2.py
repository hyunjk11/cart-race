import _env  # noqa: F401  (base URL + ?debug=1)
import asyncio, sys
from playwright.async_api import async_playwright
ARGS=["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader"]
BASE=sys.argv[1] if len(sys.argv)>1 else "http://localhost:8080/"
O="/workspace/cart-race-shots/"
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(args=ARGS); errs=[]
        for dev in ("desk","mob"):
            ctx=await b.new_context(viewport={"width":1100,"height":650}) if dev=="desk" else await b.new_context(**p.devices["iPhone 13"])
            pg=await ctx.new_page(); ev=pg.evaluate
            pg.on("console",lambda x: errs.append(x.text) if x.type=="error" else None); pg.on("pageerror",lambda e: errs.append("PE "+str(e)+" "+(e.stack or "")[:300]))
            await pg.goto(BASE+"?map=mart&nointro"); await pg.wait_for_function("window.__game&&__game.N>0",timeout=30000); await asyncio.sleep(1)
            await pg.click("[data-mode=shop]"); await asyncio.sleep(0.5)
            print(dev,"mode", await ev("__game.GMODE"), await ev("localStorage.getItem('cartMode')"))
            if dev=="desk": await pg.screenshot(path=O+"title-mode8.png")
            await pg.click("#startBtn",force=True); await pg.wait_for_function("__game.state==='race'",timeout=60000)
            # put player right before the first needed spot, slow
            await ev("""(()=>{const g=__game,p=g.player,sh=g.shop;const s=sh.spots.find(s=>sh.need(p,s.k)); const [tx,tz]=[Math.sin(0),1];
              const i=(s.i-3+g.N)%g.N, q=g.path[i]; p.x=s.x-(g.path[s.i].x-q.x); p.z=s.z-(g.path[s.i].y-q.y); p.h=p.vd=Math.atan2(s.x-p.x,s.z-p.z); p.v=5; window._s=s; s.sale=15;})()""")
            await pg.keyboard.down("ArrowUp"); await asyncio.sleep(0.3); await pg.keyboard.up("ArrowUp")
            await pg.wait_for_function("__game.shop.got(__game.player)>=1",timeout=20000); await asyncio.sleep(0.25)
            print(dev,"picked", await ev("JSON.stringify(__game.shop.S(__game.player))"))
            await pg.screenshot(path=O+("pickup8.png" if dev=="desk" else "mobile-shop8.png"))
            if dev=="mob": await ctx.close(); continue
            # grab more by teleporting onto needed spots
            for k in range(3):
                await ev("(()=>{const g=__game,p=g.player,sh=g.shop;const s=sh.spots.find(s=>sh.need(p,s.k)&&!(s.cool.get(p)>0));if(!s)return;p.x=s.x;p.z=s.z;p.v=2;})()"); await asyncio.sleep(0.6)
            await ev("(()=>{const g=__game,p=g.player,sh=g.shop;if(!sh.has(p,'egg')){const s=sh.spots.find(s=>s.k==='egg');sh.grab(p,s,true)}})()"); await asyncio.sleep(0.4)
            await asyncio.sleep(1.5)
            await pg.screenshot(path=O+"list-hud8.png")
            before=await ev("JSON.stringify(__game.shop.S(__game.player).items)")
            await ev("(()=>{const p=__game.player;__game.fun.addHazard('banana',p.x+Math.sin(p.vd)*2.5,p.z+Math.cos(p.vd)*2.5,30,1.2,null);p.v=8})()")
            await pg.keyboard.down("ArrowUp"); await asyncio.sleep(1.2); await pg.keyboard.up("ArrowUp")
            after=await ev("JSON.stringify(__game.shop.S(__game.player).items)")
            print("banana hit items", before, "->", after, "spin", await ev("__game.player.hitSeq"))
            await pg.screenshot(path=O+"drop8.png")
            # wrong item via key
            await ev("(()=>{const g=__game,p=g.player,sh=g.shop;const s=sh.spots.find(s=>!sh.S(p).list.includes(s.k));p.x=s.x+1;p.z=s.z;p.v=0;p.useItem=true;})()"); await asyncio.sleep(0.5)
            print("wrong", await ev("JSON.stringify(__game.shop.S(__game.player).items.filter(i=>i.wrong))"))
            # complete & finish
            await ev("(()=>{const g=__game,p=g.player,sh=g.shop;for(const k of sh.S(p).list) if(!sh.has(p,k)) sh.S(p).items.push({k,sale:0,broken:0,wrong:0});})()")
            await ev("__game.debugNearFinish()"); await pg.keyboard.down("ArrowUp")
            await pg.wait_for_function("__game.player.finished",timeout=30000); await ev("__game.specFF()")  # after checkout you spectate the bots: fast-forward
            await pg.wait_for_function("__game.podium",timeout=120000); await pg.keyboard.up("ArrowUp"); await asyncio.sleep(1.5)
            print("hud hidden", await ev("getComputedStyle(document.getElementById('hud')).display+','+getComputedStyle(document.getElementById('shopHud')).display"))
            await pg.screenshot(path=O+"receipt8.png"); await ctx.close()
        print("errors", errs); await b.close()
asyncio.run(main())
