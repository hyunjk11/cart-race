"""Garage / parts shop (G3): debug coin grant, buy + equip in the 🔧 차고 UI, cart mesh really changes (mesh/vertex count,
bbox, materials), persists after reload, low-quality variant is lighter, stats (solo) applied, in-race modded cart,
results coin breakdown, mobile fit. `--mp` adds a multiplayer sync check (guest's parts visible on the host and vice versa,
bots get loadouts, stats off by default).   usage: python3 tests/garage.py [BASE] [--mp]"""
import _env  # noqa: F401  (base URL + ?debug=1)
import asyncio, sys, json
from playwright.async_api import async_playwright
ARGS = ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"]
BASE = next((a for a in sys.argv[1:] if a.startswith('http')), "http://localhost:8080/")
MP = '--mp' in sys.argv or '--mponly' in sys.argv
O = "/workspace/cart-race-shots/garage13-"
MOD = {"wheel": "offroad", "body": "gold", "handle": "wheel", "boost": "rocket", "top": "wing", "paint": "red", "trail": "rainbow"}
def check(ok, what):
    print(("ok   " if ok else "FAIL ") + what)
async def errs_of(pg):
    e = []
    pg.on("console", lambda m: e.append(m.text) if m.type == "error" else None)
    pg.on("pageerror", lambda x: e.append("PE " + str(x)))
    return e
