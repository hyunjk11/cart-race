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
