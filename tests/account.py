"""👤 계정 (Round H) with a mocked supabase client (tests/sbmock.js: no network, no emails):
guest flow never loads supabase-js; real vendored lib loads; login merges guest save into cloud (union/max/faster),
debounced save, offline queue + retry, reload restores session and cloud is source of truth, nickname from profile,
leaderboard tab, sign-out restores the guest save, Korean errors, signup logs in at once (and the 'Confirm email on'
message), missing tables degrade gracefully.   usage: python3 tests/account.py [BASE]"""
import _env  # noqa: F401
import asyncio, sys, json, pathlib
from playwright.async_api import async_playwright
ARGS = ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"]
BASE = next((a for a in sys.argv[1:] if a.startswith('http')), _env.BASE)
MOCK = (pathlib.Path(__file__).parent / 'sbmock.js').read_text(encoding='utf-8')
def check(ok, what): print(("ok   " if ok else "FAIL ") + what)
async def ready(pg): await pg.wait_for_function("window.__game&&__game.N>0&&window.__acct", timeout=30000)
async def until(pg, js, t=12000):
    try: await pg.wait_for_function(js, timeout=t); return True
    except Exception: return False
SEED = {"users": {"u1": {"id": "u1", "email": "kim@test.kr", "password": "secret1"}},
        "cart_profiles": {"u1": {"id": "u1", "nickname": "김카트"}},
        "cart_progress": {"u1": {"user_id": "u1", "merged": True, "data": {"v": 1, "coins": 300, "owned": {"wheel": ["offroad"]}, "loadout": {"wheel": "offroad"},
                          "char": "mango", "best": {"mart": 28.5, "parking": 50}, "stats": {"races": 9, "wins": 2}, "settings": {"cartSteer": "stick"}}}},
        "cart_records": {"u9:mart": {"user_id": "u9", "map": "mart", "lap_ms": 27000, "nickname": "고수", "char": "kiwi"}}, "calls": []}
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=ARGS)
        # ---- 1. guest: no supabase-js download, real vendored lib loads on demand
        c = await b.new_context(viewport={"width": 1280, "height": 720}); pg = await c.new_page()
        errs = []; reqs = []
        pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None); pg.on("pageerror", lambda x: errs.append("PE " + str(x)))
        pg.on("request", lambda r: reqs.append(r.url))
        await pg.goto(BASE + "?map=mart&nointro"); await ready(pg); await asyncio.sleep(1.5)
        check(not await pg.evaluate("performance.getEntriesByType('resource').some(e=>e.name.includes('vendor/supabase.mjs'))"), "guest: page never loads supabase-js (SW precache aside)")
        check(await pg.is_visible("#tAcct"), "👤 button on title")
        await pg.click("#startBtn"); ok = await until(pg, "__game.state==='race'||__game.state==='countdown'", 20000)
        check(ok, "guest can start a race without login")
        await pg.goto(BASE + "?map=mart&nointro"); await ready(pg)
        await pg.click("#tAcct"); ok = await until(pg, "!!document.getElementById('aEmail')")
        await asyncio.sleep(1.5)
        check(ok and any('vendor/supabase.mjs' in u for u in reqs), "panel opens, real vendor/supabase.mjs loaded")
        check(not any('supabase.co' in u and 'auth/v1/token' in u for u in reqs), "no auth call without user action")
        check('로그인 없이도' in await pg.inner_text("#acct"), "guest note in Korean")
        await pg.keyboard.press("Escape"); check(await pg.is_hidden("#acct"), "Esc closes panel")
        print("ERRORS:", [e for e in errs if 'supabase.co' not in e])
        await c.close()
        # ---- 2. mocked server
        c = await b.new_context(viewport={"width": 1280, "height": 720}); await c.add_init_script(MOCK)
        pg = await c.new_page(); errs = []
        pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None); pg.on("pageerror", lambda x: errs.append("PE " + str(x)))
        ev = pg.evaluate; DB = "JSON.parse(localStorage.getItem('__mockdb'))"
        await pg.goto(BASE + "?map=mart&nointro"); await ready(pg)
        await ev(f"""localStorage.setItem('__mockdb', {json.dumps(json.dumps(SEED))});
          localStorage.setItem('cartCoins','700'); localStorage.setItem('cartOwned', JSON.stringify({{body:['gold']}}));
          localStorage.setItem('cartBest_mart','30.00'); localStorage.setItem('cartBest_freezer','40.00'); localStorage.setItem('cartChar','kiwi');
          localStorage.setItem('cartStats', JSON.stringify({{races:3,wins:3}}))""")
        await pg.reload(); await ready(pg)
        await pg.click("#tAcct"); await pg.wait_for_selector("#aEmail")
        await pg.fill("#aEmail", "kim@test.kr"); await pg.fill("#aPw", "wrongpw"); await pg.click("#aIn")
        await until(pg, "document.getElementById('aMsg').textContent.includes('맞지')")
        check('이메일 또는 비밀번호가 맞지 않아요' in await pg.inner_text("#aMsg"), "wrong password -> Korean error")
        await pg.fill("#aPw", "123"); await pg.click("#aIn")
        check('6자 이상' in await pg.inner_text("#aMsg"), "short password -> Korean error")
        await pg.fill("#aPw", "secret1"); await pg.keyboard.press("Enter")  # submit via Enter (form)
        ok = await until(pg, "__acct.state().sync==='saved'")
        check(ok, "login -> synced (" + json.dumps(await ev("__acct.state()")) + ")")
        cloud = (await ev(DB))["cart_progress"]["u1"]["data"]
        check(cloud["coins"] == 700, f"merge coins=max -> {cloud['coins']}")
        check(set(cloud["owned"].get("wheel", [])) == {"offroad"} and cloud["owned"].get("body") == ["gold"], "merge owned union")
        check(cloud["best"] == {"mart": 28.5, "parking": 50, "freezer": 40}, f"merge best faster {cloud['best']}")
        check(cloud["stats"]["races"] == 9 and cloud["stats"]["wins"] == 3, "merge stats max")
        check(cloud["char"] == "mango" and await ev("localStorage.getItem('cartChar')") == "mango", "cloud char wins + applied")
        check(await ev("localStorage.getItem('cartBest_mart')") == "28.50", "faster cloud best applied locally")
        check(await ev("localStorage.getItem('cartNick')") == "김카트", "nickname from profile")
        check('700' in await pg.inner_text("#garBtn"), "title coins after merge")
        check('김카트' in await pg.get_attribute("#tAcct", "title") and await ev("document.getElementById('tAcct').classList.contains('on')"), "👤 shows logged in")
        await until(pg, f"{DB}.cart_records['u1:freezer']", 5000)
        recs = (await ev(DB))["cart_records"]
        check(recs.get("u1:freezer", {}).get("lap_ms") == 40000 and recs.get("u1:mart", {}).get("lap_ms") == 28500, "best laps submitted to records")
        # change -> debounced save
        await ev("__game.grantCoins(50)")
        check(await ev("__acct.state().dirty") == '1', "change marks dirty")
        ok = await until(pg, f"{DB}.cart_progress.u1.data.coins===750", 9000); check(ok, "debounced save -> cloud coins 750")
        # offline queue + retry
        await ev("localStorage.setItem('__mockflags', JSON.stringify({offline:true}))"); await ev("__game.grantCoins(10)")
        ok = await until(pg, "['pending','offline','error'].includes(__acct.state().sync)", 9000)
        check(ok and await ev("__acct.state().dirty") == '1', "offline -> still dirty, " + (await ev("__acct.state().sync")))
        await ev("localStorage.setItem('__mockflags','{}')")
        ok = await until(pg, f"{DB}.cart_progress.u1.data.coins===760&&__acct.state().dirty==='0'", 15000); check(ok, "retry after reconnect -> cloud 760")
        # nickname edit
        await pg.fill("#aNick", "카트왕"); await pg.click("#aNickSave"); await asyncio.sleep(0.5)
        check((await ev(DB))["cart_profiles"]["u1"]["nickname"] == "카트왕", "nickname saved to profile")
        # leaderboard
        await pg.click('[data-atab="board"]'); await pg.click('[data-bmap="mart"]')
        await until(pg, "document.querySelectorAll('#aBoard li .rk').length>=2", 5000)
        txt = await pg.inner_text("#aBoard"); print('board:', txt.replace('\n', ' | ')); check('고수' in txt and '카트왕' in txt and '0:27.00' in txt, "leaderboard lists records")
        await pg.screenshot(path="/workspace/cart-race-shots/acct-board.png")
        await pg.click('[data-atab="acct"]'); await pg.screenshot(path="/workspace/cart-race-shots/acct-in.png")
        # race end stats (recordRun) — simulate via finished run bookkeeping
        # reload: session restored, cloud is source of truth (other device changed coins)
        await ev(f"(()=>{{const d={DB}; d.cart_progress.u1.data.coins=9999; localStorage.setItem('__mockdb', JSON.stringify(d))}})()")
        await pg.reload(); await ready(pg)
        ok = await until(pg, "__acct.state().user&&localStorage.getItem('cartCoins')==='9999'", 12000)
        check(ok, "reload restores session + pulls cloud (9999)")
        check('9,999' in await pg.inner_text("#garBtn"), "title shows cloud coins")
        # sign out -> guest save back
        await pg.click("#tAcct"); await pg.wait_for_selector("#aOut"); await pg.click("#aOut")
        ok = await until(pg, "!__acct.state().user&&!!document.getElementById('aEmail')", 8000)
        check(ok and await ev("localStorage.getItem('cartCoins')") == '700' and await ev("localStorage.getItem('cartBest_mart')") == '30.00', "sign out -> guest save restored")
        # signup logs in at once
        await pg.fill("#aEmail", "new@test.kr"); await pg.fill("#aPw", "abcdef"); await pg.click("#aUp")
        ok = await until(pg, "__acct.state().user&&__acct.state().user.email==='new@test.kr'", 8000)
        check(ok and '가입 완료' in await pg.inner_text("#aMsg"), "sign-up -> logged in immediately")
        await pg.click("#aOut"); await until(pg, "!__acct.state().user", 8000)
        await pg.fill("#aEmail", "new@test.kr"); await pg.fill("#aPw", "abcdef"); await pg.click("#aUp")
        await until(pg, "document.getElementById('aMsg').textContent.includes('이미')", 5000)
        check('이미 가입된' in await pg.inner_text("#aMsg"), "sign-up with existing email -> Korean msg")
        await ev("localStorage.setItem('__mockflags', JSON.stringify({confirm:true}))")
        await pg.fill("#aEmail", "conf@test.kr"); await pg.click("#aUp")
        await until(pg, "document.getElementById('aMsg').textContent.includes('인증')", 5000)
        check('이메일 인증이 켜져' in await pg.inner_text("#aMsg") and not await ev("__acct.state().user"), "Confirm-email-on fallback message")
        # tables missing -> login works, local only
        await ev("localStorage.setItem('__mockflags', JSON.stringify({noTables:true}))")
        await pg.fill("#aEmail", "kim@test.kr"); await pg.fill("#aPw", "secret1"); await pg.click("#aIn")
        ok = await until(pg, "__acct.state().user&&__acct.state().tables==='missing'", 8000)
        check(ok and '아직 준비되지' in await pg.inner_text("#acct"), "tables missing -> graceful (local only)")
        await ev("__game.grantCoins(5)"); await asyncio.sleep(0.3)
        check(await ev("localStorage.getItem('cartCoins')") == '705', "local progress still works without tables")
        await pg.screenshot(path="/workspace/cart-race-shots/acct-missing.png")
        await pg.click("#aOut"); await until(pg, "!__acct.state().user", 8000)
        check(await ev("localStorage.getItem('cartCoins')") == '705', "sign-out without tables keeps local progress")
        print("ERRORS:", errs)
        await c.close()
        # ---- 3. mobile fit
        c = await b.new_context(viewport={"width": 320, "height": 568}, is_mobile=True, has_touch=True); await c.add_init_script(MOCK)
        pg = await c.new_page(); await pg.goto(BASE + "?map=mart&nointro"); await ready(pg)
        await pg.click("#tAcct"); await pg.wait_for_selector("#aEmail")
        box = await pg.evaluate("(()=>{const r=document.querySelector('.apanel').getBoundingClientRect();return [r.left,r.right,innerWidth]})()")
        check(box[0] >= 0 and box[1] <= box[2], f"panel fits 320px {box}")
        await pg.screenshot(path="/workspace/cart-race-shots/acct-mobile.png")
        await b.close()
asyncio.run(main())
