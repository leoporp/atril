"""Prueba de punta a punta de Atril con dos aparatos (tablet y celular) y una nube falsa.
Uso: python3 tests/sync_test.py   (capturas en tests/shots/)
"""
import json, os, threading, functools, sys
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = os.path.join(ROOT, 'tests', 'shots'); os.makedirs(SHOTS, exist_ok=True)
REMOTE = {'data': None}

class H(SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_GET(self):
        if self.path.startswith('/__remote'):
            body = json.dumps(REMOTE['data'], sort_keys=True).encode()  # como Postgres: otro orden de llaves
            self.send_response(200); self.send_header('Content-Type', 'application/json'); self.end_headers(); self.wfile.write(body); return
        return super().do_GET()
    def do_PUT(self):
        n = int(self.headers.get('Content-Length', 0)); REMOTE['data'] = json.loads(self.rfile.read(n))
        self.send_response(200); self.end_headers(); self.wfile.write(b'{}')

srv = ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(H, directory=ROOT))
threading.Thread(target=srv.serve_forever, daemon=True).start()
URL = 'http://127.0.0.1:%d/' % srv.server_address[1]
STUB = open(os.path.join(ROOT, 'tests', 'supabase-stub.js')).read()
fails = []
def check(cond, msg):
    print(('ok   ' if cond else 'FAIL ') + msg)
    if not cond: fails.append(msg)