async def solo(b):
    c = await b.new_context(viewport={"width": 1280, "height": 720}); pg = await c.new_page(); errs = await errs_of(pg); ev = pg.evaluate
    await pg.goto(BASE + "?map=mart&nointro"); await pg.wait_for_function("window.__game&&__game.N>0", timeout=30000)
    await ev("localStorage.removeItem('cartCoins');localStorage.removeItem('cartOwned');localStorage.removeItem('cartLoadout')")
    await pg.reload(); await pg.wait_for_function("window.__game&&__game.N>0", timeout=30000)
    base = await ev("__game.cartInfo(0)")
    check(await ev("__game.coins") == 0, "fresh profile has 0 coins")
    # not enough coins -> buy refused
    await pg.click("#garBtn"); await pg.wait_for_selector("#garage:not(.hidden)")
    await pg.click('#gTabs [data-slot="body"]'); await pg.click('#gList [data-part="gold"]')
    check(await ev("document.getElementById('gAct').disabled"), "buy disabled without coins")
    await pg.click("#gBack")
    n = await ev("__game.grantCoins(5000)"); check(n == 5000, f"debug grantCoins -> {n}")
    check('5,000' in await pg.inner_text("#garBtn"), "title 차고 button shows balance")
    await pg.click("#garBtn"); await asyncio.sleep(0.5)
    check((await pg.inner_text("#gCoins")).replace(',', '') == '5000', "garage shows balance")
    spent = 0
    for slot, part in MOD.items():
        await pg.click(f'#gTabs [data-slot="{slot}"]'); await pg.click(f'#gList [data-part="{part}"]')
        price = await ev(f"[...document.querySelectorAll('#gList [data-part=\"{part}\"] .price')].map(e=>+e.textContent.replace(/\\D/g,''))[0]||0")
        spent += price
        await pg.click("#gAct"); await asyncio.sleep(0.15)
        st = await ev(f"document.querySelector('#gList [data-part=\"{part}\"]').className")
        check('equipped' in st and 'owned' in st, f"bought+equipped {slot}={part} (🪙{price})")
    check(await ev("__game.coins") == 5000 - spent, f"coins deducted ({spent})")
    pv = await ev("(()=>{const r=__game.garagePreview().root;let n=0;r.traverse(o=>{if(o.isMesh&&o.visible)n++});return n})()")
    await pg.screenshot(path=O + "garage-desktop.png")
    await pg.click("#gBack"); await asyncio.sleep(0.3)
    mod = await ev("__game.cartInfo(0)")
    print("base", json.dumps(base)); print("mod ", json.dumps(mod))
    check(mod["lo"] == MOD, "player cart loadout = equipped")
    check(mod["meshes"] != base["meshes"] and mod["cartVerts"] > base["cartVerts"] + 500, f"mesh changed: meshes {base['meshes']}->{mod['meshes']} cart verts {base['cartVerts']}->{mod['cartVerts']}")
    check(mod["size"] != base["size"], f"bbox changed {base['size']}->{mod['size']}")
    check(set(mod["mats"]) != set(base["mats"]), "materials changed")
    check(abs(mod["pm"]["spd"] - 1.0) < 1e-6 and abs(mod["pm"]["hdl"] - 1.02) < 1e-6 and abs(mod["pm"]["drf"] - 1.03) < 1e-6, f"solo stat mods {mod['pm']}")
    check(pv > 10, f"garage preview meshes {pv}")
    # persists after reload
    await pg.reload(); await pg.wait_for_function("window.__game&&__game.N>0", timeout=30000)
    re = await ev("__game.cartInfo(0)")
    check(re["lo"] == MOD and re["cartVerts"] == mod["cartVerts"], f"loadout + model persist after reload (cart verts {mod['cartVerts']} -> {re['cartVerts']})")
    check(await ev("__game.coins") == 5000 - spent, "coins persist after reload")
    await pg.click("#garBtn"); await pg.click('#gTabs [data-slot="top"]')
    check('owned' in await ev("document.querySelector('#gList [data-part=\"wing\"]').className"), "owned state persists")
    # lineup of several modded carts (garage preview)
    await ev("""__game.garageLineup([
      {char:'mango',lo:%s},
      {char:'dubu',lo:{wheel:'neon',body:'acrylic',handle:'bike',boost:'double',top:'balloon',paint:'blue',trail:'star'}},
      {char:'leo',lo:{wheel:'slick',body:'carbon',handle:'wheel',boost:'rocketb',top:'cat',paint:'black',trail:'fire'}},
      {char:'halmi',lo:{wheel:'offroad',body:'wire',handle:'basic',boost:'none',top:'flag',paint:'mint',trail:'basic'}}])""" % json.dumps(MOD))
    await asyncio.sleep(1.0); await pg.screenshot(path=O + "lineup.png")
    await ev("__game.garageLineup([])"); await pg.click("#gBack")
    # bots got loadouts
    bots = await ev("[1,2,3].map(i=>__game.cartInfo(i).lo)"); check(all(isinstance(x, dict) for x in bots), "bots have loadouts")
    # in-race modded cart
    await pg.click("#startBtn", force=True); await pg.wait_for_function("__game.state==='race'", timeout=60000)
    check(await ev("JSON.stringify(__game.player.lo)") == json.dumps(MOD, separators=(',', ':')), "race cart keeps loadout")
    await pg.keyboard.down("ArrowUp"); await asyncio.sleep(4.5); await ev("__game.player.boostT=2"); await asyncio.sleep(0.8)
    await pg.screenshot(path=O + "race.png")
    await ev("__game.player.drifts=4"); c0 = await ev("__game.coins")
    await ev("__game.debugNearFinish()"); await pg.wait_for_function("__game.podium", timeout=60000); await asyncio.sleep(1.2)
    await pg.mouse.click(640, 200); await pg.wait_for_selector("#coinBox", timeout=15000); await asyncio.sleep(1.0)
    box = await pg.inner_text("#coinBox"); c1 = await ev("__game.coins")
    print("coinBox:", box.replace("\n", " | "))
    check(c1 > c0 and f"+{c1 - c0}" in box and "드리프트" in box, f"results coin breakdown, coins {c0}->{c1}")
    await ev("document.querySelector('#coinBox').scrollIntoView({block:'center'})"); await asyncio.sleep(0.3)
    await pg.screenshot(path=O + "results.png")
    print("ERRORS:", errs); await c.close()
    # low quality: lighter variant of the same loadout
    c = await b.new_context(viewport={"width": 1100, "height": 650}); pg = await c.new_page(); errs = await errs_of(pg)
    await pg.goto(BASE + "?nointro"); await pg.wait_for_function("window.__game&&__game.N>0", timeout=30000)
    await pg.evaluate(f"__game.setParts(0,{json.dumps(MOD)})"); hi = await pg.evaluate("__game.cartInfo(0).cartVerts")
    await pg.evaluate("localStorage.setItem('cartQuality','low')"); await pg.reload(); await pg.wait_for_function("window.__game&&__game.N>0", timeout=30000)
    await pg.evaluate(f"__game.setParts(0,{json.dumps(MOD)})"); lo = await pg.evaluate("__game.cartInfo(0).cartVerts")
    check(lo < hi, f"low quality verts {lo} < high {hi}")
    print("ERRORS:", errs); await c.close()
    # mobile garage + fit
    c = await b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True); pg = await c.new_page(); errs = await errs_of(pg)
    await pg.goto(BASE + "?nointro"); await pg.wait_for_function("window.__game&&__game.N>0", timeout=30000)
    await pg.evaluate("__game.grantCoins(800)")
    for vp in [(390, 844), (320, 658), (844, 390)]:
        await pg.set_viewport_size({"width": vp[0], "height": vp[1]}); await asyncio.sleep(0.3)
        await pg.evaluate("document.getElementById('garBtn').scrollIntoView({block:'center'})"); await pg.tap("#garBtn"); await asyncio.sleep(0.8)
        await pg.tap('#gTabs [data-slot="wheel"]'); await pg.tap('#gList [data-part="neon"]'); await asyncio.sleep(0.6)
        bad = await pg.evaluate("""(()=>{const W=innerWidth,H=innerHeight,bad=[],P=document.querySelector('.gpanel').getBoundingClientRect();
          if(P.left<-1||P.right>W+1||P.top<-1||P.bottom>H+1)bad.push('panel');
          for(const id of ['gAct','gBack']){const r=document.getElementById(id).getBoundingClientRect();if(r.top<0||r.bottom>H||r.left<0||r.right>W)bad.push(id)}
          const bs=[...document.querySelectorAll('#gList .gpc,.gpanel .lbtns button')].map(e=>e.getBoundingClientRect());
          for(let i=0;i<bs.length;i++)for(let j=i+1;j<bs.length;j++){const a=bs[i],b=bs[j];if(Math.min(a.right,b.right)-Math.max(a.left,b.left)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1)bad.push('overlap'+i+'x'+j)}
          if(document.documentElement.scrollWidth>W+1)bad.push('hscroll');return bad})()""")
        check(not bad, f"mobile garage {vp} fits {bad}")
        if vp == (390, 844): await pg.screenshot(path=O + "garage-mobile.png")
        if vp == (844, 390): await pg.screenshot(path=O + "garage-mobile-land.png")
        await pg.tap("#gBack"); await asyncio.sleep(0.2)
    print("ERRORS:", errs); await c.close()

