import _env  # noqa: F401  (base URL + ?debug=1)
"""E3: host leaves mid-race -> first guest re-opens the same room code as the new host, the other guest rejoins,
bots are kept, everyone is in the lobby and the new host can start the next race. Real PeerJS cloud (flaky: rerun once)."""
import asyncio, sys, json
from playwright.async_api import async_playwright
ARGS = ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--autoplay-policy=no-user-gesture-required"]
BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8080/"
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=ARGS); errs = {}
        async def ctx(name):
            c = await b.new_context(viewport={"width": 900, "height": 560}); pg = await c.new_page(); errs[name] = []
            pg.on("console", lambda m: errs[name].append(m.text) if m.type == "error" else None)
            pg.on("pageerror", lambda e: errs[name].append("PAGEERR " + str(e)))
            return c, pg
        ev = lambda pg, e: pg.evaluate(e)
        ca, A = await ctx("host"); cb, B = await ctx("g1"); cc, C = await ctx("g2")
        await A.goto(BASE + "?nointro"); await A.click("#mpBtn"); await A.fill("#nick", "호스트"); await A.click("#createBtn")
        await A.wait_for_function("document.getElementById('roomCode').textContent.length>=4", timeout=30000)
        code = await A.text_content("#roomCode"); print("room", code)
        await B.goto(BASE + "?nointro&room=" + code)
        await A.wait_for_function("document.querySelectorAll('#slots .slot b').length>=2", timeout=40000)
        await C.goto(BASE + "?nointro&room=" + code)
        await A.wait_for_function("document.querySelectorAll('#slots .slot b').length>=3", timeout=40000)
        await A.click("#addBot"); await B.click("#readyBtn"); await C.click("#readyBtn")
        await A.wait_for_function("!document.getElementById('startRace').disabled", timeout=15000); await A.click("#startRace")
        for pg in (A, B, C): await pg.wait_for_function("__game.state==='race'", timeout=60000)
        await asyncio.sleep(3)
        await ca.close(); print("host closed mid-race")
        await B.wait_for_function("__game.NET.mode==='host' && __game.state==='lobby'", timeout=60000)
        print("g1 is new host, code", await B.text_content("#roomCode"), "msg", await B.text_content("#lobbyMsg"))
        await B.wait_for_function("document.querySelectorAll('#slots .slot b').length>=3", timeout=60000)
        await C.wait_for_function("__game.NET.mode==='guest' && !document.getElementById('mpLobby').classList.contains('hidden')", timeout=10000)
        print("new lobby:", (await B.inner_text("#slots")).replace("\n", " | "))
        assert (await B.text_content("#roomCode")) == code
        await C.click("#readyBtn")
        await B.wait_for_function("!document.getElementById('startRace').disabled", timeout=15000); await B.click("#startRace")
        for pg in (B, C): await pg.wait_for_function("__game.state==='race'", timeout=60000)
        print("next race modes", await ev(B, "__game.MODE"), await ev(C, "__game.MODE"))
        print("ERRORS", json.dumps(errs, ensure_ascii=False)); assert not any(errs.values())
        print("MPMIGRATE PASS")
        await b.close()
asyncio.run(main())
