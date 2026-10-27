"""Round I: 점장 (store manager) throws + catch-up helpers. Solo race with debug hooks:
forced throws hit a parked player (overlay + effect), shield blocks, auto visit only for a runaway leader,
slipstream behind a bot, rank-scaled gauge, MP part stats at 50%. Saves screenshots (desktop + mobile) to SHOTS.
usage: python3 tests/manager.py [BASE_URL]"""
import _env  # noqa: F401
import asyncio, os, sys
from playwright.async_api import async_playwright
BASE = sys.argv[1] if len(sys.argv) > 1 else _env.BASE
SHOTS = os.environ.get('SHOTS', '/workspace/cart-race-shots' if os.path.isdir('/workspace/cart-race-shots') else __import__('tempfile').gettempdir())
ok_all = True
def check(c, what):
    global ok_all
    print(('ok   ' if c else 'FAIL ') + what)
    if not c: ok_all = False
async def race(b, vp, mobile=False):
    ctx = await b.new_context(viewport=vp, is_mobile=mobile, has_touch=mobile)
    pg = await ctx.new_page()
    errs = []
    pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    pg.on("pageerror", lambda e: errs.append("PAGEERR " + str(e)))
    await pg.goto(BASE + "?nointro&map=mart")
    await pg.wait_for_function("window.__game && __game.mgr", timeout=150000)
    await pg.evaluate("__game.startGame()")
    await pg.wait_for_function("__game.state==='race'", timeout=150000)
    return ctx, pg, errs
