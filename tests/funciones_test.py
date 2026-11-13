"""Funciones de Atril una por una (un solo aparato, nube falsa).
Uso: python3 tests/funciones_test.py"""
import sys, os, time, datetime, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from base import *
from playwright.sync_api import sync_playwright

srv, URL = serve(); check = Checks()
now = int(time.time() * 1000); DAY = 86400000
today = datetime.date.today().isoformat()
V4 = {'v': 4, 'sessions': {}, 'pieces': {'old': {'title': 'Vieja del grupo', 'group': True, 'state': 'aprendiendo', 'u': 5}},
      'meta': {'courses': {'piano': {'lesson': '12', 'song': 'Clocks'}, 'armonia': {}}, 'active': None, 'settings': {'goal': 15}, 'group': {}}, 'tomb': {'sessions': {}, 'pieces': {}}, 'mu': {'courses': 77}}
BASE = {'v': 5, 'pieces': {
    'p1': {'title': 'Skinny Love', 'kind': 'grupo', 'group': True, 'state': 'aprendiendo', 'track': 'compas', 'pos': '32', 'link': 'https://example.com/partitura', 'video': 'https://example.com/video', 'todos': [], 'at': now - 5 * DAY, 'u': 1},
    'p9': {'title': 'River flows in you', 'kind': 'mia', 'state': 'sale', 'todos': [], 'at': now - 10 * DAY, 'u': 1}},
  'courses': {}, 'recs': {}, 'sessions': {},
  'meta': {'active': None, 'settings': {'goal': 10, 'name': 'Leo'}, 'group': {}}, 'tomb': {}, 'mu': {}}
BASE2 = dict(BASE, sessions={'s1': {'day': today, 'minutes': 12, 'items': [{'t': 'piece', 'id': 'p1'}], 'tags': [], 'note': '', 'at': now - 1000, 'timer': True, 'u': 1}})

