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

# ---- shared pass/fail (Batch F): every test exits non-zero on failure. Uncaught exceptions already exit 1; on top of
# that we watch stdout and fail if a line says FAIL, or an `ERRORS`/`errors` line reports a non-empty list/dict of lists.
import sys, atexit, json as _json
FAILED = []
def fail(why): FAILED.append(str(why)); sys.__stdout__.write('FAIL: %s\n' % why)
def _bad_errors(line):
    m = re.match(r'\s*ERRORS?:?\s*(.*)$', line, re.I)
    if not m: return False
    rest = m.group(1).strip()
    if rest in ('', '[]', '{}'): return False
    try: v = _json.loads(rest)
    except Exception:
        try: import ast; v = ast.literal_eval(rest)
        except Exception: return rest not in ('none', 'None')
    if isinstance(v, dict): return any(v.values())
    return bool(v)
class _Tee:
    def __init__(self, s): self.s, self.buf = s, ''
    def write(self, t):
        self.buf += t
        while '\n' in self.buf:
            line, self.buf = self.buf.split('\n', 1)
            if re.search(r'\bFAIL\b', line) or _bad_errors(line): FAILED.append(line[:200])
        return self.s.write(t)
    def flush(self): self.s.flush()
    def __getattr__(self, k): return getattr(self.s, k)
sys.stdout = _Tee(sys.stdout)
def _exit():
    sys.stdout.flush()
    if FAILED:
        sys.__stdout__.write('TEST FAILED (%d): %s\n' % (len(FAILED), ' || '.join(FAILED[:5]))); sys.__stdout__.flush(); os._exit(1)
atexit.register(_exit)
# retry helper for flaky network steps (public PeerJS broker)
async def retry(fn, tries=3, delay=2.0):
    import asyncio
    for i in range(tries):
        try: return await fn()
        except Exception as e:
            if i == tries - 1: raise
            print('retry %d/%d after: %s' % (i + 1, tries, str(e).splitlines()[0][:120])); await asyncio.sleep(delay)
# screenshots: old tests write to /workspace/cart-race-shots/; redirect to $SHOTS (default there if writable, else tmp)
import tempfile
SHOTS = os.environ.get('SHOTS') or '/workspace/cart-race-shots'
try: os.makedirs(SHOTS, exist_ok=True)
except OSError: SHOTS = os.path.join(tempfile.gettempdir(), 'cart-race-shots'); os.makedirs(SHOTS, exist_ok=True)
_shot = Page.screenshot
async def screenshot(self, *a, **k):
    p = k.get('path')
    if p: k['path'] = str(p).replace('/workspace/cart-race-shots', SHOTS)
    return await _shot(self, *a, **k)
Page.screenshot = screenshot