async def mp(b):
    async def mk(name):
        c = await b.new_context(viewport={"width": 1000, "height": 620}); pg = await c.new_page(); e = await errs_of(pg); return c, pg, e
    ca, A, ea = await mk("host"); cb, B, eb = await mk("guest")
    GL = {"wheel": "neon", "body": "acrylic", "handle": "bike", "boost": "double", "top": "balloon", "paint": "blue", "trail": "star"}
    for pg in (A, B):
        await pg.goto(BASE + "?nointro"); await pg.wait_for_function("window.__game&&__game.N>0", timeout=30000)
        await pg.evaluate("localStorage.removeItem('cartLoadout');localStorage.removeItem('cartOwned');__game.grantCoins(5000)")
    await A.evaluate(f"(()=>{{localStorage.setItem('cartOwned',JSON.stringify(Object.fromEntries(Object.entries({json.dumps(MOD)}).map(([k,v])=>[k,[v]]))));localStorage.setItem('cartLoadout',JSON.stringify({json.dumps(MOD)}))}})()")
    await A.reload(); await A.wait_for_function("window.__game&&__game.N>0", timeout=30000)
    async def host():
        await A.click("#mpBtn"); await A.fill("#nick", "호스트"); await A.click("#createBtn")
        await A.wait_for_function("document.getElementById('roomCode').textContent.length>=4", timeout=30000)
    await _env.retry(host)
    code = await A.text_content("#roomCode")
    await B.click("#mpBtn"); await B.fill("#nick", "게스트"); await B.fill("#joinCode", code); await B.click("#joinBtn")
    await A.wait_for_function("document.querySelectorAll('#slots .slot b').length>=2", timeout=40000)
    # guest buys + equips in the lobby garage -> host sees it
    await B.wait_for_selector("#lobbyGar"); await B.click("#lobbyGar"); await asyncio.sleep(0.4)
    for slot, part in GL.items():
        await B.click(f'#gTabs [data-slot="{slot}"]'); await B.click(f'#gList [data-part="{part}"]'); await B.click("#gAct"); await asyncio.sleep(0.1)
    await B.click("#gBack")
    G = "__game.NET.slots.findIndex(s=>s&&s.type==='human'&&s.id!=='host')"
    gi = await A.evaluate(G); print("guest slot", gi, await A.evaluate("JSON.stringify(__game.NET.slots)"))
    await A.wait_for_function(f"JSON.stringify(__game.NET.slots[{gi}].parts)==={json.dumps(json.dumps(GL, separators=(',', ':')))}", timeout=10000)
    check(True, "host lobby slot has guest parts")
    await A.click("#addBot"); await A.wait_for_function("document.querySelectorAll('#slots .slot b').length===3")
    bi = await A.evaluate("__game.NET.slots.findIndex(s=>s&&s.type==='bot')")
    check(bi > 0 and await A.evaluate(f"!!__game.NET.slots[{bi}].parts"), "bot slot has a random loadout")
    await B.click("#readyBtn"); await A.wait_for_function("!document.getElementById('startRace').disabled", timeout=15000)
    await A.click("#startRace")
    for pg in (A, B): await pg.wait_for_function("__game.state==='countdown'||__game.state==='race'", timeout=60000)
    await asyncio.sleep(1.5)
    hA = await A.evaluate(f"[0,{gi},{bi}].map(i=>__game.cartInfo(i))"); hB = await B.evaluate(f"[0,{gi},{bi}].map(i=>__game.cartInfo(i))")
    check(hA[1]["lo"] == GL and hB[1]["lo"] == GL, "guest cart modded on host + guest")
    check(hA[0]["lo"] == MOD and hB[0]["lo"] == MOD, "host cart modded on host + guest")
    check(hA[2]["lo"] == hB[2]["lo"], "bot loadout identical on both")
    check(hA[1]["cartVerts"] == hB[1]["cartVerts"] and hA[0]["cartVerts"] == hB[0]["cartVerts"], "same cart meshes on both peers")
    check(all(x["pm"] is None for x in hA[:2] + hB[:2]), "MP default: parts cosmetic only (no stat mods)")
    await asyncio.sleep(2); await B.keyboard.down("ArrowUp"); await asyncio.sleep(2.5); await B.screenshot(path=O + "mp-race.png")
    print("ERRORS:", {"host": ea, "guest": eb}); await ca.close(); await cb.close()

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=ARGS)
        if '--mponly' not in sys.argv: await solo(b)
        if MP: await mp(b)
        await b.close()
asyncio.run(main())
