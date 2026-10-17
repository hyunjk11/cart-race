"""Imported first by every test: points pages at CART_BASE (default http://localhost:8080/) and turns on the
debug hooks (?debug=1 exposes window.__game, which production builds hide)."""
import os, re
from urllib.parse import urlsplit, urlunsplit
from playwright.async_api import Page
BASE = os.environ.get('CART_BASE', 'http://localhost:8080/').rstrip('/') + '/'
def fix(url):
    url = re.sub(r'^https?://(localhost:8080|hyunjk11\.github\.io/cart-race)/?', BASE, url)
    p = urlsplit(url)
    if p.netloc != urlsplit(BASE).netloc: return url
    q = p.query
    if 'debug=1' not in q: q = 'debug=1' + ('&' + q if q else '')
    return urlunsplit((p.scheme, p.netloc, p.path, q, p.fragment))
_goto = Page.goto
async def goto(self, url, *a, **k): return await _goto(self, fix(url), *a, **k)
Page.goto = goto
# First-run tutorials (tips / shopping explainer) would cover the screen in older tests: mark them as seen,
# unless a test opts in with `_env.TUTORIAL = True` before creating contexts.
TUTORIAL = False
from playwright.async_api import Browser
_SEEN = "try{if(!localStorage.getItem('cartTutShop'))localStorage.setItem('cartTutShop','1');if(!localStorage.getItem('cartTips'))localStorage.setItem('cartTips','[\"*\"]')}catch(e){}"
_nc, _np = Browser.new_context, Browser.new_page
async def new_context(self, *a, **k):
    c = await _nc(self, *a, **k)
    if not TUTORIAL: await c.add_init_script(_SEEN)
    return c
async def new_page(self, *a, **k):
    if TUTORIAL: return await _np(self, *a, **k)
    c = await new_context(self, *a, **k); pg = await c.new_page(); return pg
Browser.new_context = new_context; Browser.new_page = new_page
