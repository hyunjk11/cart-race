import _env  # noqa: F401  (base URL + ?debug=1)
"""E2: rejoin mid-race with the room token (slot reclaimed from the replacement bot), automatic reconnect after a dropped
connection, late joiner mid-race = spectator who plays from the next race. Real PeerJS cloud signaling (flaky: rerun once)."""
import asyncio, sys, json
from playwright.async_api import async_playwright
ARGS = ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--autoplay-policy=no-user-gesture-required"]
BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8080/"
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=ARGS); errs = {}
        async def ctx(name, init=None):
            c = await b.new_context(viewport={"width": 900, "height": 560})
            if init: await c.add_init_script(init)
            pg = await c.new_page(); errs[name] = []
            pg.on("console", lambda m: errs[name].append(m.text) if m.type == "error" else None)
            pg.on("pageerror", lambda e: errs[name].append("PAGEERR " + str(e)))
            return c, pg
        ev = lambda pg, e: pg.evaluate(e)
        ca, A = await ctx("host"); cb, B = await ctx("guest")
        await A.goto(BASE + "?nointro"); await A.click("#mpBtn"); await A.fill("#nick", "호스트"); await A.click("#createBtn")
        await A.wait_for_function("document.getElementById('roomCode').textContent.length>=4", timeout=30000)
        code = await A.text_content("#roomCode"); print("room", code)
        await B.goto(BASE + "?nointro&room=" + code)
        await A.wait_for_function("document.querySelectorAll('#slots .slot b').length>=2", timeout=40000)
        await A.click("#addBot"); await B.click("#readyBtn")
        await A.wait_for_function("!document.getElementById('startRace').disabled", timeout=15000); await A.click("#startRace")
        for pg in (A, B): await pg.wait_for_function("__game.state==='race'", timeout=60000)
        for pg in (A, B): await pg.keyboard.down("ArrowUp")
        await asyncio.sleep(4)
        tok = await ev(B, f"localStorage.getItem('cartTok_{code}')"); print("token", tok); assert tok
        # 1) guest closes the tab -> replaced by a bot -> comes back with the same token (invite link) -> slot reclaimed
        await cb.close()
        await A.wait_for_function("__game.carts[1].ai===true", timeout=20000)
        print("after drop host slot1:", await ev(A, "[__game.carts[1].name,__game.carts[1].ai,__game.carts[1].remote]"))
        await asyncio.sleep(2)
        cd, D = await ctx("guest-rejoin", f"localStorage.setItem('cartTok_{code}','{tok}');localStorage.setItem('cartNick','게스트1')")
        await D.goto(BASE + "?nointro&room=" + code)
        await D.wait_for_function("__game.state==='race' && __game.MODE==='guest'", timeout=40000)
        await A.wait_for_function("__game.carts[1].remote===true && !__game.carts[1].ai", timeout=10000)
        hostC = await ev(A, "[__game.carts[1].name,+__game.carts[1].x.toFixed(1),+__game.carts[1].z.toFixed(1),__game.carts[1].lap]")
        me = await ev(D, "[__game.NET.you,+__game.player.x.toFixed(1),+__game.player.z.toFixed(1),__game.player.lap,+__game.raceT.toFixed(1)]")
        print("rejoin: host slot1", hostC, "rejoined guest you/x/z/lap/raceT", me)
        assert me[0] == 1 and abs(me[1] - hostC[1]) + abs(me[2] - hostC[2]) < 8, "rejoined at bot position"
        assert '(봇)' not in hostC[0]
        await ev(A, "(()=>{window.__st={};for(const [k,c] of __game.NET.conns)c.on('data',d=>{const m=JSON.parse(d);__st[m.t]=(__st[m.t]||0)+1})})()")
        await ev(D, "__game.keys.ArrowUp=true"); await asyncio.sleep(3)
        print("host recv", await ev(A,"JSON.stringify(window.__st)"), await ev(A,"[__game.carts[1].remote,__game.carts[1].ai,__game.carts[1].inactive]"))
        moved = await ev(A, "[+__game.carts[1].x.toFixed(1),+__game.carts[1].z.toFixed(1)]"); dm = await ev(D, "[+__game.player.x.toFixed(1),+__game.player.z.toFixed(1),+__game.player.v.toFixed(1)]")
        print("host sees rejoined guest drive", hostC[1:3], "->", moved, "guest local", dm); assert abs(moved[0] - hostC[1]) + abs(moved[1] - hostC[2]) > 2
        # 2) connection drops (not the tab) -> guest reconnects automatically and keeps racing
        await ev(D, "__game.NET.hostConn.close()")
        await D.wait_for_function("__game.NET.hostConn && __game.NET.hostConn.open", timeout=40000)
        await asyncio.sleep(2)
        st = await ev(D, "[__game.MODE,__game.state,__game.NET.you,__game.NET.mode]"); hs = await ev(A, "[__game.carts[1].remote,__game.carts[1].ai,__game.carts[1].name]")
        print("auto-reconnect: guest", st, "host slot1", hs); assert st[0] == 'guest' and st[1] == 'race' and st[2] == 1 and hs[0] and not hs[1]
        # 3) late joiner mid-race -> spectator
        ce, E = await ctx("late")
        await E.goto(BASE + "?nointro&room=" + code)
        await E.wait_for_function("__game.state==='race' && !!__game.spec", timeout=40000)
        print("spectator: you", await ev(E, "__game.NET.you"), "watching", await ev(E, "__game.carts.filter(c=>!c.inactive).map(c=>c.name)"), "msg", await E.text_content("#msg"))
        ey = await ev(E, "__game.NET.you"); assert await ev(A, f"__game.carts[{ey}].inactive") and not await ev(A, f"__game.carts[{ey}].remote")
        # finish -> everyone back in the lobby, spectator has a normal slot for the next race
        await ev(A, "__game.debugNearFinish()"); await ev(D, "__game.debugNearFinish()")
        for pg in (A, D, E): await pg.wait_for_selector("#mpLobby:not(.hidden)", timeout=60000)
        lob = await A.inner_text("#slots"); print("lobby after race:", lob.replace("\n", " | "))
        await E.click("#readyBtn"); await D.click("#readyBtn")
        await A.wait_for_function("!document.getElementById('startRace').disabled", timeout=15000); await A.click("#startRace")
        await E.wait_for_function("__game.state!=='lobby' && !__game.spec && !__game.player.inactive", timeout=30000)
        print("next race: late joiner races as slot", await ev(E, "__game.NET.you"))
        bad = {k: [e for e in v if 'peer' not in e.lower() and 'webrtc' not in e.lower()] for k, v in errs.items()}
        print("ERRORS", json.dumps(errs, ensure_ascii=False)); assert not any(bad.values())
        print("MPREJOIN PASS")
        await b.close()
asyncio.run(main())
