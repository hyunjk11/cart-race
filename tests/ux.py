import _env  # noqa: F401  (base URL + ?debug=1)
_env.TUTORIAL = True
"""Batch B UX features: tips, help panel (pause, tabs, key remap, reduced motion), standings, shopping tutorial,
slide-to-steer D-pad, joystick, remembered auto-accel, phone PA banner one line, accessible names."""
import asyncio, sys
from playwright.async_api import async_playwright
ARGS = ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"]
BASE = "http://localhost:8080/"
fails = []
def check(name, cond, info=''):
    print(('PASS ' if cond else 'FAIL ') + name, info); (None if cond else fails.append(name))
A11Y = """[...document.querySelectorAll('button')].filter(b=>{const r=b.getBoundingClientRect();if(!r.width)return false;const t=(b.getAttribute('aria-label')||b.textContent||'').trim();return !/[0-9A-Za-z가-힣]/.test(t)}).map(b=>b.id||b.className||b.outerHTML.slice(0,40))"""
async def touch(cdp, typ, pts): await cdp.send("Input.dispatchTouchEvent", {"type": typ, "touchPoints": [{"x": x, "y": y, "id": i} for i, (x, y) in enumerate(pts)]})
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=ARGS); errs = []
        # ---------- desktop ----------
        c = await b.new_context(viewport={"width": 1200, "height": 700}); pg = await c.new_page(); ev = pg.evaluate
        pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
        await pg.goto(BASE + "?map=mart&nointro"); await pg.wait_for_function("window.__game&&__game.N>0", timeout=30000)
        check("a11y names (title)", not await ev(A11Y), await ev(A11Y))
        await ev("s=>document.querySelector(s).click()", "#startBtn"); await pg.wait_for_function("__game.state==='race'", timeout=60000)
        await pg.wait_for_function("document.getElementById('tip').classList.contains('show')", timeout=8000)
        check("first-race tip shown", True, await pg.text_content("#tipText"))
        check("standings shows 4 racers", await ev("document.querySelectorAll('#standings span').length") == 4, await pg.inner_text("#standings"))
        await ev("s=>document.querySelector(s).click()", "#helpBtn"); await asyncio.sleep(0.3)
        t0 = await ev("__game.raceT"); await asyncio.sleep(1.0); t1 = await ev("__game.raceT")
        check("help opens + pauses solo", await ev("!document.getElementById('help2').classList.contains('hidden')") and t1 == t0, f"{t0}->{t1}")
        for tab in ["race", "shop", "items", "settings"]:
            await ev("s=>document.querySelector(s).click()", f"#helpTabs [data-tab={tab}]"); 
        check("help tabs render", "키 설정" in await pg.inner_text("#helpBody"))
        await ev("s=>document.querySelector(s).click()", "[data-bind=boost]"); await pg.keyboard.press("KeyB"); await asyncio.sleep(0.2)
        check("rebind shows new key", "B" in await pg.inner_text("[data-bind=boost]"), await pg.inner_text("[data-bind=boost]"))
        await ev("s=>document.querySelector(s).click()", "[data-motion=reduce]"); check("reduced motion class", await ev("document.body.classList.contains('reduce-motion')"))
        await pg.keyboard.press("Escape"); await asyncio.sleep(0.3)
        check("Esc closes help + resumes", await ev("document.getElementById('help2').classList.contains('hidden') && !__game.paused"))
        await pg.keyboard.down("KeyB"); kb = await ev("__game.keys.Space"); await pg.keyboard.up("KeyB")
        await pg.keyboard.down("Space"); ks = await ev("!!__game.keys.Space"); await pg.keyboard.up("Space")
        check("remapped key drives N2O, old key freed", kb and not ks, f"B->{kb} Space->{ks}")
        await c.close()
        # persisted settings survive reload
        # ---------- shopping tutorial ----------
        c = await b.new_context(viewport={"width": 1000, "height": 640}); pg = await c.new_page(); ev = pg.evaluate
        await pg.goto(BASE + "?map=freezer&mode=shop&nointro"); await pg.wait_for_function("window.__game&&__game.N>0", timeout=30000)
        await ev("s=>document.querySelector(s).click()", "#startBtn"); await asyncio.sleep(0.4)
        check("shop tutorial shown before first shopping race", await ev("!document.getElementById('shopTut').classList.contains('hidden') && __game.state==='title'"))
        titles = []
        for k in range(3): titles.append(await pg.text_content("#stTitle")); await ev("s=>document.querySelector(s).click()", "#stNext"); await asyncio.sleep(0.2)
        await pg.wait_for_function("__game.state!=='title'", timeout=20000)
        check("3 steps then race starts", len(set(titles)) == 3, titles)
        await c.close()
        # ---------- phone: slide-to-steer, joystick, auto-accel, PA one line ----------
        c = await b.new_context(viewport={"width": 360, "height": 640}, is_mobile=True, has_touch=True, device_scale_factor=2); pg = await c.new_page(); ev = pg.evaluate
        pg.on("pageerror", lambda e: errs.append(str(e))); cdp = await c.new_cdp_session(pg)
        await pg.goto(BASE + "?map=mart&nointro"); await pg.wait_for_function("window.__game&&__game.N>0", timeout=30000)
        check("touch auto-accel default on", await ev("__game.autoAccel"))
        await ev("document.getElementById('startBtn').click()"); await pg.wait_for_function("__game.state==='race'", timeout=60000)
        L = await ev("(()=>{const r=document.querySelector('#touch .left').getBoundingClientRect();return [r.left+r.width/2,r.top+r.height/2]})()")
        Rr = await ev("(()=>{const r=document.querySelector('#touch .right').getBoundingClientRect();return [r.left+r.width/2,r.top+r.height/2]})()")
        await touch(cdp, "touchStart", [L]); await asyncio.sleep(0.1); a = await ev("[!!__game.keys.ArrowLeft,!!__game.keys.ArrowRight]")
        for k in range(1, 7): await touch(cdp, "touchMove", [(L[0] + (Rr[0] - L[0]) * k / 6, L[1])]); await asyncio.sleep(0.03)
        bb = await ev("[!!__game.keys.ArrowLeft,!!__game.keys.ArrowRight]"); await touch(cdp, "touchEnd", []); await asyncio.sleep(0.1)
        cc = await ev("[!!__game.keys.ArrowLeft,!!__game.keys.ArrowRight]")
        check("slide ◀ → ▶ without lifting", a == [True, False] and bb == [False, True] and cc == [False, False], f"{a} {bb} {cc}")
        await ev("__game.pa('현재 1위는 노랑 카트 고객님입니다! 오늘도 즐거운 쇼핑 되세요')"); await asyncio.sleep(0.8)
        r = await ev("(()=>{const r=document.getElementById('pa').getBoundingClientRect();return [r.left,r.right,r.height]})()")
        check("phone PA banner one line, wide, on screen", r[0] >= 0 and r[1] <= 360 and r[2] < 30 and r[1] - r[0] > 300, r)
        await ev("document.getElementById('helpBtn').click()"); await asyncio.sleep(0.2); await ev("document.querySelector('[data-tab=settings]').click()")
        await ev("document.querySelector('[data-steer=stick]').click()"); await ev("document.querySelector('[data-auto=\"0\"]').click()"); await ev("document.getElementById('helpOk').click()")
        await pg.reload(); await pg.wait_for_function("window.__game&&__game.N>0", timeout=30000)
        check("auto-accel OFF remembered on touch", not await ev("__game.autoAccel"))
        await ev("document.getElementById('startBtn').click()"); await pg.wait_for_function("__game.state==='race'", timeout=60000)
        check("joystick mode hides D-pad", await ev("getComputedStyle(document.querySelector('#touch .dpad')).display==='none' && document.body.classList.contains('stickmode')"))
        await touch(cdp, "touchStart", [(90, 450)]); await asyncio.sleep(0.05)
        for k in range(1, 6): await touch(cdp, "touchMove", [(90 + 10 * k, 450 - 9 * k)]); await asyncio.sleep(0.03)
        st = await ev("[__game.analog.active, __game.analog.steer, !!__game.keys.ArrowUp]"); await touch(cdp, "touchEnd", []); await asyncio.sleep(0.1)
        st2 = await ev("[__game.analog.active, __game.analog.steer]")
        check("joystick: right+up = analog right steer + push, release resets", st[0] and st[1] < -0.3 and st[2] and st2 == [False, 0], f"{st} {st2}")
        check("a11y names (race, phone)", not await ev(A11Y), await ev(A11Y))
        await c.close(); await b.close()
        check("no console errors", not errs, errs[:3])
    print("UX TEST", "PASS" if not fails else "FAIL " + str(fails)); sys.exit(1 if fails else 0)
asyncio.run(main())
