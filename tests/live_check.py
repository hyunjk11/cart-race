"""Post-deploy check of the live site: versioned assets only from our origin, service worker installs and the game
boots offline, PWA/share metadata present.  usage: python3 tests/live_check.py [expected_version]"""
import asyncio, sys, json, urllib.request
from playwright.async_api import async_playwright
BASE = 'https://hyunjk11.github.io/cart-race/'
async def main():
    ok = True
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        c = await b.new_context(viewport={'width': 1000, 'height': 600}); pg = await c.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
        await pg.goto(BASE + '?nointro'); await pg.wait_for_function("document.getElementById('startBtn')", timeout=30000)
        ver = await pg.evaluate('window.__V'); print('live version', ver)
        if len(sys.argv) > 1 and sys.argv[1] != ver: print('VERSION MISMATCH, expected', sys.argv[1]); ok = False
        await pg.wait_for_function('navigator.serviceWorker && navigator.serviceWorker.controller || false', timeout=30000).catch(lambda e: None) if False else None
        try: await pg.evaluate('navigator.serviceWorker.ready.then(()=>1)'); await asyncio.sleep(2)
        except Exception as e: print('sw err', e); ok = False
        ext = await pg.evaluate("performance.getEntriesByType('resource').map(e=>e.name).filter(n=>!n.startsWith(location.origin))")
        print('external requests', ext); ok = ok and not ext
        print('debug hook exposed:', await pg.evaluate('typeof window.__game')); ok = ok and await pg.evaluate('typeof window.__game') == 'undefined'
        await c.set_offline(True); await pg.reload(); await pg.wait_for_function("document.getElementById('startBtn') && document.fonts.check('20px Jua')", timeout=30000)
        await asyncio.sleep(2); off = await pg.evaluate("!!document.querySelector('canvas') && document.getElementById('mapRow').children.length>0"); print('offline boot', off); ok = ok and off
        await c.set_offline(False); await b.close()
        print('errors', errs[:3]); ok = ok and not [e for e in errs if 'ERR_INTERNET_DISCONNECTED' not in e]
    for path in ['manifest.json', 'icons/og.png', 'icons/favicon.svg', 'icons/apple-touch-icon.png', 'sw.js']:
        code = urllib.request.urlopen(BASE + path).status; print(path, code); ok = ok and code == 200
    print('LIVE CHECK', 'PASS' if ok else 'FAIL'); sys.exit(0 if ok else 1)
asyncio.run(main())