with sync_playwright() as p:
    b = p.chromium.launch()
    def device(w, h, scheme='light'):
        ctx = b.new_context(viewport={'width': w, 'height': h}, color_scheme=scheme)
        ctx.route('**/vendor/supabase.js', lambda r: r.fulfill(body=STUB, content_type='application/javascript'))
        pg = ctx.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
        pg.goto(URL); pg.wait_for_timeout(300)
        return pg, errs
    def login(pg, pw='bien'):
        pg.click('#sync-btn'); pg.fill('#a-email', 'leo@example.com'); pg.fill('#a-pass', pw); pg.click('#acct-form button[type=submit]'); pg.wait_for_timeout(500)
    def sync(pg):
        pg.evaluate('syncNow()'); pg.wait_for_timeout(400)
    def state(pg): return pg.evaluate('S')

    tab, terr = device(1180, 820)
    check('Entra con tu cuenta' in tab.inner_text('#syncnote'), 'sin sesión muestra el aviso para entrar')
    tab.screenshot(path=os.path.join(SHOTS, 'tablet-sin-sesion.png'))
    login(tab, 'mal')
    check('incorrectos' in tab.inner_text('#ov-acct'), 'contraseña mala muestra error')
    tab.screenshot(path=os.path.join(SHOTS, 'cuenta-error.png'))
    tab.fill('#a-pass', 'bien'); tab.click('#acct-form button[type=submit]'); tab.wait_for_timeout(500)
    check(tab.is_hidden('#ov-acct'), 'al entrar se cierra la hoja de cuenta')
    check(tab.evaluate('cloud.state') == 'ok', 'tablet sincronizada')
    check(REMOTE['data'] is not None, 'la nube recibió el estado inicial')

    # tablet: pieza del grupo con pendiente, y arrancar sesión con ella
    tab.click('[data-act=new-piece] >> nth=0'); tab.wait_for_timeout(150); tab.fill('#p-title', 'Skinny Love')
    tab.click('[data-act=p-group][data-v="1"]'); tab.fill('#p-newtodo', 'el puente'); tab.click('[data-act=p-todo-add]')
    tab.fill('#p-pos', '24'); tab.click('[data-act=p-save]'); tab.wait_for_timeout(900)
    check(any(v.get('title') == 'Skinny Love' for v in REMOTE['data']['pieces'].values()), 'la pieza llegó a la nube')
    tab.click('.playbtn >> nth=0'); tab.wait_for_timeout(900)
    check(tab.is_visible('#ov-session'), 'sesión abierta en la tablet')

    # celular: entra y ve lo de la tablet, incluida la sesión en curso
    cel, cerr = device(390, 844, 'dark')
    login(cel)
    cel.evaluate("location.hash='#hoy'"); cel.wait_for_timeout(200)
    check('tocando ahora' in cel.inner_text('#view').lower(), 'el celular ve la sesión que corre en la tablet')
    check('Skinny Love' in cel.inner_text('#view'), 'el celular ve la pieza')
    cel.screenshot(path=os.path.join(SHOTS, 'celular-sesion-remota.png'), full_page=True)

    # al mismo tiempo: celular registra a mano 10 min; tablet termina y guarda su sesión
    cel.click('[data-act=resume-ov]'); cel.wait_for_timeout(200); cel.click('[data-act=minimize]'); cel.wait_for_timeout(200)
    cel.evaluate("""() => { const id = 'manual-cel'; put('sessions', id, { day: todayKey(), minutes: 10, items: [], tags: ['tecnica'], note: 'escalas', at: Date.now(), timer: false }); }""")
    tab.click('[data-act=finish]'); tab.wait_for_timeout(200)
    tab.click('[data-act=reg-adjust]'); tab.click('[data-act=reg-min][data-v="15"]')
    tab.fill('[data-pos="piece:' + [k for k, v in state(tab)['pieces'].items() if v['title'] == 'Skinny Love'][0] + '"]', '32')
    tab.click('.check input[type=checkbox]'); tab.click('[data-act=reg-save]'); tab.wait_for_timeout(900)
    sync(cel); sync(tab); sync(cel)
    st, sc = state(tab), state(cel)
    check(len(st['sessions']) == 2 and len(sc['sessions']) == 2, 'los dos registros están en los dos aparatos (no se pisaron)')
    check(st['meta']['active'] is None and sc['meta']['active'] is None, 'la sesión terminada se cerró en ambos')
    pc = [v for v in sc['pieces'].values() if v['title'] == 'Skinny Love'][0]
    check(pc['pos'] == '32' and pc['todos'][0]['done'], 'el celular ve el compás 32 y el pendiente hecho')
    check(tab.evaluate('location.hash') == '#hoy' and tab.is_hidden('#ov-reg'), 'tras guardar vuelve a Hoy')
    check(tab.evaluate('layers.length') == 0, 'historial de hojas limpio')

    # borrar en el celular -> desaparece en la tablet
    cel.evaluate("del('sessions','manual-cel')"); cel.wait_for_timeout(900); sync(tab)
    check(len(state(tab)['sessions']) == 1, 'borrar en el celular se refleja en la tablet')

    # sin cambios no se sube nada de nuevo
    before = cel.evaluate('window.__pushes||0'); sync(cel); sync(cel)
    check(cel.evaluate('window.__pushes||0') == before, 'sin cambios no vuelve a subir (comparación estable)')

    # botón atrás de Android cierra la hoja, no sale de la app
    cel.evaluate("location.hash='#repertorio'"); cel.wait_for_timeout(200)
    cel.click('[data-act=rep-tab][data-v=grupo]'); cel.click('.row-main >> nth=0'); cel.wait_for_timeout(200)
    check(cel.is_visible('#ov-piece'), 'hoja de pieza abierta')
    cel.go_back(); cel.wait_for_timeout(300)
    check(cel.is_hidden('#ov-piece') and cel.evaluate('location.hash') == '#repertorio', 'atrás cierra la hoja y se queda en Repertorio')

    # sin internet: guarda local y avisa
    tab.context.set_offline(True)
    tab.evaluate("setMeta('settings', Object.assign({}, S.meta.settings, {goal: 20}))"); tab.wait_for_timeout(900)
    check(tab.evaluate('cloud.state') in ('offline', 'error'), 'sin internet queda marcado como pendiente')
    tab.context.set_offline(False); sync(tab); sync(cel)
    check(state(cel)['meta']['settings']['goal'] == 20, 'al volver internet se sube y el celular lo ve')

    # capturas
    tab.evaluate("location.hash='#hoy'"); tab.wait_for_timeout(300); tab.screenshot(path=os.path.join(SHOTS, 'tablet-hoy.png'))
    tab.evaluate("location.hash='#semana'"); tab.wait_for_timeout(300); tab.screenshot(path=os.path.join(SHOTS, 'tablet-semana.png'), full_page=True)
    tab.click('[data-act=acct]'); tab.wait_for_timeout(200); tab.screenshot(path=os.path.join(SHOTS, 'tablet-cuenta.png'))
    cel.evaluate("location.hash='#hoy'"); cel.wait_for_timeout(300); cel.screenshot(path=os.path.join(SHOTS, 'celular-hoy-oscuro.png'), full_page=True)

    errs = [e for e in terr + cerr if 'ERR_INTERNET_DISCONNECTED' not in e and 'Failed to fetch' not in e]
    check(not errs, 'sin errores en consola ' + (str(errs[:3]) if errs else ''))
    b.close()
srv.shutdown()
print('\n' + ('TODO BIEN' if not fails else '%d FALLAS' % len(fails)))
sys.exit(1 if fails else 0)
