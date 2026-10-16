import asyncio, sys, json
from playwright.async_api import async_playwright
ARGS=["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader"]
BASE=sys.argv[1] if len(sys.argv)>1 else "http://localhost:8080/"
O="/workspace/cart-race-shots/fit10-"
VPS=[("s20-toolbar",412,780),("s20",412,915),("s9",412,846),("small360",360,640),("se",375,667),("ip13",390,664),
     ("s20-land",915,360),("s20-land-full",915,412),("small-land",640,360),("se-land",667,375),("ip13-land",844,390)]
VPS=[v for v in VPS if len(sys.argv)<3 or v[0] in sys.argv[2].split(",")]
AUDIT="""(mustSel)=>{const W=innerWidth,H=innerHeight,bad=[];
 const vis=e=>{if(!e)return false;const s=getComputedStyle(e);if(s.display==='none'||s.visibility==='hidden'||+s.opacity<0.05)return false;const r=e.getBoundingClientRect();if(r.width<2||r.height<2)return false;let p=e;while(p){const q=getComputedStyle(p);if(q.display==='none'||q.visibility==='hidden'||+q.opacity<0.05)return false;p=p.parentElement}return true};
 const inside=r=>r.left>=-1&&r.top>=-1&&r.right<=W+1&&r.bottom<=H+1;
 const scroller=e=>{let p=e.parentElement;while(p&&p!==document.body){const q=getComputedStyle(p);if((/(auto|scroll)/.test(q.overflowY)&&p.scrollHeight>p.clientHeight+1)||(/(auto|scroll)/.test(q.overflowX)&&p.scrollWidth>p.clientWidth+1))return p;p=p.parentElement}return null};
 const top=document.querySelectorAll('#title:not(.hidden),#mp:not(.hidden),#charSel:not(.hidden),#finish:not(.hidden)');
 const roots=top.length?[top[top.length-1]]:[document.body];
 for(const R of roots) for(const e of R.querySelectorAll('button,select,input,[data-key]')){ if(!vis(e))continue; const r=e.getBoundingClientRect(); if(inside(r))continue; const sc=scroller(e); if(sc&&inside(sc.getBoundingClientRect()))continue; bad.push((e.id||e.textContent.trim().slice(0,14))+' '+[r.left,r.top,r.right,r.bottom].map(Math.round).join(','));}
 for(const s of mustSel){const e=document.querySelector(s); if(!vis(e))continue; const r=e.getBoundingClientRect(); if(!inside(r)) bad.push('FIT '+s+' '+[r.left,r.top,r.right,r.bottom].map(Math.round).join(','));}
 return bad}"""
HUD=['#hudL','#hudR','#hudB','#minimap','#shopHud','#spec','#touch .dpad','#touch .tr','#pa','#mute']
async def swipe(cdp, x, y, dy):
    await cdp.send("Input.dispatchTouchEvent",{"type":"touchStart","touchPoints":[{"x":x,"y":y}]})
    for k in range(1,9): await cdp.send("Input.dispatchTouchEvent",{"type":"touchMove","touchPoints":[{"x":x,"y":y-dy*k/8}]}); await asyncio.sleep(0.03)
    await cdp.send("Input.dispatchTouchEvent",{"type":"touchEnd","touchPoints":[]}); await asyncio.sleep(0.6)
