"""Capturas de todas las pantallas con datos de ejemplo (claro y oscuro, tablet y celular).
Uso: python3 tests/pantallas.py   -> tests/shots/pantallas/
"""
import json, os, threading, functools, datetime
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'tests', 'shots', 'pantallas'); os.makedirs(OUT, exist_ok=True)
class H(SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(H, directory=ROOT))
threading.Thread(target=srv.serve_forever, daemon=True).start()
URL = 'http://127.0.0.1:%d/' % srv.server_address[1]

today = datetime.date.today(); mon = today - datetime.timedelta(days=today.weekday())
day = lambda n: (mon + datetime.timedelta(days=n)).isoformat()
past = [d for d in range(today.weekday())][:3]
S = {'v': 4, 'pieces': {
  'p1': {'title': 'Skinny Love', 'group': True, 'state': 'aprendiendo', 'track': 'compas', 'pos': '32', 'todos': [{'id': 't1', 'text': 'el puente', 'done': False}], 'at': 1, 'u': 1},
  'p2': {'title': 'Nocturno en mi menor', 'group': False, 'state': 'puliendo', 'track': 'tiempo', 'pos': '1:40', 'todos': [], 'at': 1, 'u': 1},
  'p3': {'title': 'River flows in you', 'group': False, 'state': 'sale', 'track': 'compas', 'pos': '', 'todos': [], 'at': 1, 'u': 1}},
  'sessions': {}, 'meta': {'courses': {'piano': {'lesson': '12', 'song': 'Clocks'}, 'armonia': {'lesson': '4'}}, 'active': None, 'settings': {'goal': 10},
  'group': {'next': (today + datetime.timedelta(days=2)).isoformat()}}, 'tomb': {'sessions': {}, 'pieces': {}}, 'mu': {}}
for i, d in enumerate(past):
    S['sessions']['s%d' % i] = {'day': day(d), 'minutes': [15, 10, 20][i], 'items': [{'t': 'piece', 'id': 'p1', 'pos': '28'}], 'tags': ['grupo'], 'note': 'el puente se resiste' if i == 0 else '', 'at': i, 'timer': True, 'u': 1}

with sync_playwright() as p:
    b = p.chromium.launch()
    def shot(name, w, h, scheme, hash_='#hoy', act=None, full=True):
        ctx = b.new_context(viewport={'width': w, 'height': h}, color_scheme=scheme)
        pg = ctx.new_page()
        pg.add_init_script('localStorage.setItem("atril.v4", %s)' % json.dumps(json.dumps(S)))
        pg.goto(URL + hash_); pg.wait_for_timeout(500)
        if act: act(pg); pg.wait_for_timeout(400)
        pg.screenshot(path=os.path.join(OUT, name + '.png'), full_page=full)
        ctx.close()
    for sch in ('light', 'dark'):
        shot('tablet-hoy-' + sch, 1180, 820, sch, full=False)
        shot('celular-hoy-' + sch, 390, 844, sch)
    shot('tablet-repertorio-light', 1180, 820, 'light', '#repertorio')
    shot('celular-grupo-dark', 390, 844, 'dark', '#repertorio', lambda pg: pg.click('[data-act=rep-tab][data-v=grupo]'))
    shot('tablet-cursos-light', 1180, 820, 'light', '#cursos')
    shot('celular-semana-light', 390, 844, 'light', '#semana')
    shot('tablet-sesion-dark', 1180, 820, 'dark', '#hoy', lambda pg: pg.click('.hero [data-act=go]'), full=False)
    def reg(pg):
        pg.click('.hero [data-act=go]'); pg.wait_for_timeout(200); pg.click('[data-act=finish]')
    shot('celular-registro-light', 390, 844, 'light', '#hoy', reg)
    shot('celular-pieza-dark', 390, 844, 'dark', '#hoy', lambda pg: pg.click('.row-main >> nth=0'))
    def party(pg):
        reg(pg); pg.wait_for_timeout(200); pg.click('[data-act=reg-save]'); pg.wait_for_timeout(500)
    shot('tablet-celebracion-light', 1180, 820, 'light', '#hoy', party, full=False)
    b.close()
srv.shutdown()
print('capturas en', OUT)
