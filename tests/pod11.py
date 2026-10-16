import asyncio
from playwright.async_api import async_playwright
ARGS=["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader"]
IDS=['mango','dubu','halmi','bujang','ppoppi','mint','leo','unni']
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(args=ARGS); errs=[]
    for vp,tag in [({"width":1280,"height":720},""),({"width":412,"height":780},"-mobile")]:
      pg=await b.new_page(viewport=vp); pg.on("pageerror",lambda e: errs.append(str(e))); pg.on("console",lambda m: errs.append(m.text) if m.type=="error" else None)
      await pg.goto("http://localhost:8080/?map=mart&nointro"); await pg.wait_for_function("window.__game&&__game.N>0",timeout=30000)
      ids=await pg.evaluate("__game.roster?__game.roster.map(r=>r.id):null") or IDS
      await pg.evaluate("document.getElementById('title').classList.add('hidden');__game.podiumTest(['mango'])"); await asyncio.sleep(3)
      for i,c in enumerate(ids if not tag else ids[:2]):
        others=[x for x in ids if x!=c][i%5:i%5+2]
        await pg.evaluate("document.getElementById('title').classList.add('hidden')"); await pg.evaluate("l=>__game.podiumTest(l)",[c]+others); await asyncio.sleep(2.2)
        await pg.screenshot(path=f"/workspace/cart-race-shots/podium11-{c}{tag}.png")
      if not tag:
        await pg.evaluate("document.getElementById('finish').classList.add('hidden')")
        await pg.evaluate("document.getElementById('title').classList.remove('hidden');document.getElementById('charBtn').click()"); await asyncio.sleep(0.6)
        await pg.screenshot(path="/workspace/cart-race-shots/podium11-preview-mango.png")
        await pg.evaluate("document.getElementById('charLineup').click()"); await asyncio.sleep(1)
        await pg.screenshot(path="/workspace/cart-race-shots/podium11-lineup.png")
      await pg.close()
    print("ids",ids,"ERRORS",errs); await b.close()
asyncio.run(main())
