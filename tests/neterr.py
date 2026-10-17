import _env  # noqa: F401  (base URL + ?debug=1)
"""E1: ICE config comes from js/netconfig.js (?turn= hook adds a TURN server); joining a missing room shows a Korean error with network tips."""
import asyncio, sys
from playwright.async_api import async_playwright
BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8080/"
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        await pg.goto(BASE + "?turn=turn:example.invalid:3478,u,c")
        ice = await pg.evaluate("import('./js/netconfig.js').then(m=>m.iceServers().map(s=>s.urls))")
        print("ice", ice); assert any('turn:' in str(u) for u in ice)
        await pg.click("#mpBtn"); await pg.fill("#nick", "테스트"); await pg.fill("#joinCode", "ZZZQ"); await pg.click("#joinBtn")
        await pg.wait_for_function("document.getElementById('mpMsg').classList.contains('err')", timeout=30000)
        m = await pg.text_content("#mpMsg"); print("msg:", m)
        assert '방을 찾을 수 없' in m or '다른 네트워크' in m, m
        print("errors", errs); assert not errs
        await b.close(); print("NETERR PASS")
asyncio.run(main())
