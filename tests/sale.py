"""📢 세일 방송 item: back-of-pack odds only, the player using it summons a customer line in front of the leader (not the user),
the crowd arrives and blocks, sign + snapshot entry, everything clears after SALE.dur. Saves desktop + mobile screenshots.
usage: python3 tests/sale.py [BASE_URL]"""
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
    await pg.wait_for_function("window.__game && __game.fun && __game.mgr", timeout=150000)
    await pg.evaluate("__game.startGame()")
    await pg.wait_for_function("__game.state==='race'", timeout=150000)
    await pg.evaluate("__game.mgr.st.cd=1e9")
    return ctx, pg, errs
CROWD = """(()=>{const g=__game,s=g.fun.sales[0];if(!s)return null;const cs=g.customers||[];
  const r=cs.filter(c=>c.rush);return {n:r.length,near:r.filter(c=>Math.hypot(c.x-s.x,c.z-s.z)<9).length,T:g.carts.indexOf(s.T)};})()"""
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
        ctx, pg, errs = await race(b, {"width": 1280, "height": 720})
        odds = await pg.evaluate("(()=>{const k=Object.keys(__game.fun.ITEMS).indexOf('sale');return [__game.itemOdds(0)[k],__game.itemOdds(1)[k]];})()")
        check(odds[0] == 0 and odds[1] > 0.1, f"sale item: never for the leader, common at the back {odds}")
        # the user (pushed to last) uses it -> crowd in front of the leading bot
        await pg.evaluate("(()=>{const g=__game,P=g.player;P.item='sale';P.useItem=true;})()")
        await pg.wait_for_function("__game.fun.sales.length>0", timeout=15000)
        info = await pg.evaluate("(()=>{const g=__game,s=g.fun.sales[0];return {T:g.carts.indexOf(s.T),n:s.n,snap:g.fun.snap().sl.length,item:g.player.item};})()")
        check(info["T"] != 0 and info["n"] >= 6 and info["snap"] == 1 and info["item"] is None, f"player's 세일 방송 targets the leading bot, crowd + snapshot {info}")
        await pg.evaluate("for(const s of [...__game.fun.sales]) s.t=0")
        await pg.wait_for_function("__game.fun.sales.length===0", timeout=15000)
        # now the user leads; a bot's broadcast puts the line in front of the user (visible to the camera)
        await pg.evaluate("(()=>{const g=__game;g.player.lap+=1;})()")
        await pg.wait_for_timeout(300)
        await pg.evaluate("__game.fun.saleCrowd(__game.carts[1])")
        await pg.wait_for_function("__game.fun.sales.length>0", timeout=15000)
        c0 = await pg.evaluate(CROWD)
        check(c0 and c0["T"] == 0 and c0["n"] >= 6, f"bot broadcast targets the leading user {c0}")
        await pg.wait_for_function("(()=>{const s=__game.fun.sales[0];return s&&s.t<SALE_DUR-2.5})()".replace("SALE_DUR", "7.5"), timeout=30000)
        c1 = await pg.evaluate(CROWD)
        await pg.evaluate("""(()=>{const g=__game,P=g.player,s=g.fun.sales[0];let dx=s.x-P.x,dz=s.z-P.z;const l=Math.hypot(dx,dz)||1;dx/=l;dz/=l;
          P.x=s.x-dx*13;P.z=s.z-dz*13;P.h=P.vd=Math.atan2(dx,dz);P.v=0;window.__pk=setInterval(()=>{P.v=0;},16);})()""")
        await pg.wait_for_timeout(700)
        await pg.screenshot(path=f"{SHOTS}/roundI-desktop-sale.png")
        await pg.evaluate("clearInterval(window.__pk)")
        check(c1 and c1["near"] >= 5, f"customers lined up across the track {c1}")
        await pg.wait_for_function("__game.fun.sales.length===0", timeout=40000)
        left = await pg.evaluate("(__game.customers||[]).filter(c=>c.rush).length")
        check(left == 0, f"crowd disperses after the sale {left}")
        await pg.evaluate("__game.player.lap-=1")
        check(not errs, f"no console errors desktop {errs}")
        await ctx.close()
        ctx, pg, errs = await race(b, {"width": 390, "height": 844}, True)
        await pg.evaluate("(()=>{const g=__game;g.player.lap+=1;})()")
        await pg.wait_for_timeout(300)
        await pg.evaluate("__game.fun.saleCrowd(__game.carts[2])")
        await pg.wait_for_function("(()=>{const s=__game.fun.sales[0];return s&&s.t<5})()", timeout=30000)
        await pg.evaluate("""(()=>{const g=__game,P=g.player,s=g.fun.sales[0];let dx=s.x-P.x,dz=s.z-P.z;const l=Math.hypot(dx,dz)||1;dx/=l;dz/=l;
          P.x=s.x-dx*13;P.z=s.z-dz*13;P.h=P.vd=Math.atan2(dx,dz);P.v=0;window.__pk=setInterval(()=>{P.v=0;},16);})()""")
        await pg.wait_for_timeout(700)
        await pg.screenshot(path=f"{SHOTS}/roundI-mobile-sale.png")
        check(not errs, f"no console errors mobile {errs}")
        await ctx.close()
        await b.close()
    print("SHOTS", SHOTS)
    if not ok_all: _env.fail("sale test")
asyncio.run(main())