async def run(b, name, w, h):
    res={}; errs=[]
    c=await b.new_context(viewport={"width":w,"height":h},device_scale_factor=2,is_mobile=True,has_touch=True,user_agent="Mozilla/5.0 (Linux; Android 13; SM-G981N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36")
    pg=await c.new_page(); ev=pg.evaluate; cdp=await c.new_cdp_session(pg)
    pg.on("pageerror",lambda e: errs.append(str(e))); pg.on("console",lambda x: errs.append(x.text) if x.type=="error" else None)
    async def audit(tag, shot=True):
        bad=await ev(AUDIT, HUD); res[tag]=bad
        if shot: await pg.screenshot(path=f"{O}{name}-{tag}.png")
    async def swipetest(tag, sel, btn):
        el=await ev(f"(()=>{{const e=document.querySelector('{sel}');const r=e.getBoundingClientRect();return [r.left+r.width/2,r.top+r.height*0.45,e.scrollTop,e.scrollHeight-e.clientHeight]}})()")
        if el[3] > 4:
            await swipe(cdp, el[0], el[1], min(260, h*0.45))
            st=await ev(f"document.querySelector('{sel}').scrollTop")
            btnIn=await ev(f"(()=>{{const r=document.querySelector('{btn}').getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth}})()")
            res[tag+"-swipe"]=f"scroll {el[2]}->{st} of {el[3]} btnVisible={btnIn}" + ("" if st>el[2] and btnIn else " FAIL")
        else:
            btnIn=await ev(f"(()=>{{const r=document.querySelector('{btn}').getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight}})()")
            res[tag+"-swipe"]=f"fits (no scroll needed) btnVisible={btnIn}" + ("" if btnIn else " FAIL")
    await pg.goto(BASE+"?map=mart&nointro"); await pg.wait_for_function("window.__game&&__game.N>0",timeout=30000); await asyncio.sleep(0.8)
    await audit("title"); await swipetest("title", ".tpanel", "#startBtn")
    await ev("document.querySelector('.tpanel').scrollTop=0")
    await ev("s=>{const e=document.querySelector(s);e.scrollIntoView({block:'center'});e.click()}", "#charBtn"); await asyncio.sleep(0.8); await audit("charsel"); await swipetest("charsel", ".cspanel", "#charOk")
    await ev("s=>{const e=document.querySelector(s);e.scrollIntoView({block:'center'});e.click()}", "#charLineup"); await asyncio.sleep(0.8); await audit("lineup")
    await ev("s=>{const e=document.querySelector(s);e.scrollIntoView({block:'center'});e.click()}", "#charBack"); await asyncio.sleep(0.3)
    await ev("s=>{const e=document.querySelector(s);e.scrollIntoView({block:'center'});e.click()}", "#mpBtn"); await asyncio.sleep(0.4); await audit("mpmenu", False)
    await ev("""(()=>{document.getElementById('mpMenu').classList.add('hidden');document.getElementById('mpLobby').classList.remove('hidden');document.getElementById('roomCode').textContent='AB12';
      document.getElementById('slots').innerHTML=[0,1,2,3].map(i=>`<div class="slot"><span class="sch">🥭</span><b>플레이어${i}</b> <small class="scn">망고</small> <span class="rd on">준비 완료</span>${i?'<button>내보내기</button>':''}</div>`).join('');
      for(let k=0;k<6;k++){const d=document.createElement('div');d.textContent='채팅 메시지 '+k;document.getElementById('chatLog').appendChild(d)} })()""")
    await asyncio.sleep(0.3); await audit("lobby"); await swipetest("lobby", ".mppanel", "#startRace")
    await ev("document.getElementById('mpLobby').classList.add('hidden');document.getElementById('mpMenu').classList.remove('hidden')"); await ev("s=>{const e=document.querySelector(s);e.scrollIntoView({block:'center'});e.click()}", "#mpBack"); await asyncio.sleep(0.3)
    await ev("s=>{const e=document.querySelector(s);e.scrollIntoView({block:'center'});e.click()}", "#startBtn"); await pg.wait_for_function("__game.state==='race'",timeout=60000); await asyncio.sleep(2.5)
    await ev("__game.pa('현재 1위는 노랑 카트 고객님입니다!')"); await asyncio.sleep(0.6)
    await audit("race")
    await ev("__game.debugNearFinish()"); await ev("__game.keys.ArrowUp=true")
    await pg.wait_for_function("__game.podium",timeout=60000); await asyncio.sleep(1.2); await audit("podium")
    # shop: spectate + receipt
    await pg.goto(BASE+"?map=freezer&mode=shop&nointro"); await pg.wait_for_function("window.__game&&__game.N>0",timeout=30000)
    await ev("s=>{const e=document.querySelector(s);e.scrollIntoView({block:'center'});e.click()}", "#startBtn"); await pg.wait_for_function("__game.state==='race'",timeout=60000); await ev("__game.simulate(3)")
    await ev("(()=>{const g=__game,p=g.player,sh=g.shop;for(const k of sh.S(p).list) if(!sh.has(p,k)) sh.S(p).items.push({k,sale:0,broken:0,wrong:0});g.debugNearFinish();g.keys.ArrowUp=true})()")
    await pg.wait_for_function("__game.player.finished",timeout=30000); await asyncio.sleep(1.2); await audit("spectate")
    await ev("s=>{const e=document.querySelector(s);e.scrollIntoView({block:'center'});e.click()}", "#specFF"); await pg.wait_for_function("__game.podium",timeout=180000); await asyncio.sleep(1.2); await audit("receipt")
    await swipetest("receipt", "#finish .panel", "#restart")
    res["errors"]=errs[:3]; await c.close(); return res
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(args=ARGS); allok=True
        for name,w,h in VPS:
            try: r=await run(b,name,w,h)
            except Exception as e: r={"EXC":str(e)[:300]}
            bad={k:v for k,v in r.items() if (isinstance(v,list) and v) or (isinstance(v,str) and 'FAIL' in v) or k=='EXC'}
            allok = allok and not bad
            print(name, f"{w}x{h}", "OK" if not bad else json.dumps(bad,ensure_ascii=False)[:900])
            for k,v in r.items():
                if k.endswith('swipe'): print("   ",k,v)
        print("FIT AUDIT", "PASS" if allok else "FAIL"); await b.close()
asyncio.run(main())
