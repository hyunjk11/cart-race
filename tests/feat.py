import _env  # noqa: F401  (base URL + ?debug=1)
import asyncio, sys, time
from playwright.async_api import async_playwright
ARGS=["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader"]
BASE = sys.argv[1] if len(sys.argv)>1 else "http://localhost:8080/"
async def page(b, url, errs):
    c=await b.new_context(viewport={"width":800,"height":450}); pg=await c.new_page()
    pg.on("console", lambda x: errs.append(x.text) if x.type=="error" else None)
    pg.on("pageerror", lambda e: errs.append("PAGEERR "+str(e)+" "+(e.stack or "")[:300]))
    await pg.goto(url); await pg.wait_for_function("window.__game&&__game.N>0"); return c,pg
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=ARGS); errs=[]
        c,pg = await page(b, BASE, errs); ev=pg.evaluate
        # map switching in title + leak check
        g=[]
        for m in ["freezer","parking","skywalk","mart","freezer","parking","skywalk","mart"]:
            await pg.click(f'#mapRow [data-map="{m}"]'); await asyncio.sleep(0.6)
            g.append((m, await ev("[__game.MAP,__game.N,__game.strips.length,__game.perf.geos,__game.perf.tex,__game.customers.filter(c=>__game.insideShelf(c.x,c.z)).length]")))
        print("switch", g)
        print("selected card", await ev("document.querySelector('#mapRow .sel').dataset.map"), "stored", await ev("localStorage.cartMap"))
        await c.close()
        # freezer: ice + doors
        c,pg = await page(b, BASE+"?map=freezer", errs); ev=pg.evaluate
        await pg.click("#startBtn", force=True); await pg.wait_for_function("__game.state==='race'")
        await ev("(()=>{const p=__game.player;p.x=10;p.z=-30;p.h=p.vd=Math.PI/2;p.v=10})()"); await pg.keyboard.down("ArrowUp"); await asyncio.sleep(0.4)
        print("freezer ice slipT", await ev("__game.player.slipT"), "zone", await ev("JSON.stringify(__game.player.lastZone&&__game.player.lastZone.t)"))
        opens=set()
        for k in range(12):
            await asyncio.sleep(0.5); opens.add(await ev("__game.trk.doors.filter(d=>!d.strip.off).length"))
        print("freezer open door counts seen", sorted(opens))
        # drive into an open door
        r = await ev("""(async()=>{const g=__game; for(let t=0;t<40;t++){const d=g.trk.doors.find(d=>!d.strip.off); if(d){const s=d.strip,p=g.player; const cx=(s.x0+s.x1)/2,cz=(s.z0+s.z1)/2; const ax=(s.x1-s.x0)<(s.z1-s.z0)?0:1; // door strip long axis = across aisle
            p.x=cx+(ax? 0: -5)*1; p.z=cz+(ax? -5:0); p.h=p.vd=Math.atan2(cx-p.x,cz-p.z); p.v=12; p.spin=0; return [cx,cz]} await new Promise(r=>setTimeout(r,200))} return null})()""")
        await asyncio.sleep(0.8); print("door crash msg", await pg.text_content("#msg"), "pos", r, "cart inside", await ev("__game.insideShelf(__game.player.x,__game.player.z)"))
        await c.close()
        # parking: bump, traffic, ramp
        c,pg = await page(b, BASE+"?map=parking", errs); ev=pg.evaluate
        await pg.click("#startBtn", force=True); await pg.wait_for_function("__game.state==='race'"); await pg.keyboard.down("ArrowUp")
        await ev("(()=>{const p=__game.player;p.x=19;p.z=-36;p.h=p.vd=Math.PI/2;p.v=13})()"); await asyncio.sleep(0.9)
        print("parking bump count", await ev("__game.player.bumps"), "v", round(await ev("__game.player.v"),1))
        await ev("(()=>{const p=__game.player;p.x=60;p.z=-26;p.h=p.vd=0;p.v=12})()"); ys=[]
        for k in range(10): await asyncio.sleep(0.3); ys.append(round(await ev("__game.player.g.root.position.y"),2))
        print("parking ramp heights", ys)
        T = await ev("(()=>{const T=__game.traffic[0];const p=__game.player;p.x=T.x+Math.sin(T.h)*6;p.z=T.z+Math.cos(T.h)*6;p.h=p.vd=T.h+Math.PI;p.v=6;return [T.x,T.z]})()")
        await asyncio.sleep(1.2); print("traffic hit msg", await pg.text_content("#msg"), "dist", round(await ev("Math.hypot(__game.traffic[0].x-__game.player.x,__game.traffic[0].z-__game.player.z)"),2))
        await c.close()
        # skywalk: walkway boost + shortcut
        c,pg = await page(b, BASE+"?map=skywalk", errs); ev=pg.evaluate
        await pg.click("#startBtn", force=True); await pg.wait_for_function("__game.state==='race'"); await pg.keyboard.down("ArrowUp")
        await ev("(()=>{const p=__game.player;p.x=50;p.z=-20;p.h=p.vd=0;p.v=9;p.idx=__game.path.reduce((b,q,i,a)=>Math.hypot(q.x-50,q.y+20)<Math.hypot(a[b].x-50,a[b].y+20)?i:b,0)})()")
        vs=[]
        for k in range(8): await asyncio.sleep(0.35); vs.append((round(await ev("__game.player.v"),1), round(await ev("__game.player.g.root.position.y"),2)))
        print("walkway v,y", vs)
        start = await ev("(()=>{const g=__game,p=g.player;p.x=30;p.z=28;p.h=p.vd=-Math.PI/2;p.v=12;p.spin=0;let b=0;g.path.forEach((q,i)=>{if(Math.hypot(q.x-30,q.y-28)<Math.hypot(g.path[b].x-30,g.path[b].y-28))b=i});p.idx=b;return [b,p.lap]})()")
        tr=[]
        for k in range(16):
            await asyncio.sleep(0.4); tr.append(await ev("[+__game.player.x.toFixed(1),+__game.player.z.toFixed(1),__game.player.idx,__game.player.lap,+__game.player.g.root.position.y.toFixed(1)]"))
        print("shortcut start", start, "trace", tr)
        await c.close()
        print("errors", errs[:8]); await b.close()
asyncio.run(main())
