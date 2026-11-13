"""Sincronización entre dos aparatos (tablet y celular) contra una nube falsa.
Uso: python3 tests/sync_test.py"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from base import *
from playwright.sync_api import sync_playwright

srv, URL = serve(); check = Checks()
with sync_playwright() as p:
    b = p.chromium.launch()
    tab, terr = device(b, URL, 1180, 820)
    check('Entra con tu cuenta' in tab.inner_text('#syncnote'), 'sin sesión muestra el aviso para entrar')
    login(tab, 'mal')
    check('incorrectos' in tab.inner_text('#ov-acct'), 'contraseña mala muestra error')
    tab.fill('#a-pass', 'bien'); tab.click('#acct-form button[type=submit]'); tab.wait_for_timeout(500)
    check(tab.is_hidden('#ov-acct'), 'al entrar se cierra la hoja de cuenta')
    check(tab.evaluate('cloud.state') == 'ok', 'tablet sincronizada')
    check(REMOTE['data'] is not None, 'la nube recibió el estado inicial')

    # tablet: pieza del grupo con pendiente, y arrancar sesión con ella
    tab.click('[data-act=new-piece] >> nth=0'); tab.wait_for_timeout(150); tab.fill('#p-title', 'Skinny Love')
    tab.click('[data-act=p-kind][data-v="grupo"]'); tab.fill('#p-newtodo', 'el puente'); tab.click('[data-act=p-todo-add]')
    tab.fill('#p-pos', '24'); tab.click('[data-act=p-save]'); tab.wait_for_timeout(900)
    check(any(v.get('title') == 'Skinny Love' for v in REMOTE['data']['pieces'].values()), 'la pieza llegó a la nube')
    tab.click('.playbtn >> nth=0'); tab.wait_for_timeout(900)
    check(tab.is_visible('#ov-session'), 'sesión abierta en la tablet')

    # celular: entra y ve lo de la tablet, incluida la sesión en curso
    cel, cerr = device(b, URL, 390, 844, 'dark')
    login(cel)
    check('tocando ahora' in cel.inner_text('#view').lower(), 'el celular ve la sesión que corre en la tablet')
    check('Skinny Love' in cel.inner_text('#view'), 'el celular ve la pieza')

    # al mismo tiempo: celular registra a mano 10 min; tablet termina y guarda su sesión
    cel.click('[data-act=resume-ov]'); cel.wait_for_timeout(200); cel.click('[data-act=minimize]'); cel.wait_for_timeout(200)
    cel.evaluate("put('sessions', 'manual-cel', { day: todayKey(), minutes: 10, items: [], tags: ['tecnica'], note: 'escalas', at: Date.now(), timer: false })")
    tab.click('[data-act=finish]'); tab.wait_for_timeout(200)
    tab.click('[data-act=reg-adjust]'); tab.click('[data-act=reg-min][data-v="15"]')
    pid = [k for k, v in state(tab)['pieces'].items() if v['title'] == 'Skinny Love'][0]
    tab.fill('[data-pos="piece:%s"]' % pid, '32')
    tab.click('#ov-reg .check input[type=checkbox]'); tab.click('[data-act=reg-save]'); tab.wait_for_timeout(900)
    sync(cel); sync(tab); sync(cel)
    st, sc = state(tab), state(cel)
    check(len(st['sessions']) == 2 and len(sc['sessions']) == 2, 'los dos registros están en los dos aparatos (no se pisaron)')
    check(st['meta']['active'] is None and sc['meta']['active'] is None, 'la sesión terminada se cerró en ambos')
    pc = sc['pieces'][pid]
    check(pc['pos'] == '32' and pc['todos'][0]['done'], 'el celular ve el compás 32 y el pendiente hecho')
    check(tab.evaluate('location.hash') == '#hoy' and tab.is_hidden('#ov-reg'), 'tras guardar vuelve a Hoy')
    check(tab.evaluate('layers.length') == 0, 'historial de hojas limpio')

    # borrar en el celular -> desaparece en la tablet
    cel.evaluate("del('sessions','manual-cel')"); cel.wait_for_timeout(900); sync(tab)
    check(len(state(tab)['sessions']) == 1, 'borrar en el celular se refleja en la tablet')

    # un curso creado en la tablet llega al celular; los de fábrica no se duplican
    tab.evaluate("put('courses', 'c-impro', { name: 'Curso de improvisación', at: Date.now() })"); tab.wait_for_timeout(900); sync(cel)
    check(sorted(state(cel)['courses'].keys()) == ['armonia', 'c-impro', 'piano'], 'cursos: los dos de fábrica más el nuevo, sin duplicados')

    # sin cambios no se sube nada de nuevo
    before = cel.evaluate('window.__pushes||0'); sync(cel); sync(cel)
    check(cel.evaluate('window.__pushes||0') == before, 'sin cambios no vuelve a subir (comparación estable)')

    # botón atrás de Android cierra la hoja, no sale de la app
    cel.evaluate("location.hash='#repertorio'"); cel.wait_for_timeout(300)
    cel.click('[data-act=rep-tab][data-v=grupo]'); cel.click('.row-main >> nth=0'); cel.wait_for_timeout(200)
    check(cel.is_visible('#ov-piece'), 'hoja de pieza abierta')
    cel.go_back(); cel.wait_for_timeout(300)
    check(cel.is_hidden('#ov-piece') and cel.evaluate('location.hash') == '#repertorio', 'atrás cierra la hoja y se queda en Repertorio')

    # sin internet: guarda local y avisa
    tab.context.set_offline(True)
    tab.evaluate("setSetting('goal', 20)"); tab.wait_for_timeout(900)
    check(tab.evaluate('cloud.state') in ('offline', 'error'), 'sin internet queda marcado como pendiente')
    tab.context.set_offline(False); sync(tab); sync(cel)
    check(state(cel)['meta']['settings']['goal'] == 20, 'al volver internet se sube y el celular lo ve')

    errs = real_errors(terr + cerr)
    check(not errs, 'sin errores en consola ' + (str(errs[:3]) if errs else ''))
    b.close()
srv.shutdown()
sys.exit(check.done())