PARK = "(()=>{const p=__game.player;p.v=0;const x=p.x,z=p.z;clearInterval(window.__park);window.__park=setInterval(()=>{p.v=0;p.x=x;p.z=z;},16);})()"
async def wait_throw_done(pg, t=15000):
    await pg.wait_for_function("!__game.mgr.visible && __game.mgr.projs.length===0", timeout=t)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
        ctx, pg, errs = await race(b, {"width": 1280, "height": 720})
        # --- auto trigger: close race -> no visit
        await pg.evaluate("__game.mgr.st.cd=0")
        await pg.wait_for_timeout(1200)
        s = await pg.evaluate("__game.mgr.st.stats")
        check(s["visits"] == 0, f"close race at the start: no manager visit {s}")
        # --- forced throw at the parked player -> hit + overlay
        await pg.evaluate("__game.mgr.st.cd=999")
        await pg.evaluate(PARK)
        await pg.evaluate("__game.mgr.force('sticker',0,1)")
        await pg.wait_for_function("__game.mgr.projs.length>0", timeout=15000)
        await pg.wait_for_timeout(500)
        await pg.screenshot(path=f"{SHOTS}/roundI-desktop-throw.png")
        info = await pg.evaluate("({vis:__game.mgr.visible, pj:__game.mgr.projs, pos:__game.mgr.pos})")
        check(info["vis"] and info["pj"] and info["pj"][0]["ti"] == 0, f"manager visible + projectile aimed at player {info}")
        await pg.wait_for_function("__game.mgr.st.stats.hits>=1", timeout=15000)
        await pg.wait_for_timeout(250)
        await pg.screenshot(path=f"{SHOTS}/roundI-desktop-hit-sticker.png")
        ov = await pg.evaluate("({cls:document.getElementById('mgfx').dataset.last, n:+document.getElementById('mgfx').dataset.n, ov:__game.player.mgOv&&__game.player.mgOv.type})")
        check(ov["cls"] == "sticker" and ov["n"] >= 5 and ov["ov"] == "sticker", f"sticker overlay on screen {ov}")
        await wait_throw_done(pg)
        # --- watermelon: cart slowed while carrying it
        await pg.evaluate(PARK)
        await pg.evaluate("__game.mgr.force('melon',0,1)")
        await pg.wait_for_function("__game.player.melonT>0", timeout=15000)
        await pg.wait_for_timeout(300)
        await pg.screenshot(path=f"{SHOTS}/roundI-desktop-hit-melon.png")
        check(True, "watermelon hit -> melonT set")
        await wait_throw_done(pg)
        # --- shield blocks
        await pg.evaluate("(()=>{const p=__game.player;p.v=0;p.shieldT=10;p.spin=0;})()")
        b0 = await pg.evaluate("__game.mgr.st.stats.blocks")
        await pg.evaluate("__game.mgr.force('fish',0,1)")
        await pg.wait_for_function(f"__game.mgr.st.stats.blocks>{b0}", timeout=15000)
        sh = await pg.evaluate("({sh:__game.player.shieldT||0, spin:__game.player.spin||0})")
        check(sh["sh"] <= 0 and sh["spin"] <= 0, f"shield blocks the fish and is used up {sh}")
        await wait_throw_done(pg)
        # --- the other throwables land (hit or miss) without errors
        for ty in ["mop", "chicken", "tissue"]:
            await pg.evaluate(PARK)
            h0 = await pg.evaluate("__game.mgr.st.stats.hits+__game.mgr.st.stats.misses")
            await pg.evaluate(f"__game.mgr.force('{ty}',0,1)")
            await pg.wait_for_function(f"__game.mgr.st.stats.hits+__game.mgr.st.stats.misses>{h0}", timeout=15000)
            if ty == "tissue":
                await pg.wait_for_timeout(300)
                await pg.screenshot(path=f"{SHOTS}/roundI-desktop-hit-tissue.png")
            await wait_throw_done(pg)
        check(True, "mop / rubber chicken / tissue land")
        # --- runaway leader: player a lap ahead -> automatic visit targeting the player
        n0 = await pg.evaluate("__game.mgr.st.stats.visits")
        await pg.evaluate("(()=>{__game.player.lap+=1;__game.mgr.st.cd=0;})()")
        await pg.wait_for_function(f"__game.mgr.st.stats.visits>{n0}", timeout=15000)
        await pg.wait_for_function("(()=>{const l=__game.mgr.st.log;const sh=l.filter(e=>e[1]==='show').pop();return sh&&l.some(e=>e[1]==='throw'&&e[0]>sh[0]);})()", timeout=20000)
        first = await pg.evaluate("(()=>{const l=__game.mgr.st.log;const sh=l.filter(e=>e[1]==='show').pop();return l.find(e=>e[1]==='throw'&&e[0]>sh[0]);})()")
        check(first and first[-1] == 0, f"auto visit: first throw targets the runaway leader (cart 0) {first}")
        cd = await pg.evaluate("__game.mgr.st.cd")
        check(cd >= 10, f"cooldown after a visit {cd:.1f}s")
        await pg.evaluate("__game.player.lap-=1")
        await pg.evaluate("clearInterval(window.__park)")
        # --- slipstream: player tucked behind the fastest bot
        await wait_throw_done(pg, 20000)
        ds = await pg.evaluate("""(async()=>{const g=__game,p=g.player;let best=0;
          for(let k=0;k<50;k++){const o=g.carts.filter(c=>c!==p&&!c.inactive&&!c.finished).sort((a,b)=>b.v-a.v)[0];p.spin=0;p.melonT=0;
            const fx=Math.sin(o.h),fz=Math.cos(o.h);p.x=o.x-fx*5;p.z=o.z-fz*5;p.h=p.vd=o.h;p.v=Math.max(12,o.v);p.idx=o.idx;
            await new Promise(r=>setTimeout(r,60));if(p.draft)best++;}
          return {best,total:p.draftTotal||0};})()""")
        check(ds["best"] >= 5 and ds["total"] > 0.3, f"slipstream kicks in behind a cart {ds}")
        if ds["best"]:
            await pg.screenshot(path=f"{SHOTS}/roundI-desktop-slipstream.png")
        rk = await pg.evaluate("__game.carts.filter(c=>!c.inactive).map(c=>+(c.rankT||0).toFixed(2)).sort()")
        check(rk[0] == 0 and rk[-1] == 1, f"rank fraction 0 (leader)..1 (last) for gauge help {rk}")
        # --- MP fairness: parts count at 50%
        pm = await pg.evaluate("""(()=>{const g=__game,lo={wheel:'offroad',body:'carbon',handle:'wheel',boost:'rocketb'};
          g.setParts(2,lo,true);const a=g.cartInfo(2).pm;g.setParts(2,lo,0.5);const h=g.cartInfo(2).pm;return {a,h};})()""")
        a, h = pm["a"], pm["h"]
        check(all(abs((h[k] - 1) - (a[k] - 1) * 0.5) < 1e-9 for k in a), f"parts stats at 50% {pm}")
        check(not errs, f"no console errors desktop {errs}")
        await ctx.close()
        # --- mobile
        ctx, pg, errs = await race(b, {"width": 390, "height": 844}, True)
        await pg.evaluate("__game.mgr.st.cd=999")
        await pg.evaluate(PARK)
        for attempt in range(3):
            await pg.evaluate("__game.mgr.force('fish',0,1)")
            await pg.wait_for_function("__game.mgr.projs.length>0", timeout=15000)
            await pg.wait_for_timeout(600)
            await pg.screenshot(path=f"{SHOTS}/roundI-mobile-throw.png")
            await pg.wait_for_function("(()=>{const s=__game.mgr.st.stats;return s.hits>=1||(s.misses+s.blocks>0&&__game.mgr.projs.length===0)})()", timeout=25000)
            if await pg.evaluate("__game.mgr.st.stats.hits>=1"): break
            await wait_throw_done(pg, 20000)
        await pg.wait_for_timeout(200)
        await pg.screenshot(path=f"{SHOTS}/roundI-mobile-hit.png")
        sp = await pg.evaluate("__game.player.spin")
        check(sp > 0, f"mobile: frozen mackerel spins the cart {sp}")
        check(not errs, f"no console errors mobile {errs}")
        await ctx.close()
        await b.close()
    print("SHOTS", SHOTS)
    if not ok_all: _env.fail("manager test")
asyncio.run(main())
