"""Capturas de todas las pantallas con datos de ejemplo (claro y oscuro, tablet y celular).
Uso: python3 tests/pantallas.py [nombre...]   -> tests/shots/pantallas/"""
import sys, os, datetime
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from base import *
from playwright.sync_api import sync_playwright

OUT = os.path.join(ROOT, 'tests', 'shots', 'pantallas'); os.makedirs(OUT, exist_ok=True)
srv, URL = serve()
today = datetime.date.today(); mon = today - datetime.timedelta(days=today.weekday())
day = lambda n: (mon + datetime.timedelta(days=n)).isoformat()
ago = lambda n: (today - datetime.timedelta(days=n)).isoformat()
ms = lambda n: int((datetime.datetime.now() - datetime.timedelta(days=n)).timestamp() * 1000)
S = {'v': 5, 'pieces': {
  'p1': {'title': 'Skinny Love', 'kind': 'grupo', 'group': True, 'state': 'aprendiendo', 'track': 'compas', 'pos': '32', 'link': 'https://example.com/partitura', 'video': 'https://example.com/tutorial', 'todos': [{'id': 't1', 'text': 'el puente', 'done': False}], 'at': ms(20), 'u': 1},
  'p2': {'title': 'Nocturno en mi menor', 'kind': 'mia', 'state': 'puliendo', 'track': 'tiempo', 'pos': '1:40', 'todos': [], 'at': ms(20), 'u': 1},
  'p3': {'title': 'River flows in you', 'kind': 'mia', 'state': 'sale', 'track': 'compas', 'pos': '', 'todos': [], 'at': ms(60), 'u': 1},
  'p4': {'title': 'Desafío: blues en 12 compases', 'kind': 'desafio', 'state': 'aprendiendo', 'track': 'tiempo', 'pos': '', 'video': 'https://example.com/desafio', 'todos': [], 'at': ms(3), 'u': 1}},
  'courses': {'piano': {'name': 'Curso de piano', 'lesson': '12', 'song': 'Clocks', 'link': 'https://example.com/v12', 'u': 1}, 'armonia': {'name': 'Curso de armonía', 'lesson': '4', 'u': 1}},
  'recs': {'r1': {'t': 'piece', 'ref': 'p2', 'at': ms(40), 'dur': 28, 'mime': 'audio/webm', 'up': True, 'path': 'u1/r1', 'u': 1}, 'r2': {'t': 'piece', 'ref': 'p2', 'at': ms(2), 'dur': 30, 'mime': 'audio/webm', 'up': False, 'u': 1}},
  'sessions': {}, 'meta': {'active': None, 'settings': {'goal': 10, 'name': 'Leo'}, 'group': {'next': (today + datetime.timedelta(days=2)).isoformat()}}, 'tomb': {}, 'mu': {}}
n = 0
for d in range(1, today.day):  # sesiones regadas por el mes
    if d % 3 == 0 or d % 4 == 1:
        dd = today.replace(day=d).isoformat(); n += 1
        S['sessions']['s%d' % n] = {'day': dd, 'minutes': [15, 10, 20, 8, 25][n % 5], 'items': [{'t': 'piece', 'id': ['p1', 'p2', 'p1', 'p4'][n % 4], 'pos': '28'}] if n % 5 else [{'t': 'course', 'id': 'piano', 'pos': '11'}], 'tags': [], 'note': 'el puente se resiste' if n == 2 else '', 'at': n, 'timer': True, 'u': 1}

want = sys.argv[1:]
with sync_playwright() as p:
    b = p.chromium.launch()
    def shot(name, w, h, scheme, path='#hoy', act=None, full=True, cover=False, st=S):
        if want and not any(x in name for x in want): return
        pg, errs = device(b, URL, w, h, scheme, cover=cover, state=st, path=path)
        pg.wait_for_timeout(300)
        if act: act(pg); pg.wait_for_timeout(450)
        pg.screenshot(path=os.path.join(OUT, name + '.png'), full_page=full)
        if real_errors(errs): print(name, 'ERRORES', errs[:3])
        pg.context.close()
    T, C = (1180, 820), (390, 844)
    for sch in ('light', 'dark'):
        shot('tablet-hoy-' + sch, *T, sch, full=True)
        shot('celular-hoy-' + sch, *C, sch)
    def tapa(pg):
        pg.wait_for_timeout(1200); pg.evaluate("sessionStorage.removeItem('atril.cover'); showCover()")
    shot('tablet-portada-light', *T, 'light', full=False, act=tapa)
    def tapa2(pg):
        tapa(pg); pg.wait_for_timeout(420)
    shot('tablet-portada-abriendo-light', *T, 'light', full=False, act=tapa2)
    shot('celular-portada-primera-dark', *C, 'dark', cover=True, full=False, st=dict(S, meta=dict(S['meta'], settings={'goal': 10})))
    shot('tablet-repertorio-light', *T, 'light', '#repertorio')
    shot('celular-desafios-dark', *C, 'dark', '#repertorio', lambda pg: pg.click('[data-act=rep-tab][data-v=desafio]'))
    shot('tablet-cursos-light', *T, 'light', '#cursos')
    shot('tablet-diario-light', *T, 'light', '#diario')
    shot('celular-diario-dark', *C, 'dark', '#diario')
    shot('tablet-sesion-dark', *T, 'dark', '#hoy', lambda pg: pg.click('.hero [data-act=mini]'), full=False)
    def reg(pg):
        pg.click('.hero [data-act=go]'); pg.wait_for_timeout(200); pg.click('[data-act=finish]')
    shot('celular-registro-light', *C, 'light', '#hoy', reg, full=False)
    shot('celular-pieza-light', *C, 'light', '#hoy', lambda pg: pg.click('.row-main >> nth=0'), full=False)
    shot('chico-hoy-light', 360, 740, 'light')
    shot('tablet-vertical-hoy-light', 820, 1180, 'light')
    def grab(pg):
        pg.click('.row-main >> nth=0'); pg.wait_for_timeout(200); pg.click('#ov-piece [data-act=rec-open]')
    shot('celular-grabar-light', *C, 'light', '#hoy', grab, full=False)
    shot('tablet-compartir-light', *T, 'light', '?title=Clase%2013%3A%20Viva%20la%20vida&text=https%3A%2F%2Fexample.com%2Fcurso%2Fv13', lambda pg: pg.click('[data-act=share-dest][data-id=piano]'), full=False)
    shot('celular-cuenta-light', *C, 'light', '#hoy', lambda pg: pg.click('#sync-btn'), full=False)
    def party(pg):
        reg(pg); pg.wait_for_timeout(200); pg.click('[data-act=reg-save]'); pg.wait_for_timeout(350)
    shot('tablet-celebracion-light', *T, 'light', '#hoy', party, full=False)
    SN = dict(S, meta=dict(S['meta'], settings={'goal': 10}))
    shot('ficha-celular', *C, 'light', full=False, st=SN)
    shot('ficha-celular-diario', *C, 'light', '#diario', full=False, st=SN)
    shot('ficha-tablet', *T, 'light', full=False, st=SN)
    b.close()
srv.shutdown()
print('capturas en', OUT)
