import _env  # noqa: F401  (base URL + ?debug=1)
import asyncio, sys, time
from playwright.async_api import async_playwright
ARGS=["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader"]
BASE=sys.argv[1] if len(sys.argv)>1 else "http://localhost:8080/"
VIS="(()=>{const e=document.getElementById('pa');const s=getComputedStyle(e);return s.visibility==='visible'&&+s.opacity>0.05})()"
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(args=ARGS); ok=True; errs=[]
        for dev in ("mobile","desktop"):
            c=await b.new_context(**p.devices["Galaxy S9+"]) if dev=="mobile" else await b.new_context(viewport={"width":1100,"height":650})
            pg=await c.new_page(); ev=pg.evaluate; pg.on("pageerror",lambda e: errs.append(str(e)))
            await pg.goto(BASE+"?map=freezer&nointro"); await pg.wait_for_function("window.__game&&__game.N>0",timeout=30000)
            print(dev,"idle visible:", await ev(VIS))
            for typ in ("single","burst"):
                await ev("__game.paHide()"); await asyncio.sleep(0.6)
                n = 1 if typ=="single" else 5
                for k in range(n): await ev(f"__game.pa('현재 1위는 노랑 카트 고객님입니다! #{k}')")
                await ev("__game.announce('테스트 이벤트'); __game.flash('테스트 메시지')")
                t0=time.time(); seen=False; runs=[]; cur=None
                while time.time()-t0 < (6 if typ=='single' else 15):
                    v=await ev(VIS)
                    if v and cur is None: cur=time.time()
                    if not v and cur is not None: runs.append(round(time.time()-cur,1)); cur=None
                    seen = seen or v
                    await asyncio.sleep(0.2)
                ev_vis=await ev("document.getElementById('event').classList.contains('show')"); msg=await ev("document.getElementById('msg').textContent")
                box=await ev("JSON.stringify(document.getElementById('pa').getBoundingClientRect())") if False else None
                stuck = cur is not None
                print(dev,typ,"shown",seen,"durations",runs,"stuck",stuck,"event stuck",ev_vis,"msg stuck",bool(msg))
                ok = ok and seen and not stuck and all(r<=4.2 for r in runs) and not ev_vis and not msg
            await ev("__game.pa('위치 확인용 배너')"); await asyncio.sleep(0.8)
            r=await ev("(()=>{const r=document.getElementById('pa').getBoundingClientRect();return [Math.round(r.top),Math.round(r.height),innerHeight]})()")
            print(dev,"banner rect top/height/vh", r); await pg.screenshot(path=f"/workspace/cart-race-shots/banner-{dev}9.png")
            await c.close()
        print("BANNER TEST", "PASS" if ok else "FAIL", errs[:3]); await b.close()
asyncio.run(main())