with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'])
    allerr = []

    # 1. datos viejos (v4)
    pg, e = device(b, URL, 390, 844, state=V4); allerr += e
    st = state(pg)
    check(st['courses']['piano'].get('lesson') == '12' and st['courses']['piano'].get('song') == 'Clocks', 'v4: el curso de piano conserva vídeo y canción')
    check('armonia' in st['courses'] and 'courses' not in st['meta'], 'v4: armonía sigue y meta.courses desaparece')
    check(pg.evaluate("kindOf(S.pieces.old)") == 'grupo' and st['meta']['settings']['goal'] == 15, 'v4: la pieza de grupo y los ajustes se conservan')
    pg.context.close()

    # 2. portada
    pg, e = device(b, URL, 390, 844, cover=True); allerr += e
    check(pg.is_visible('#cover #cv-name'), 'portada: la primera vez pregunta de quién es el cuaderno')
    pg.fill('#cv-name', 'Leo'); pg.keyboard.press('Enter'); pg.wait_for_timeout(1000)
    check(pg.is_hidden('#cover') and state(pg)['meta']['settings'].get('name') == 'Leo', 'portada: guarda el nombre y se abre')
    check('Leo' in pg.inner_text('.top-r'), 'saludo con el nombre')
    pg.reload(); pg.wait_for_timeout(400)
    check(pg.is_hidden('#cover'), 'portada: no reaparece al recargar en la misma sesión')
    pg2 = pg.context.new_page(); pg2.goto(URL); pg2.wait_for_timeout(250)
    check(pg2.is_visible('#cover') and 'de Leo' in pg2.inner_text('#cover') and not pg2.query_selector('#cv-name'), 'portada: al abrir de nuevo muestra "de Leo" sin preguntar')
    pg2.wait_for_timeout(1600)
    check(pg2.is_hidden('#cover'), 'portada: se abre sola')
    pg.context.close()

    # 3. empezar y abrir enlace / enlaces
    pg, e = device(b, URL, 1180, 820, state=BASE); allerr += e
    hrefs = pg.eval_on_selector_all('.hero a[data-act=go-open]', 'els => els.map(a => a.getAttribute("href") + "|" + a.target)')
    check(hrefs == ['https://example.com/partitura|_blank', 'https://example.com/video|_blank'], 'la sugerencia ofrece "…y abrir la partitura" y "…y abrir el vídeo"')
    with pg.context.expect_page() as pop:
        pg.click('.hero a[data-act=go-open] >> nth=0')
    pop.value.wait_for_load_state()
    check('example.com/partitura' in pop.value.url, 'empezar y abrir: abre la partitura en otra pestaña')
    pop.value.close(); pg.bring_to_front(); pg.wait_for_timeout(300)
    check(state(pg)['meta']['active'] is not None and pg.is_visible('#ov-session'), 'empezar y abrir: el cronómetro arrancó')
    check(pg.evaluate("(()=>{const o=Object.getOwnPropertyDescriptor(Navigator.prototype,'userAgent');return extHref('https://a.b/c?d=1#e')})()") == 'https://a.b/c?d=1#e', 'enlaces: en el navegador normal quedan tal cual')
    pg.click('[data-act=discard-ask]'); pg.click('[data-act=discard-yes]'); pg.wait_for_timeout(300)

    # 3b. en la app instalada en Android los enlaces piden abrirse en Chrome de verdad
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, service_workers='block', user_agent='Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36')
    ctx.add_init_script(SKIP_COVER); ctx.add_init_script("const mm = window.matchMedia.bind(window); window.matchMedia = (q) => /display-mode: standalone/.test(q) ? { matches: true, addEventListener() {}, removeEventListener() {} } : mm(q);")
    ctx.route('**/vendor/supabase.js', lambda r: r.fulfill(body=STUB, content_type='application/javascript'))
    ap = ctx.new_page(); ap.goto(URL); ap.wait_for_timeout(300)
    h = ap.evaluate("extHref('https://www.youtube.com/watch?v=abc#t=10')")
    check(h == 'intent://www.youtube.com/watch?v=abc#t=10#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3Dabc%23t%3D10;end', 'enlaces: instalada en Android piden Chrome (con plan B al enlace normal)')
    ctx.close()

    # 4. solo 2 minutos
    pg.click('.hero [data-act=mini]'); pg.wait_for_timeout(300)
    check(state(pg)['meta']['active'].get('mini') is True and pg.is_visible('.minibar'), 'solo 2 minutos: arranca con su barrita')
    pg.evaluate("setMeta('active', Object.assign({}, S.meta.active, { start: Date.now() - 125000 }))"); pg.wait_for_timeout(1200)
    check('ya van 2' in pg.inner_text('#clock-sub'), 'solo 2 minutos: al pasarlos lo celebra sin cortar')

    # 5. cronómetro olvidado
    pg.evaluate("setMeta('active', Object.assign({}, S.meta.active, { start: Date.now() - 3 * 3600000 }))"); pg.wait_for_timeout(200)
    pg.click('[data-act=finish]'); pg.wait_for_timeout(300)
    check('buen rato' in pg.inner_text('#ov-reg') and pg.is_visible('#r-min'), 'cronómetro olvidado: pregunta y deja ajustar los minutos')
    pg.click('[data-act=reg-min][data-v="20"]'); pg.click('[data-act=reg-save]'); pg.wait_for_timeout(500)
    ss = state(pg)['sessions']
    check(len(ss) == 1 and any(v['minutes'] == 20 for v in ss.values()) and state(pg)['meta']['active'] is None, 'se guardó con los minutos corregidos')
    check(pg.evaluate('layers.length') == 0 and pg.is_hidden('#ov-reg') and pg.is_hidden('#ov-session'), 'sin hojas colgadas')

    # 6. dibujo del mes: un pedacito por sesión
    check(pg.eval_on_selector('.dib .dibujo', 'el => el.querySelectorAll("[filter]").length') == 1, 'dibujo del mes: 1 sesión, 1 pedacito pintado')

    # 7. repaso
    check(not pg.evaluate("candidates().some(x => x.id === 'p9')"), 'repaso: una pieza que ya sale y tocaste hace poco no se sugiere')
    pg.evaluate("put('pieces', 'p9', Object.assign({}, S.pieces.p9, { at: Date.now() - 40 * 86400000 }))")
    c = pg.evaluate("candidates().find(x => x.id === 'p9')")
    check(bool(c) and c.get('repaso') and 'Repaso' in c['why'], 'repaso: una pieza que ya sale vuelve tras 3 semanas sin tocarla')

    # 8. diario: mes, editar y deshacer
    pg.evaluate("location.hash='#diario'"); pg.wait_for_timeout(400)
    check(pg.locator('.cal .d.on').count() == 1 and 'Skinny Love' in pg.inner_text('.bars'), 'diario: el día de hoy pintado y el tiempo por pieza')
    pg.click('.sess [data-act=sedit] >> nth=0'); pg.wait_for_timeout(200)
    pg.fill('#r-min', '33'); pg.click('[data-act=reg-save]'); pg.wait_for_timeout(400)
    check(any(v['minutes'] == 33 for v in state(pg)['sessions'].values()) and len(state(pg)['sessions']) == 1, 'diario: corregir un registro')
    pg.click('.sess [data-act=sdel] >> nth=0'); pg.wait_for_timeout(200)
    check(len(state(pg)['sessions']) == 0, 'diario: borrar un registro')
    pg.click('#toast button'); pg.wait_for_timeout(300)
    check(len(state(pg)['sessions']) == 1, 'diario: "Deshacer" lo devuelve')

    # 9. cursos propios
    pg.evaluate("location.hash='#cursos'"); pg.wait_for_timeout(400)
    pg.click('[data-act=course-new]'); pg.fill('#nc-name', 'Curso de improvisación'); pg.keyboard.press('Enter'); pg.wait_for_timeout(300)
    cid = [k for k, v in state(pg)['courses'].items() if v['name'] == 'Curso de improvisación']
    check(len(cid) == 1, 'cursos: agregar uno propio')
    pg.fill('#c-%s-lesson' % cid[0], 'Clase 3'); pg.keyboard.press('Enter'); pg.wait_for_timeout(300)
    check(state(pg)['courses'][cid[0]].get('lesson') == 'Clase 3', 'cursos: anotar el vídeo donde vas')
    pg.click('[data-act=course-edit][data-id="armonia"]'); pg.wait_for_timeout(200); pg.click('[data-act=course-del][data-id="armonia"]'); pg.click('[data-act=course-del-yes]'); pg.wait_for_timeout(300)
    pg.reload(); pg.wait_for_timeout(400)
    check('armonia' not in state(pg)['courses'], 'cursos: un curso de fábrica borrado no vuelve a aparecer')

    # 10. desafíos
    pg.evaluate("location.hash='#repertorio'"); pg.wait_for_timeout(400)
    pg.click('[data-act=rep-tab][data-v=desafio]'); pg.click('[data-act=new-piece]'); pg.wait_for_timeout(200)
    pg.fill('#p-title', 'Desafío de blues'); pg.fill('#p-video', 'example.com/reto'); pg.click('[data-act=p-save]'); pg.wait_for_timeout(300)
    d = [v for v in state(pg)['pieces'].values() if v['title'] == 'Desafío de blues']
    check(len(d) == 1 and d[0]['kind'] == 'desafio' and 'Desafío de blues' in pg.inner_text('#view'), 'desafíos: se agregan como tipo propio y salen en su pestaña')
    check(pg.evaluate("candidates().some(x => x.t === 'piece' && S.pieces[x.id].kind === 'desafio')"), 'desafíos: entran en "hoy te toca"')
    allerr += e; pg.context.close()

    # 11. Compartir → Atril
    pg, e = device(b, URL, 390, 844, state=BASE, path='?title=Clase%2013&text=Mira%20https%3A%2F%2Fexample.com%2Fcurso%2Fv13'); allerr += e
    check(pg.is_visible('#ov-share') and 'example.com/curso/v13' in pg.inner_text('#ov-share') and '?' not in pg.url, 'compartir: abre la hoja con el enlace y limpia la dirección')
    pg.click('[data-act=share-dest][data-id=piano]'); pg.wait_for_timeout(150)
    check(pg.input_value('#sh-lesson') == 'Clase 13', 'compartir: propone el título como vídeo donde vas')
    pg.click('[data-act=share-save]'); pg.wait_for_timeout(300)
    c = state(pg)['courses']['piano']
    check(c.get('link') == 'https://example.com/curso/v13' and c.get('lesson') == 'Clase 13' and pg.is_hidden('#ov-share'), 'compartir: queda guardado en el curso')
    pg.context.close()

    pg, e = device(b, URL, 390, 844, state=BASE, path='?url=https%3A%2F%2Fexample.com%2Freto5&title=Reto%205'); allerr += e
    pg.click('[data-act=share-new]'); pg.wait_for_timeout(250)
    check(pg.is_visible('#ov-piece') and pg.is_hidden('#ov-share') and pg.input_value('#p-video') == 'https://example.com/reto5' and pg.input_value('#p-title') == 'Reto 5', 'compartir: "pieza o desafío nuevo" abre la ficha con el enlace puesto')
    pg.click('[data-act=p-save]'); pg.wait_for_timeout(400)
    check(any(v.get('kind') == 'desafio' and v.get('video') == 'https://example.com/reto5' for v in state(pg)['pieces'].values()) and pg.evaluate('layers.length') == 0, 'compartir: se guarda como desafío y no quedan hojas colgadas')
    pg.click('.row-main >> nth=0'); pg.wait_for_timeout(200); pg.click('#ov-piece [data-act=rec-open]'); pg.wait_for_timeout(250)
    check(pg.is_visible('#ov-rec') and pg.is_hidden('#ov-piece'), 'grabar desde la ficha de una pieza: cambia de hoja')
    pg.go_back(); pg.wait_for_timeout(300)
    check(pg.is_hidden('#ov-rec') and pg.is_hidden('#ov-piece') and pg.evaluate('layers.length') == 0, 'atrás desde grabar: vuelve limpio')
    pg.context.close()

    # 12. grabaciones
    REMOTE['bucket'] = False
    pg, e = device(b, URL, 390, 844, state=BASE2, perms=['microphone']); allerr += e
    check('Te grabas 30 segundos' in pg.inner_text('#view'), 'grabar: tras tocar hoy una pieza sin grabación, lo ofrece')
    pg.click('[data-act=rec-open]'); pg.wait_for_timeout(200); pg.click('[data-act=rec-start]'); pg.wait_for_timeout(1700)
    check(pg.is_visible('#rec-time'), 'grabar: está grabando')
    pg.click('[data-act=rec-stop]'); pg.wait_for_timeout(500)
    check(pg.is_visible('#ov-rec audio'), 'grabar: se puede oír antes de guardar')
    pg.click('[data-act=rec-save]'); pg.wait_for_timeout(500)
    recs = state(pg)['recs']; rid = list(recs.keys())[0] if recs else None
    check(len(recs) == 1 and recs[rid]['ref'] == 'p1' and recs[rid]['up'] is False and pg.is_hidden('#ov-rec'), 'grabar: queda la ficha, por ahora solo en este aparato')
    check('Te grabas 30 segundos' not in pg.inner_text('#view'), 'grabar: no lo vuelve a ofrecer')
    login(pg); pg.wait_for_timeout(600)
    check(state(pg)['recs'][rid]['up'] is False, 'grabar: si la carpeta de audios no existe en Supabase, se queda local sin romper nada')
    REMOTE['bucket'] = True
    pg.evaluate('recRetryAt = 0; uploadRecs()'); pg.wait_for_timeout(700)
    check(state(pg)['recs'][rid]['up'] is True and ('u1/' + rid) in REMOTE['blobs'], 'grabar: con la carpeta creada, sube a la nube')
    pg.evaluate("location.hash='#diario'"); pg.wait_for_timeout(400)
    pg.click('[data-act=rec-play]'); pg.wait_for_timeout(500)
    check(pg.evaluate('playing') == rid, 'grabar: se oye desde el Diario')
    cel, e2 = device(b, URL, 390, 844); allerr += e2
    login(cel); cel.wait_for_timeout(400); cel.evaluate("location.hash='#diario'"); cel.wait_for_timeout(400)
    cel.click('[data-act=rec-play]'); cel.wait_for_timeout(700)
    check(cel.evaluate('playing') == rid, 'grabar: el otro aparato la baja de la nube y la oye')
    cel.click('[data-act=rec-play]'); cel.click('[data-act=rec-del]'); cel.click('[data-act=rec-del-yes]'); cel.wait_for_timeout(900)
    check(len(state(cel)['recs']) == 0 and ('u1/' + rid) not in REMOTE['blobs'], 'grabar: borrar quita la ficha y el audio de la nube')
    cel.context.close(); pg.context.close()

    # 13. aviso de sesión en curso. El navegador de pruebas no deja mostrar notificaciones de verdad:
    # se comprueba la lógica con un permiso y un registro simulados (el service worker sí es el real).
    FAKE = """Object.defineProperty(Notification, 'permission', { get: () => 'granted' });
      window.__notes = [];
      ServiceWorkerRegistration.prototype.showNotification = function (title, o) { window.__notes = window.__notes.filter(n => n.tag !== o.tag); window.__notes.push({ title, body: o.body, tag: o.tag, close() { window.__notes = window.__notes.filter(n => n !== this); } }); return Promise.resolve(); };
      ServiceWorkerRegistration.prototype.getNotifications = function (f) { return Promise.resolve(window.__notes.filter(n => !f || !f.tag || n.tag === f.tag)); };"""
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, service_workers='allow')
    ctx.add_init_script(SKIP_COVER); ctx.add_init_script(FAKE)
    ctx.add_init_script('if(!localStorage.getItem("atril.v4"))localStorage.setItem("atril.v4", %s)' % json.dumps(json.dumps(BASE)))
    pg = ctx.new_page(); pg.goto(URL); pg.wait_for_timeout(1500)
    check(pg.evaluate("navigator.serviceWorker.getRegistration().then(r => !!(r && r.active))"), 'service worker: se instala y queda activo')
    pg.click('.hero [data-act=go]'); pg.wait_for_timeout(400)
    pg.evaluate("setSetting('notify','on'); sessionNote()"); pg.wait_for_timeout(500)
    n = pg.evaluate("window.__notes.map(x => x.title + '|' + x.body)")
    check(len(n) == 1 and 'Skinny Love' in n[0], 'aviso: mientras corre el cronómetro queda una notificación con la pieza')
    pg.click('[data-act=discard-ask]'); pg.click('[data-act=discard-yes]'); pg.wait_for_timeout(600)
    check(pg.evaluate("window.__notes.length") == 0, 'aviso: se quita al terminar o descartar')
    pg.click('.hero [data-act=go]'); pg.wait_for_timeout(500)
    check(pg.evaluate("window.__notes.length") == 1, 'aviso: con el permiso dado, sale solo al empezar')
    ctx.close()

    errs = real_errors(allerr)
    check(not errs, 'sin errores en consola ' + (str(errs[:3]) if errs else ''))
    b.close()
srv.shutdown()
sys.exit(check.done())
