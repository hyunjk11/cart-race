"""Renders icons (from icons/favicon.svg) and the 1200x630 share image (icons/og.png) from a live game render.
usage: python3 tools/shots.py [base_url]   (needs a local server, default http://localhost:8080/)"""
import asyncio, sys, pathlib
from playwright.async_api import async_playwright
R = pathlib.Path(__file__).resolve().parent.parent
BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8080/'
SVG = (R / 'icons' / 'favicon.svg').read_text()
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        for name, size, pad in [('icon-192.png', 192, 0.1), ('icon-512.png', 512, 0.1), ('apple-touch-icon.png', 180, 0.06)]:
            pg = await b.new_page(viewport={'width': size, 'height': size})
            inner = int(size * (1 - 2 * pad))
            await pg.set_content(f'<body style="margin:0;background:#ff4f8b;display:grid;place-items:center;height:100vh"><div style="width:{inner}px;height:{inner}px">{SVG.replace("<svg ", "<svg width=100% height=100% ")}</div></body>')
            await pg.screenshot(path=str(R / 'icons' / name)); await pg.close()
        pg = await b.new_page(viewport={'width': 1840, 'height': 630})  # wide render, cropped so the podium sits right of the title
        await pg.goto(BASE + '?debug=1&map=mart&nointro'); await pg.wait_for_function('window.__game&&__game.N>0', timeout=60000)
        await pg.evaluate("document.getElementById('title').classList.add('hidden');__game.podiumTest(['mango','ppoppi','halmi'])"); await asyncio.sleep(4)
        await pg.evaluate("""(()=>{document.getElementById('finish').classList.add('hidden');document.querySelectorAll('#mute,#auto,#hud,#minimap').forEach(e=>e.style.display='none');
          const d=document.createElement('div');d.style.cssText='position:fixed;left:110px;top:44px;z-index:99;font-family:Jua;color:#fff;text-shadow:0 4px 0 #c2185b,0 0 24px rgba(0,0,0,.35)';
          d.innerHTML='<div style="font-size:84px;line-height:1">🛒💨</div><div style="font-size:68px;color:#ffd84d;margin-top:6px">마트 카트 레이싱</div><div style="font-size:34px;margin-top:10px">드리프트 · 아이템 · 장보기 모드</div><div style="font-size:28px;margin-top:8px;opacity:.95">8명의 캐릭터 · 4개 맵 · 4인 온라인 멀티</div>';document.body.appendChild(d)})()""")
        await asyncio.sleep(1.2); await pg.screenshot(path=str(R / 'icons' / 'og.png'), clip={'x': 60, 'y': 0, 'width': 1200, 'height': 630}); await b.close()
asyncio.run(main())
