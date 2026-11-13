"""Base de las pruebas de Atril: servidor local con una nube falsa (/__remote y /__blob/) y aparatos simulados."""
import json, os, threading, functools
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REMOTE = {'data': None, 'blobs': {}, 'bucket': True}

class H(SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
    def _send(self, code, body=b'{}', ctype='application/json'):
        self.send_response(code); self.send_header('Content-Type', ctype); self.send_header('Content-Length', str(len(body))); self.end_headers(); self.wfile.write(body)
    def do_GET(self):
        if self.path.startswith('/__remote'):
            return self._send(200, json.dumps(REMOTE['data'], sort_keys=True).encode())  # como Postgres: otro orden de llaves
        if self.path.startswith('/__blob/'):
            b = REMOTE['blobs'].get(self.path[8:])
            return self._send(200, b, 'audio/webm') if b is not None else self._send(404)
        return super().do_GET()
    def do_PUT(self):
        n = int(self.headers.get('Content-Length', 0)); body = self.rfile.read(n)
        if self.path.startswith('/__blob/'):
            if not REMOTE['bucket']: return self._send(404)
            REMOTE['blobs'][self.path[8:]] = body; return self._send(200)
        REMOTE['data'] = json.loads(body); self._send(200)
    def do_DELETE(self):
        REMOTE['blobs'].pop(self.path[8:], None); self._send(200)

def serve():
    srv = ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(H, directory=ROOT))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, 'http://127.0.0.1:%d/' % srv.server_address[1]

STUB = open(os.path.join(ROOT, 'tests', 'supabase-stub.js')).read()
SKIP_COVER = "try{sessionStorage.setItem('atril.cover','1')}catch(e){}"

class Checks:
    def __init__(self): self.fails = []
    def __call__(self, cond, msg):
        print(('ok   ' if cond else 'FAIL ') + msg)
        if not cond: self.fails.append(msg)
    def done(self):
        print('\n' + ('TODO BIEN' if not self.fails else '%d FALLAS' % len(self.fails)))
        return 1 if self.fails else 0

def device(browser, url, w, h, scheme='light', cover=False, state=None, sw='block', perms=None, path=''):
    """Un aparato: contexto propio (su localStorage), nube falsa en vez de Supabase."""
    ctx = browser.new_context(viewport={'width': w, 'height': h}, color_scheme=scheme, service_workers=sw, permissions=perms or [])
    ctx.route('**/vendor/supabase.js', lambda r: r.fulfill(body=STUB, content_type='application/javascript'))
    ctx.route('**://example.com/**', lambda r: r.fulfill(body='<title>fuera</title>enlace de fuera', content_type='text/html'))
    if not cover: ctx.add_init_script(SKIP_COVER)
    if state is not None: ctx.add_init_script('if(!localStorage.getItem("atril.v4"))localStorage.setItem("atril.v4", %s)' % json.dumps(json.dumps(state)))
    pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    pg.goto(url + path); pg.wait_for_timeout(350)
    return pg, errs

def login(pg, pw='bien'):
    pg.click('#sync-btn'); pg.fill('#a-email', 'leo@example.com'); pg.fill('#a-pass', pw); pg.click('#acct-form button[type=submit]'); pg.wait_for_timeout(500)
def sync(pg):
    pg.evaluate('syncNow()'); pg.wait_for_timeout(400)
def state(pg): return pg.evaluate('S')
def real_errors(errs): return [e for e in errs if 'ERR_INTERNET_DISCONNECTED' not in e and 'Failed to fetch' not in e and 'Failed to load resource' not in e]
