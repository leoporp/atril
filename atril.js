'use strict';
/* Atril: toda la lógica de la app. Sin dependencias (solo vendor/supabase.js) y sin build.
   Orden del archivo: utilidades → estado y guardado → nube → datos derivados → vistas → capas → sesión →
   registro → pieza → grabaciones → compartir → cuenta → portada → avisos → eventos → arranque. */

/* ---------- utilidades ---------- */
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => (window.crypto && crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
const pad = (n) => String(n).padStart(2, '0');
const dkey = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const fromKey = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const todayKey = () => dkey(new Date());
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const monday = (d) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); return addDays(x, -((x.getDay() + 6) % 7)); };
const daysBetween = (a, b) => Math.round((fromKey(b) - fromKey(a)) / 86400000);
const fmt = (d, o) => d.toLocaleDateString('es-CO', o).replace(/\./g, '').replace(/,/g, '');
const clone = (o) => JSON.parse(JSON.stringify(o));
const strip = (o) => { const c = clone(o); delete c.u; return c; };
const safeUrl = (u) => { const s = String(u || '').trim(); if (!s) return ''; const w = /^https?:\/\//i.test(s) ? s : 'https://' + s; try { const x = new URL(w); return /^https?:$/.test(x.protocol) ? x.href : ''; } catch (e) { return ''; } };
const reduced = () => !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
/* JSON con llaves ordenadas: Postgres reordena las llaves, así se comparan bien */
function stable(v) {
  if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
  return JSON.stringify(v === undefined ? null : v);
}
/* Enlaces de fuera: Leo los quiere en Chrome de verdad, no en la pestaña interna de la app instalada.
   En Android instalada se pide con un "intent" a Chrome; si el celular no lo acepta, abre el enlace normal. */
const isAndroid = /Android/i.test(navigator.userAgent);
const standalone = () => !!(window.matchMedia && matchMedia('(display-mode: standalone)').matches);
function extHref(u) {
  const s = safeUrl(u); if (!s) return '';
  if (!(isAndroid && standalone())) return s;
  try { const x = new URL(s); return 'intent://' + x.host + x.pathname + x.search + x.hash + '#Intent;scheme=' + x.protocol.replace(':', '') + ';package=com.android.chrome;S.browser_fallback_url=' + encodeURIComponent(s) + ';end'; } catch (e) { return s; }
}
const extA = (u, cls, inner, extra) => '<a class="' + cls + '" href="' + esc(extHref(u)) + '" target="_blank" rel="noopener noreferrer"' + (extra || '') + '>' + inner + '</a>';

const DAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const STATES = [{ k: 'aprendiendo', l: 'Aprendiendo' }, { k: 'puliendo', l: 'Puliendo' }, { k: 'sale', l: 'Ya me sale' }];
const stateLabel = (k) => (STATES.find((s) => s.k === k) || STATES[0]).l;
const EXTRA = [{ k: 'tecnica', l: 'Técnica' }, { k: 'libre', l: 'Improvisar' }];
const TAGNAME = { tecnica: 'Técnica', libre: 'Improvisar' };
const GROUP = 'Santi y Juanma';
const KINDS = [{ k: 'mia', l: 'Mía' }, { k: 'grupo', l: 'Con ' + GROUP }, { k: 'desafio', l: 'Desafío' }];
const kindOf = (p) => (p ? (p.kind || (p.group ? 'grupo' : 'mia')) : 'mia');
const REPASO_DIAS = 21;   /* una pieza que "ya sale" vuelve a sugerirse si pasa este tiempo sin tocarla */
const MINI_MS = 120000;   /* "solo 2 minutos" */
const LARGO_MIN = 90;     /* si el cronómetro marca más que esto, se pregunta antes de guardar */

/* ---------- estado y guardado ----------
   Todo vive en un solo objeto S, guardado en este aparato (localStorage) y en Supabase (tabla atril_state, un JSON por cuenta).
   Cada registro lleva su hora de cambio (u); lo borrado deja una marca en S.tomb; cada dato de S.meta tiene su hora en S.mu.
   Al sincronizar se juntan los dos lados registro por registro y gana lo más reciente: la tablet y el celular no se pisan. */
const LS = 'atril.v4';
const COLLS = ['sessions', 'pieces', 'courses', 'recs'];
const META_KEYS = ['active', 'settings', 'group'];
/* Cursos de fábrica: ids fijos para que dos aparatos nuevos no creen duplicados. u:0 = cualquier cambio real gana. */
const SEED_COURSES = [{ id: 'piano', name: 'Curso de piano' }, { id: 'armonia', name: 'Curso de armonía' }];
const blankMeta = () => ({ active: null, settings: { goal: 10 }, group: {} });
function blank() { const o = { v: 5, meta: blankMeta(), tomb: {}, mu: {} }; for (const c of COLLS) { o[c] = {}; o.tomb[c] = {}; } return o; }
function seed(o) { for (const s of SEED_COURSES) if (!o.courses[s.id] && !o.tomb.courses[s.id]) o.courses[s.id] = { name: s.name, u: 0 }; return o; }
function normalize(p) {
  const o = blank();
  if (!p || typeof p !== 'object') return seed(o);
  for (const c of COLLS) { o[c] = Object.assign({}, p[c] || {}); o.tomb[c] = Object.assign({}, (p.tomb && p.tomb[c]) || {}); }
  o.mu = Object.assign({}, p.mu || {});
  const pm = Object.assign({}, p.meta || {});
  /* v4 guardaba los dos cursos dentro de meta.courses: pasan a la colección courses */
  const old = pm.courses; delete pm.courses;
  if (old && typeof old === 'object') {
    for (const s of SEED_COURSES) {
      const c = old[s.id];
      if (c && (c.lesson || c.song || c.link) && !(o.courses[s.id] && o.courses[s.id].u) && !o.tomb.courses[s.id]) o.courses[s.id] = { name: s.name, lesson: c.lesson || '', song: c.song || '', link: c.link || '', at: c.at || 0, u: +o.mu.courses || 1 };
    }
  }
  delete o.mu.courses;
  const m = Object.assign(blankMeta(), pm);
  m.settings = Object.assign({ goal: 10 }, m.settings || {});
  m.group = m.group || {};
  if (m.active === undefined) m.active = null;
  o.meta = m;
  return seed(o);
}
function mergeStates(a, b) {
  const out = blank();
  for (const c of COLLS) {
    const ids = new Set([...Object.keys(a[c]), ...Object.keys(b[c]), ...Object.keys(a.tomb[c]), ...Object.keys(b.tomb[c])]);
    for (const id of ids) {
      const opts = [];
      if (a[c][id]) opts.push({ u: +a[c][id].u || 0, rec: a[c][id] });
      if (b[c][id]) opts.push({ u: +b[c][id].u || 0, rec: b[c][id] });
      if (a.tomb[c][id]) opts.push({ u: +a.tomb[c][id], del: true });
      if (b.tomb[c][id]) opts.push({ u: +b.tomb[c][id], del: true });
      opts.sort((x, y) => (y.u - x.u) || ((y.del ? 1 : 0) - (x.del ? 1 : 0)));
      const w = opts[0];
      if (w.del) out.tomb[c][id] = w.u; else out[c][id] = clone(w.rec);
    }
  }
  for (const k of new Set([...META_KEYS, ...Object.keys(a.meta), ...Object.keys(b.meta)])) {
    const ua = +a.mu[k] || 0, ub = +b.mu[k] || 0;
    const src = ub > ua ? b : a;
    out.meta[k] = src.meta[k] === undefined ? (blankMeta()[k] ?? null) : clone(src.meta[k]);
    if (ua || ub) out.mu[k] = Math.max(ua, ub);
  }
  return normalize(out);
}
let S = seed(blank());
try { const raw = localStorage.getItem(LS); if (raw) S = normalize(JSON.parse(raw)); } catch (e) {}
let storageOk = true;
function persist() { try { localStorage.setItem(LS, JSON.stringify(S)); storageOk = true; } catch (e) { if (storageOk) toast('Este navegador no está guardando tus datos'); storageOk = false; } }
function save() { persist(); cloud.dirty = true; clearTimeout(cloud.timer); cloud.timer = setTimeout(syncNow, 600); }

function put(coll, id, obj) {
  const c = strip(obj); c.u = Date.now();
  S[coll][id] = c; delete S.tomb[coll][id];
  save(); refresh();
}
function del(coll, id) {
  delete S[coll][id]; S.tomb[coll][id] = Date.now();
  save(); refresh();
}
function setMeta(key, val) {
  S.meta[key] = val == null ? null : clone(val);
  S.mu[key] = Date.now();
  save(); refresh();
}
const setSetting = (k, v) => setMeta('settings', Object.assign({}, S.meta.settings, { [k]: v }));

/* ---------- nube (Supabase, el mismo proyecto de Fibra y Trazo) ---------- */
const CFG = window.ATRIL_CONFIG || {};
const cloud = { sb: null, session: null, busy: false, again: false, dirty: false, timer: null, state: 'local' };
const SYNC_TXT = { local: 'Solo en este aparato', nologin: 'Sin iniciar sesión: solo en este aparato', syncing: 'Sincronizando…', ok: 'Guardado en tu cuenta', offline: 'Sin internet: se sube cuando vuelva', error: 'No se pudo guardar en la nube' };
const cloudReady = () => !!(cloud.sb && cloud.session);
const netDown = (err) => navigator.onLine === false || /fetch|network|load failed/i.test(String((err && err.message) || err || ''));
const dotClass = () => (cloud.state === 'ok' ? '' : cloud.state === 'syncing' ? 'connecting' : 'local');
function syncNoteHtml() {
  const s = cloud.state;
  if (s === 'nologin') return '<button class="syncnote" data-act="acct">Entra con tu cuenta de Fibra para que la tablet y el celular vean lo mismo.</button>';
  if (s === 'offline') return '<p class="syncnote">Sin internet: lo que registres queda en este aparato y se sube cuando vuelva.</p>';
  if (s === 'error') return '<button class="syncnote" data-act="acct">No se pudo guardar en la nube. Toca para revisar.</button>';
  if (s === 'local') return '<p class="syncnote">Solo en este aparato: no se pudo conectar con la nube.</p>';
  return '';
}
function paintSync() {
  const d = $('sync-dot'); if (d) d.className = 'dot ' + dotClass();
  const b = $('sync-btn'); if (b) { b.title = SYNC_TXT[cloud.state]; b.setAttribute('aria-label', 'Cuenta y cuaderno: ' + SYNC_TXT[cloud.state]); }
  const n = $('syncnote'); if (n) n.innerHTML = syncNoteHtml();
  document.querySelectorAll('[data-sync]').forEach((el) => { el.textContent = SYNC_TXT[cloud.state]; });
}
function setSync(k) { cloud.state = k; paintSync(); }

/* Trae lo de la nube, lo junta con lo de este aparato y sube el resultado si cambió algo. */
async function syncNow() {
  clearTimeout(cloud.timer);
  if (!cloudReady()) { setSync(cloud.sb ? 'nologin' : 'local'); return; }
  if (cloud.busy) { cloud.again = true; return; }
  cloud.busy = true; cloud.dirty = false;
  if (cloud.state !== 'ok') setSync('syncing');
  const user = cloud.session.user.id;
  let ok = false;
  try {
    const r = await cloud.sb.from('atril_state').select('data').eq('user_id', user).maybeSingle();
    if (r.error) throw r.error;
    const remote = r.data && r.data.data ? normalize(r.data.data) : null;
    const merged = remote ? mergeStates(S, remote) : normalize(S);
    if (stable(merged) !== stable(S)) { S = merged; persist(); refresh(); }
    if (!remote || stable(merged) !== stable(remote)) {
      const w = await cloud.sb.from('atril_state').upsert({ user_id: user, data: clone(S), updated_at: new Date().toISOString() });
      if (w.error) throw w.error;
    }
    setSync('ok'); ok = true;
  } catch (e) {
    cloud.dirty = true;
    setSync(netDown(e) ? 'offline' : 'error');
  }
  cloud.busy = false;
  if (cloud.again) { cloud.again = false; syncNow(); } else if (ok) uploadRecs();
}
async function initCloud() {
  const make = window.supabase && window.supabase.createClient;
  if (!CFG.url || !CFG.key || !make) { setSync('local'); return; }
  try {
    cloud.sb = make(CFG.url, CFG.key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'atril-auth' } });
    const { data } = await cloud.sb.auth.getSession(); cloud.session = (data && data.session) || null;
    cloud.sb.auth.onAuthStateChange((ev, s) => {
      cloud.session = s || null;
      if (ev === 'SIGNED_IN') setTimeout(syncNow, 0);
      if (ev === 'SIGNED_OUT') setTimeout(() => { setSync('nologin'); renderAcct(); }, 0);
    });
    if (cloud.session) await syncNow(); else setSync('nologin');
  } catch (e) { cloud.sb = null; cloud.session = null; setSync('local'); }
}
function authErr(e) {
  const m = String((e && e.message) || '').toLowerCase();
  if (m.includes('invalid login')) return 'Correo o contraseña incorrectos. Es la misma cuenta de Fibra y Trazo.';
  if (m.includes('not confirmed')) return 'Falta confirmar el correo: abre el enlace que te llegó y vuelve a intentar.';
  if (navigator.onLine === false || /fetch|network/.test(m)) return 'Sin internet. Intenta cuando tengas conexión.';
  return 'No se pudo entrar. Intenta de nuevo.';
}
window.addEventListener('online', () => { if (cloudReady()) syncNow(); });
window.addEventListener('offline', () => { if (cloudReady()) setSync('offline'); });
setInterval(() => { if (document.visibilityState === 'visible' && cloudReady() && !cloud.busy) syncNow(); }, 20000);

/* ---------- datos derivados ---------- */
const sessList = () => Object.entries(S.sessions).map(([id, v]) => Object.assign({ id }, v));
const pieceList = () => Object.entries(S.pieces).map(([id, v]) => Object.assign({ id }, v));
const seedRank = (id) => { const i = SEED_COURSES.findIndex((s) => s.id === id); return i < 0 ? 99 : i; };
const courseList = () => Object.entries(S.courses).map(([id, v]) => Object.assign({ id }, v)).sort((a, b) => seedRank(a.id) - seedRank(b.id) || (a.at || 0) - (b.at || 0) || String(a.name).localeCompare(String(b.name), 'es'));
const recList = () => Object.entries(S.recs).map(([id, v]) => Object.assign({ id }, v)).sort((a, b) => (b.at || 0) - (a.at || 0));
function sessItems(s) {
  if (Array.isArray(s.items)) return s.items;
  const out = (s.pieces || []).map((id) => ({ t: 'piece', id }));
  for (const t of (s.tags || [])) if (t === 'piano' || t === 'armonia') out.push({ t: 'course', id: t });
  return out;
}
function minutesByDay() { const m = {}; for (const s of sessList()) m[s.day] = (m[s.day] || 0) + (+s.minutes || 0); return m; }
function lastTouched() {
  const m = {};
  for (const s of sessList()) for (const it of sessItems(s)) { const k = it.t + ':' + it.id; if (!m[k] || s.day > m[k]) m[k] = s.day; }
  return m;
}
const pendingOf = (p) => ((p && p.todos) || []).filter((t) => !t.done);
function itemName(t, id) { return t === 'course' ? (S.courses[id] ? S.courses[id].name : 'Curso borrado') : (S.pieces[id] ? S.pieces[id].title : 'Pieza borrada'); }
function itemLinks(t, id) {
  const out = [];
  if (t === 'course') { const u = safeUrl((S.courses[id] || {}).link); if (u) out.push({ l: 'el vídeo', u }); }
  else { const p = S.pieces[id] || {}, a = safeUrl(p.link), b = safeUrl(p.video); if (a) out.push({ l: 'la partitura', u: a }); if (b) out.push({ l: 'el vídeo', u: b }); }
  return out;
}
function meetSoon() { const n = S.meta.group.next, tk = todayKey(); return n && n >= tk && daysBetween(tk, n) <= 7 ? n : null; }
function meetText(n) { const d = daysBetween(todayKey(), n); return d === 0 ? 'hoy' : d === 1 ? 'mañana' : 'el ' + fmt(fromKey(n), { weekday: 'long', day: 'numeric' }); }

/* "vas en el compás [32]": la cifra va encerrada en un círculo de lápiz */
function posParts(t, id) {
  if (t === 'course') {
    const c = S.courses[id] || {};
    if (!c.lesson && !c.song) return null;
    if (!c.lesson) return { pre: 'vas en', val: c.song };
    return /^\d+$/.test(c.lesson) ? { pre: 'vas en el vídeo', val: c.lesson, after: c.song } : { pre: 'vas en', val: c.lesson, after: c.song };
  }
  const p = S.pieces[id]; if (!p || !p.pos) return null;
  return { pre: p.track === 'tiempo' ? 'vas en el minuto' : 'vas en el compás', val: p.pos };
}
const CIRCLE = '<svg aria-hidden="true" viewBox="0 0 64 50" preserveAspectRatio="none"><path d="M8 26 C 6 10, 50 4, 58 22 C 64 40, 18 48, 6 32 C 2 24, 14 14, 30 12" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" vector-effect="non-scaling-stroke"/></svg>';
function whereHtml(t, id) {
  const pp = posParts(t, id);
  if (!pp) return '<span class="where muted">' + (t === 'course' ? 'Aún no anotas en qué vídeo vas' : 'Aún no anotas dónde vas') + '</span>';
  const val = String(pp.val);
  const v = val.length <= 7 ? '<span class="circled">' + esc(val) + CIRCLE + '</span>' : '<b>' + esc(val) + '</b>';
  return '<span class="where"><span>' + esc(pp.pre) + '</span>' + v + (pp.after ? '<span class="muted">· ' + esc(pp.after) + '</span>' : '') + '</span>';
}
function shortPos(t, id) {
  const pp = posParts(t, id);
  if (!pp) return 'sin anotar todavía';
  const lead = t === 'course' ? (/^vas en el vídeo/.test(pp.pre) ? 'vídeo ' : '') : (pp.pre.endsWith('minuto') ? 'minuto ' : 'compás ');
  return lead + pp.val + (pp.after ? ' · ' + pp.after : '');
}
function postitPend(p) {
  const pend = pendingOf(p);
  if (!pend.length) return '';
  return '<p class="postit"><small>falta:</small>' + esc(pend[0].text) + (pend.length > 1 ? ' <small style="display:inline">(+' + (pend.length - 1) + ')</small>' : '') + '</p>';
}

/* Qué sugerir: lo más olvidado primero; si el encuentro está cerca, lo pendiente del grupo va adelante;
   lo que "ya sale" vuelve de repaso cuando lleva rato sin tocarse. */
function candidates() {
  const tk = todayKey(), lt = lastTouched(), soon = meetSoon(), out = [];
  const why = (last, fallbackDays) => {
    if (!last) return { days: fallbackDays, text: 'Todavía no la registras' };
    const d = daysBetween(last, tk);
    return { days: d, text: d <= 0 ? 'La tocaste hoy' : d === 1 ? 'La tocaste ayer' : 'Hace ' + d + ' días no la tocas' };
  };
  for (const p of pieceList()) {
    const created = p.at ? dkey(new Date(p.at)) : tk;
    if (p.state === 'sale') {
      const d = daysBetween(lt['piece:' + p.id] || created, tk);
      if (d >= REPASO_DIAS) out.push({ t: 'piece', id: p.id, score: d - REPASO_DIAS + .25, why: 'Repaso: hace ' + d + ' días no la tocas, para que no se oxide', repaso: true });
      continue;
    }
    const w = why(lt['piece:' + p.id], Math.max(2, daysBetween(created, tk) + 2));
    const pend = pendingOf(p).length;
    let score = w.days, text = w.text;
    if (kindOf(p) === 'grupo' && soon && pend) { score += 100; text = 'Se ven ' + meetText(soon) + ' · ' + pend + (pend === 1 ? ' pendiente' : ' pendientes'); }
    out.push({ t: 'piece', id: p.id, score, why: text });
  }
  for (const c of courseList()) {
    const w = why(lt['course:' + c.id], 1);
    out.push({ t: 'course', id: c.id, score: w.days - 0.5, why: w.text.replace('la tocas', 'lo abres').replace('La tocaste', 'Lo viste').replace('Todavía no la registras', 'Todavía no lo registras') });
  }
  return out.sort((a, b) => b.score - a.score);
}

function elapsed(a) { if (!a) return 0; return (a.acc || 0) + (a.running ? Math.max(0, Date.now() - a.start) : 0); }
function clockText(ms) { const t = Math.max(0, Math.floor(ms / 1000)); const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60; return h ? h + ':' + pad(m) + ':' + pad(s) : pad(m) + ':' + pad(s); }
const curYM = () => todayKey().slice(0, 7);
function monthStats(ym) {
  const by = {}, days = {}; let n = 0, tot = 0;
  for (const s of sessList()) {
    if (!s.day || s.day.slice(0, 7) !== ym) continue;
    const min = +s.minutes || 0, its = sessItems(s);
    n++; tot += min; days[s.day] = (days[s.day] || 0) + min;
    if (!its.length) by.libre = (by.libre || 0) + min;
    else for (const it of its) { const k = it.t + ':' + it.id; by[k] = (by[k] || 0) + min / its.length; }
  }
  return { n, tot, days, by };
}

/* ---------- íconos y figuras ---------- */
function hashKind(k) { let h = 7; for (const c of k) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h % 4; }
function fig(kind) {
  const o = '<svg aria-hidden="true" viewBox="0 0 42 66" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">';
  const head = (x) => '<path d="M' + x + ' 49 c-6 6 4 12 10 6 c5 -5 -2 -12 -10 -6 z" fill="currentColor" stroke-width="1.5"/>';
  if (kind === 'rest') return o + '<path d="M16 20 l7 8 l-6 7 l7 8 c-6 -2 -9 1 -5 7"/></svg>';
  if (kind === 'today') return o + '<circle cx="21" cy="36" r="17" stroke-width="2" stroke-dasharray="4 5"/></svg>';
  if (kind === 0) return o + head(13) + '<path d="M23 52 L24 12"/></svg>';
  if (kind === 1) return o + head(13) + '<path d="M23 52 L24 12 c3 8 12 10 8 22"/></svg>';
  if (kind === 2) return o + '<path d="M13 44 L23 54 M23 44 L13 54"/><path d="M23 46 L24 12"/></svg>';
  return o + head(3) + head(23) + '<path d="M13 52 L14 13 L34 11 L33 51"/></svg>';
}
/* Pentagrama a lápiz: líneas un poco onduladas, se estiran al ancho */
const STAFF = '<svg class="lines" aria-hidden="true" viewBox="0 0 700 56" preserveAspectRatio="none" fill="none" stroke="currentColor" stroke-width="1.4">'
  + ['M0 4 C 200 2, 460 7, 700 3', 'M0 16 C 240 18, 480 14, 700 17', 'M0 28 C 190 27, 470 30, 700 28', 'M0 40 C 230 42, 520 38, 700 41', 'M0 52 C 210 51, 480 54, 700 52']
    .map((d) => '<path d="' + d + '" vector-effect="non-scaling-stroke"/>').join('') + '</svg>';
const I = {
  play: '<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13a.8.8 0 0 0 1.2.7l10.3-6.5a.8.8 0 0 0 0-1.4L9.2 4.8A.8.8 0 0 0 8 5.5z"/></svg>',
  stop: '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>',
  chev: '<svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>',
  back: '<svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>',
  close: '<svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  shuffle: '<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/></svg>',
  out: '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
  plus: '<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  mic: '<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>'
};
const CHEERS = ['¡Eso! Ya está en tu semana.', '¡Bien ahí! Un rato más en tus manos.', '¡Anotado! Tus dedos te lo agradecen.', '¡Qué bien! Que siga sonando.'];
function celebrate() {
  toast(CHEERS[Math.floor(Math.random() * CHEERS.length)], 2800);
  const box = $('party');
  if (!box || reduced()) return;
  let h = '';
  for (let i = 0; i < 12; i++) h += '<span style="left:' + (6 + Math.random() * 86).toFixed(1) + '%;animation-delay:' + (Math.random() * .5).toFixed(2) + 's;--r:' + Math.round(Math.random() * 60 - 30) + 'deg">' + fig(i % 4) + '</span>';
  box.innerHTML = h; clearTimeout(celebrate.t); celebrate.t = setTimeout(() => { box.innerHTML = ''; }, 2700);
}

/* ---------- vistas ---------- */
const ROUTES = ['hoy', 'repertorio', 'cursos', 'diario'];
let route = 'hoy', sugIdx = 0, repTab = 'mia', diaYM = null, courseEdit = null, courseAdding = false, confirmCourse = null, confirmRec = null;
function readRoute() { let h = location.hash.slice(1); if (h === 'semana') h = 'diario'; route = ROUTES.includes(h) ? h : 'hoy'; }
const metaClass = (t, id) => (t === 'course' ? 'c-curso' : 'c-' + ({ grupo: 'grupo', desafio: 'desafio', mia: 'mia' })[kindOf(S.pieces[id])]);
const kindWord = (p) => ({ grupo: ' · grupo', desafio: ' · desafío', mia: '' })[kindOf(p)];

function weekBlock() {
  const tk = todayKey(), mon = monday(new Date()), m = minutesByDay();
  let days = 0, total = 0; const cells = [], names = [], played = [];
  const full = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
  for (let i = 0; i < 7; i++) {
    const k = dkey(addDays(mon, i)), min = m[k] || 0; let inner = '';
    if (min > 0) { days++; total += min; played.push(full[i]); inner = '<span class="fig-on">' + fig(hashKind(k)) + '</span><span class="min">' + min + '′</span>'; }
    else if (k < tk) inner = '<span class="fig-rest">' + fig('rest') + '</span>';
    else if (k === tk) inner = '<span class="fig-today">' + fig('today') + '</span><span class="min today">hoy</span>';
    cells.push('<div class="cell">' + inner + '</div>');
    names.push('<span' + (k === tk ? ' class="today"' : '') + '>' + DAYS[i] + '</span>');
  }
  const aria = played.length ? 'Esta semana tocaste ' + played.join(', ') : 'Esta semana todavía no hay práctica registrada';
  return '<section class="week"><div class="week-head"><span class="sec-title">tu semana</span><span class="week-tot"><b>' + days + '</b> ' + (days === 1 ? 'día' : 'días') + ' · <b>' + total + '</b> min</span></div>'
    + '<div class="staff" role="img" aria-label="' + esc(aria) + '">' + STAFF + '<div class="cells">' + cells.join('') + '</div></div>'
    + '<div class="daynames" aria-hidden="true">' + names.join('') + '</div></section>';
}
function dibujoBlock(ym, big) {
  const st = monthStats(ym), dib = dibujoDe(ym), tot = dib.regs.length, n = st.n;
  const mes = fmt(fromKey(ym + '-01'), { month: 'long' });
  const txt = n === 0 ? 'Se pinta solo: cada vez que tocas, un pedacito.' : n < tot ? 'Llevas ' + n + ' de ' + tot + ' pedacitos.' : n === tot ? '¡Terminado! Lo que siga son estrellas.' : '¡Terminado, y con ' + (n - tot) + (n - tot === 1 ? ' estrella' : ' estrellas') + ' de más!';
  return '<section class="dib' + (big ? ' big paper' : '') + '" role="img" aria-label="' + esc('Dibujo de ' + mes + ': ' + dib.nombre + '. ' + txt) + '">' + dibujoSVG(dib, n)
    + '<div class="t"><b>el dibujo de ' + esc(mes) + '</b><span>' + esc(dib.nombre) + ' · ' + esc(txt) + '</span></div></section>';
}

function startButtons(t, id) {
  const links = itemLinks(t, id);
  return '<button class="wood" data-act="go" data-t="' + t + '" data-id="' + esc(id) + '">¡Me senté a tocar!</button>'
    + (links.length ? '<div class="hero-links">' + links.map((l) => extA(l.u, 'wood alt', '…y abrir ' + esc(l.l.replace(/^(la|el) /, '')) + ' ' + I.out, ' data-act="go-open" data-t="' + t + '" data-id="' + esc(id) + '"')).join('') + '</div>' : '');
}
function heroBlock() {
  const a = S.meta.active;
  if (a) {
    const f = a.focus;
    return '<section class="hero paper tape"><span class="eyebrow">tocando ahora…</span><div class="hero-title"><h1>' + (f ? esc(itemName(f.t, f.id)) : 'Tocando libre') + '</h1>'
      + (f ? whereHtml(f.t, f.id) : '') + '</div>'
      + '<div class="hero-actions"><button class="wood" data-act="resume-ov">Volver a la sesión <small>' + clockText(elapsed(a)) + '</small></button></div></section>';
  }
  const list = candidates();
  if (!list.length) {
    return '<section class="hero paper tape"><span class="eyebrow">tu atril está vacío</span><div class="hero-title"><h1>¿Qué quieres tocar?</h1><span class="why">Agrega una pieza o un curso y Atril te dice por dónde empezar.</span></div>'
      + '<div class="hero-actions"><button class="wood" data-act="new-piece">Agregar una pieza</button><button class="wood alt" data-act="free">Tocar libre</button></div></section>';
  }
  const c = list[sugIdx % list.length];
  const p = c.t === 'piece' ? S.pieces[c.id] : null;
  return '<section class="hero paper tape" aria-labelledby="hero-t">' + GARABATOS.estrella().replace('class="gb ', 'class="gb corner ')
    + '<span class="eyebrow under">' + (c.repaso ? 'hoy, de repaso…' : 'hoy te toca…') + GARABATOS.onda() + '</span>'
    + '<div class="hero-top"><div class="hero-title"><h1 id="hero-t">' + esc(itemName(c.t, c.id)) + '</h1>' + whereHtml(c.t, c.id) + '<span class="why">' + esc(c.why) + (p && kindOf(p) === 'grupo' ? ' · con ' + GROUP : p && kindOf(p) === 'desafio' ? ' · desafío' : '') + '</span></div>'
    + postitPend(p) + '</div>'
    + '<div class="hero-actions">' + startButtons(c.t, c.id)
    + '<div class="hero-sub"><button class="ghost" data-act="other">' + I.shuffle + 'Otra idea</button><button class="textbtn hand" data-act="mini" data-t="' + c.t + '" data-id="' + esc(c.id) + '">solo 2 minutos</button></div></div></section>'
    + '<div class="inline" style="justify-content:center;gap:2px"><button class="textbtn hand muted" data-act="free">tocar libre</button><span class="muted" aria-hidden="true">·</span><button class="textbtn hand muted" data-act="manual">registrar sin cronómetro</button></div>';
}
function atrilRows() {
  const lt = lastTouched(), rows = [];
  const ps = pieceList().filter((p) => p.state !== 'sale').sort((a, b) => ((lt['piece:' + a.id] || '') < (lt['piece:' + b.id] || '') ? -1 : 1));
  for (const p of ps) rows.push({ t: 'piece', id: p.id, name: p.title, meta: shortPos('piece', p.id) + kindWord(p) });
  for (const c of courseList()) rows.push({ t: 'course', id: c.id, name: c.name, meta: shortPos('course', c.id) });
  return rows;
}
function rowHtml(r) {
  const open = r.t === 'piece' ? 'data-act="open-piece" data-id="' + esc(r.id) + '"' : 'data-act="goto-cursos"';
  return '<div class="row"><button class="row-main" ' + open + '><span class="name">' + esc(r.name) + '</span><span class="meta ' + metaClass(r.t, r.id) + '">' + esc(r.meta) + '</span></button>'
    + '<div class="row-end"><button class="playbtn" data-act="go" data-t="' + r.t + '" data-id="' + esc(r.id) + '" aria-label="Tocar ' + esc(r.name) + ' ahora">' + I.play + '</button></div></div>';
}
function hello() { const h = new Date().getHours(); return h < 5 ? '¡buenas noches!' : h < 12 ? '¡buenos días!' : h < 19 ? '¡buenas tardes!' : '¡buenas noches!'; }

function viewHoy() {
  const now = new Date(), tk = todayKey(), todayMin = minutesByDay()[tk] || 0, goal = S.meta.settings.goal || 10;
  const syncBits = '<button class="syncbtn" id="sync-btn" data-act="acct" title="' + esc(SYNC_TXT[cloud.state]) + '" aria-label="Cuenta y cuaderno: ' + esc(SYNC_TXT[cloud.state]) + '"><span class="dot ' + dotClass() + '" id="sync-dot"></span></button>';
  const greet = todayMin ? '<p class="hand" style="font-size:26px;line-height:1.1;color:var(--accent)">' + (todayMin >= goal ? '¡Hoy ya van ' + todayMin + ' min! Cumpliste tu rato.' : 'Hoy llevas ' + todayMin + ' min.') + '</p>' : '';
  const groupPieces = pieceList().filter((p) => kindOf(p) === 'grupo');
  const pend = groupPieces.reduce((n, p) => n + pendingOf(p).length, 0);
  const n = S.meta.group.next;
  const groupLine = groupPieces.length || n
    ? '<a class="rowlink postit" href="#repertorio" data-act="to-group"><span class="t"><small>con ' + GROUP + '</small><span>' + (pend ? pend + (pend === 1 ? ' pendiente' : ' pendientes') : 'nada pendiente') + (n && n >= tk ? ' · se ven ' + esc(meetText(n)) : '') + '</span></span>' + I.chev + '</a>' : '';
  const due = recDue();
  const recAsk = due ? '<div class="postit" style="transform:rotate(-1deg);display:flex;flex-direction:column;gap:8px"><span>¿Te grabas 30 segundos de «' + esc(S.pieces[due].title) + '»?<small>para oír después cuánto has avanzado</small></span><span class="inline"><button class="btn sm solid" data-act="rec-open" data-id="' + esc(due) + '">' + I.mic + ' Grabarme</button><button class="btn sm" data-act="rec-skip" data-id="' + esc(due) + '">ahora no</button></span></div>' : '';
  const rows = atrilRows();
  const who = (S.meta.settings.name || '').trim();
  const head = '<header class="top"><span class="brand">Atril' + GARABATOS.notas() + '</span><span class="top-r"><span class="date">' + fmt(now, { weekday: 'long', day: 'numeric' }) + ' ·</span>' + hello().replace('!', who ? ', ' + esc(who) + '!' : '!') + syncBits + '</span></header>'
    + '<div id="syncnote">' + syncNoteHtml() + '</div>';
  const left = '<div class="col">' + heroBlock() + greet + recAsk + dibujoBlock(curYM(), false) + '</div>';
  const right = '<div class="col">' + weekBlock() + '<section class="section"><div class="section-head"><h2 class="sec-title">En tu atril' + GARABATOS.hoja() + '</h2><button class="textbtn hand" data-act="new-piece">+ otra pieza</button></div>'
    + (rows.length ? '<div class="rows">' + rows.map(rowHtml).join('') + '</div>' : '<p class="plain-empty">Nada por aquí todavía.</p>') + '</section>' + groupLine + '</div>';
  return head + '<div class="home">' + left + right + '</div><div class="endline">' + GARABATOS.zigzag() + GARABATOS.corazon() + GARABATOS.zigzag(CRAYON.naranja) + '</div>';
}

function pieceRow(p, lt) {
  const pend = pendingOf(p).length, last = lt['piece:' + p.id];
  const d = last ? daysBetween(last, todayKey()) : null;
  const lastTxt = d === null ? 'sin registrar' : d <= 0 ? 'hoy' : d === 1 ? 'ayer' : 'hace ' + d + ' días';
  return '<div class="row"><button class="row-main" data-act="open-piece" data-id="' + esc(p.id) + '"><span class="name">' + esc(p.title) + '</span>'
    + '<span class="meta ' + metaClass('piece', p.id) + '">' + esc(shortPos('piece', p.id)) + ' · ' + lastTxt + (pend ? ' · ' + pend + (pend === 1 ? ' pendiente' : ' pendientes') : '') + '</span></button>'
    + '<div class="row-end"><span class="tag' + (p.state === 'sale' ? ' done' : p.state === 'puliendo' ? ' green' : '') + '">' + stateLabel(p.state) + '</span></div></div>';
}
function pageHead(title, sub, doodle, color) {
  return '<header class="page-head"><div class="title-row"><h1 class="page-title under">' + title + GARABATOS.onda(color) + '</h1>' + doodle + '</div><p class="muted" style="margin-top:12px">' + sub + '</p></header>';
}
function viewRep() {
  const lt = lastTouched(), order = { aprendiendo: 0, puliendo: 1, sale: 2 };
  const list = pieceList().filter((p) => kindOf(p) === repTab).sort((a, b) => (order[a.state] ?? 0) - (order[b.state] ?? 0) || String(a.title).localeCompare(String(b.title), 'es'));
  let h = '<div class="narrow">' + pageHead('Repertorio', 'Dónde vas en cada pieza y qué falta.', GARABATOS.espiral(), CRAYON.morado)
    + '<div class="inline" style="justify-content:space-between"><div class="seg" role="group" aria-label="Filtrar">'
    + [['mia', 'Mías'], ['grupo', 'Con ' + GROUP], ['desafio', 'Desafíos']].map(([k, l]) => '<button data-act="rep-tab" data-v="' + k + '" aria-pressed="' + (repTab === k) + '">' + l + '</button>').join('') + '</div>'
    + '<button class="btn solid" data-act="new-piece">' + (repTab === 'desafio' ? 'Agregar desafío' : 'Agregar pieza') + '</button></div>';
  if (repTab === 'grupo') {
    h += '<section class="panel soft"><label class="field" for="g-next">próximo encuentro<input type="date" id="g-next" value="' + esc(S.meta.group.next || '') + '"></label>'
      + '<p class="small">Con la fecha puesta, la semana antes Atril te sugiere primero lo pendiente del grupo.</p></section>';
  }
  const emptyTxt = { mia: 'Aún no hay piezas tuyas. Agrega la que estás sacando ahora.', grupo: 'Aún no hay piezas del grupo. Agrega la que están montando.', desafio: 'Aquí van los desafíos de Jaime: cada uno con su enlace, dónde vas y qué falta.' }[repTab];
  h += list.length ? '<div class="rows">' + list.map((p) => pieceRow(p, lt)).join('') + '</div>' : '<p class="plain-empty empty-hint">' + GARABATOS.flecha() + '<span>' + emptyTxt + '</span></p>';
  return h + '</div>';
}

function viewCursos() {
  const lt = lastTouched();
  let h = '<div class="narrow">' + pageHead('Cursos', 'Cada curso recuerda solo el vídeo donde vas. Desde el vídeo en Chrome: Compartir → Atril.', GARABATOS.nota(), CRAYON.verde);
  courseList().forEach((c, i) => {
    const last = lt['course:' + c.id], id = esc(c.id), ed = courseEdit === c.id;
    h += '<section class="panel tape' + (i % 2 ? ' t2' : '') + '" style="padding-top:24px"><div class="panel-head"><h2>' + esc(c.name) + '</h2><span class="hand muted" style="font-size:21px">' + (last ? 'último: ' + fmt(fromKey(last), { day: 'numeric', month: 'short' }) : 'sin registrar') + '</span></div>'
      + (ed ? '<label class="field" for="c-' + id + '-name">nombre del curso<input type="text" id="c-' + id + '-name" data-course="' + id + '" data-f="name" value="' + esc(c.name) + '"></label>' : '')
      + '<label class="field" for="c-' + id + '-lesson">vídeo en el que vas<input type="text" id="c-' + id + '-lesson" data-course="' + id + '" data-f="lesson" placeholder="Ej. 12, o el nombre del vídeo" value="' + esc(c.lesson || '') + '" enterkeyhint="done"></label>'
      + '<label class="field" for="c-' + id + '-song">canción de ese vídeo (opcional)<input type="text" id="c-' + id + '-song" data-course="' + id + '" data-f="song" placeholder="Ej. Clocks" value="' + esc(c.song || '') + '" enterkeyhint="done"></label>'
      + '<label class="field" for="c-' + id + '-link">enlace a ese vídeo<input type="url" inputmode="url" id="c-' + id + '-link" data-course="' + id + '" data-f="link" placeholder="Pégalo aquí o usa Compartir → Atril" value="' + esc(c.link || '') + '" enterkeyhint="done"></label>'
      + startButtons('course', c.id)
      + (confirmCourse === c.id ? '<div class="confirm">¿Borrar este curso? Tus registros se quedan. <button class="btn sm danger" data-act="course-del-yes" data-id="' + id + '">Borrar</button><button class="btn sm" data-act="course-del-no">Cancelar</button></div>'
        : '<div class="inline" style="justify-content:space-between"><button class="textbtn muted" style="padding:0" data-act="course-edit" data-id="' + id + '">' + (ed ? 'Listo' : 'Cambiar nombre') + '</button>' + (ed ? '<button class="textbtn muted" style="padding:0" data-act="course-del" data-id="' + id + '">Borrar curso</button>' : '') + '</div>')
      + '</section>';
  });
  h += courseAdding
    ? '<section class="panel"><label class="field" for="nc-name">nombre del curso nuevo<input type="text" id="nc-name" placeholder="Ej. Curso de improvisación" enterkeyhint="done"></label><div class="inline"><button class="btn solid" data-act="course-add">Agregar</button><button class="btn" data-act="course-add-no">Cancelar</button></div></section>'
    : '<button class="textbtn hand" style="align-self:flex-start" data-act="course-new">+ otro curso</button>';
  return h + '</div>';
}

function recRow(r, withName) {
  const on = playing === r.id, d = new Date(r.at || 0);
  return '<div class="rec"><button class="playbtn sm' + (on ? ' on' : '') + '" data-act="rec-play" data-id="' + esc(r.id) + '" aria-label="' + (on ? 'Parar' : 'Oír') + ' la grabación del ' + esc(fmt(d, { day: 'numeric', month: 'long' })) + '">' + (on ? I.stop : I.play) + '</button>'
    + '<span class="info">' + (withName ? '<b>' + esc(itemName('piece', r.ref)) + '</b>' : '') + '<span>' + esc(fmt(d, { day: 'numeric', month: 'short', year: 'numeric' })) + ' · ' + Math.round(r.dur || 0) + ' s' + (r.up ? '' : ' · solo en este aparato') + '</span></span>'
    + (confirmRec === r.id ? '<span class="confirm"><button class="btn sm danger" data-act="rec-del-yes" data-id="' + esc(r.id) + '">Borrar</button><button class="btn sm" data-act="rec-del-no">No</button></span>'
      : '<button class="x" data-act="rec-del" data-id="' + esc(r.id) + '" aria-label="Borrar grabación">' + I.close + '</button>') + '</div>';
}
function calBlock(ym) {
  const [y, m] = ym.split('-').map(Number), first = new Date(y, m - 1, 1), off = (first.getDay() + 6) % 7, n = new Date(y, m, 0).getDate();
  const st = monthStats(ym), tk = todayKey();
  let h = DAYS.map((d) => '<span class="dn" aria-hidden="true">' + d + '</span>').join('') + '<span></span>'.repeat(off);
  for (let d = 1; d <= n; d++) {
    const k = ym + '-' + pad(d), min = st.days[k];
    h += '<span class="d' + (min ? ' on' : '') + (k === tk ? ' today' : '') + (k > tk ? ' fut' : '') + '"' + (min ? ' style="--c:' + CRAYONS[(d * 5) % CRAYONS.length] + '" aria-label="' + d + ': ' + min + ' minutos"' : '') + '><span>' + d + '</span>' + (min ? '<small>' + min + '′</small>' : '') + '</span>';
  }
  return '<div class="cal">' + h + '</div>';
}
function viewDiario() {
  const cur = curYM(); if (!diaYM || diaYM > cur) diaYM = cur;
  const ym = diaYM, st = monthStats(ym), goal = S.meta.settings.goal || 10;
  const [y, m] = ym.split('-').map(Number);
  const prev = dkey(new Date(y, m - 2, 1)).slice(0, 7), next = dkey(new Date(y, m, 1)).slice(0, 7);
  const firstYM = sessList().reduce((a, s) => (s.day && s.day.slice(0, 7) < a ? s.day.slice(0, 7) : a), cur);
  const nd = Object.keys(st.days).length;
  const month = '<section class="section"><div class="month-nav"><button class="x" data-act="mes" data-v="' + prev + '" aria-label="Mes anterior"' + (prev < firstYM ? ' disabled' : '') + '>' + I.back + '</button>'
    + '<h2>' + esc(fmt(new Date(y, m - 1, 1), { month: 'long', year: 'numeric' })) + '</h2>'
    + '<button class="x" data-act="mes" data-v="' + next + '" aria-label="Mes siguiente"' + (next > cur ? ' disabled' : '') + '>' + I.chev + '</button></div>'
    + calBlock(ym) + '<p class="week-tot" style="text-align:center"><b>' + nd + '</b> ' + (nd === 1 ? 'día' : 'días') + ' · <b>' + st.tot + '</b> min' + (st.n ? ' · <b>' + st.n + '</b> ' + (st.n === 1 ? 'sentada' : 'sentadas') : '') + '</p></section>';
  const top = Object.entries(st.by).sort((a, b) => b[1] - a[1]).slice(0, 6), max = top.length ? top[0][1] : 1;
  const bars = '<section class="section"><h2 class="sec-title">a qué le diste tiempo</h2>' + (top.length ? '<div class="bars">' + top.map(([k, v], i) => {
    const [t, ...rest] = k.split(':'), name = k === 'libre' ? 'Tocar libre' : itemName(t, rest.join(':'));
    return '<div class="bar"><span class="n">' + esc(name) + '</span><span class="v">' + Math.round(v) + ' min</span><span class="track"><i style="width:' + Math.max(6, Math.round(v / max * 100)) + '%;--c:' + CRAYONS[(i * 3 + 3) % CRAYONS.length] + '"></i></span></div>';
  }).join('') + '</div>' : '<p class="plain-empty">Este mes todavía está en blanco. Cualquier rato cuenta.</p>') + '</section>';
  /* registros del mes, por semana */
  const list = sessList().filter((s) => s.day && s.day.slice(0, 7) === ym).sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : (b.at || 0) - (a.at || 0)));
  const byWeek = new Map();
  for (const s of list) { const w = dkey(monday(fromKey(s.day))); if (!byWeek.has(w)) byWeek.set(w, []); byWeek.get(w).push(s); }
  const curW = dkey(monday(new Date()));
  const weeks = [...byWeek.keys()].sort().reverse().map((w) => {
    const ss = byWeek.get(w), mon = fromKey(w), sun = addDays(mon, 6), tot = ss.reduce((n, s) => n + (+s.minutes || 0), 0), dset = new Set(ss.map((s) => s.day));
    const rows = ss.map((s) => {
      const parts = sessItems(s).map((it) => '<span>' + esc(itemName(it.t, it.id)) + (it.pos ? ' <span class="muted">· ' + (it.t === 'course' ? 'vídeo ' : (S.pieces[it.id] || {}).track === 'tiempo' ? 'min ' : 'compás ') + esc(it.pos) + '</span>' : '') + (it.song ? ' <span class="muted">· ' + esc(it.song) + '</span>' : '') + '</span>');
      const extra = (s.tags || []).filter((t) => TAGNAME[t]).map((t) => TAGNAME[t]);
      if (extra.length) parts.push('<span class="muted">' + extra.join(' · ') + '</span>');
      if (s.note) parts.push('<span class="note">“' + esc(s.note) + '”</span>');
      return '<div class="sess"><button class="row-main" style="padding:0;min-height:44px" data-act="sedit" data-id="' + esc(s.id) + '" aria-label="Editar registro"><span class="l1"><span class="m">' + s.minutes + ' min</span><span class="d">' + fmt(fromKey(s.day), { weekday: 'long', day: 'numeric' }) + '</span></span></button>'
        + '<button class="x" data-act="sdel" data-id="' + esc(s.id) + '" aria-label="Borrar registro">' + I.close + '</button>'
        + '<div class="body">' + (parts.length ? parts.join('') : '<span class="muted">Libre</span>') + '</div></div>';
    }).join('');
    return '<section class="wk"><div class="wk-head"><h3>' + (w === curW ? 'esta semana' : fmt(mon, { day: 'numeric', month: 'short' }) + ' – ' + fmt(sun, { day: 'numeric', month: 'short' })) + '</h3><span class="muted">' + dset.size + (dset.size === 1 ? ' día' : ' días') + ' · ' + tot + ' min</span></div><div class="paper">' + rows + '</div></section>';
  }).join('');
  const recs = recList();
  const recSec = '<section class="section"><h2 class="sec-title">tus grabaciones</h2>' + (recs.length ? '<div class="paper" style="padding:6px 14px"><div class="recs">' + recs.map((r) => recRow(r, true)).join('') + '</div></div>'
    : '<p class="plain-empty">Aún no hay. Desde una pieza puedes grabarte 30 segundos para oír después cuánto avanzas.</p>') + '</section>';
  return '<div class="narrow wide">' + pageHead('Diario', 'Solo lo que sí tocaste.', GARABATOS.sol(), CRAYON.azul)
    + '<div class="two">' + month + '<div class="section">' + dibujoBlock(ym, true) + '</div></div>'
    + '<div class="two">' + bars + recSec + '</div>'
    + weeks
    + '<section class="section"><span class="eyebrow">tu rato diario</span><div class="chips">' + [5, 10, 15, 20, 30].map((g) => '<button class="chip sm" data-act="goal" data-v="' + g + '" aria-pressed="' + (goal === g) + '">' + g + ' min</button>').join('') + '</div></section>'
    + '<div class="paper"><button class="plainlink" data-act="acct" style="background:none;font:inherit"><span class="t"><span class="eyebrow">cuenta y cuaderno</span><span data-sync>' + esc(SYNC_TXT[cloud.state]) + '</span></span><span class="muted">' + I.chev + '</span></button></div>'
    + '</div>';
}

function render() {
  const v = $('view');
  v.innerHTML = route === 'hoy' ? viewHoy() : route === 'repertorio' ? viewRep() : route === 'cursos' ? viewCursos() : viewDiario();
  document.querySelectorAll('#nav a').forEach((a) => { if (a.dataset.r === route) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
}
let pendingRender = false, hadActive = !!S.meta.active;
const typingIn = (root) => { const a = document.activeElement; return !!(a && root.contains(a) && /^(INPUT|TEXTAREA)$/.test(a.tagName) && a.type !== 'checkbox'); };
function refresh() {
  if (!$('ov-session').hidden) { if (!S.meta.active) closeSession(); else renderSession(); }
  if (hadActive && !S.meta.active) clearNote();
  hadActive = !!S.meta.active;
  if (typingIn($('view'))) { pendingRender = true; return; }
  render();
}
$('view').addEventListener('focusout', () => setTimeout(() => { if (pendingRender && !typingIn($('view'))) { pendingRender = false; render(); } }, 0));
const OVS = ['ov-session', 'ov-reg', 'ov-piece', 'ov-rec', 'ov-share', 'ov-acct'];
function lockBody() { document.body.classList.toggle('locked', OVS.some((id) => !$(id).hidden)); }
function showOv(id, layer, reuse) {
  const el = $(id);
  if (el.hidden) { el.hidden = false; if (reuse) layers.push(layer); else pushLayer(layer); }
  lockBody(); el.scrollTop = 0;
  try { el.focus({ preventScroll: true }); } catch (e) {}
}

/* ---------- capas y botón atrás (Android) ----------
   Cada hoja abierta suma una entrada al historial; el botón atrás del sistema cierra la de arriba en vez de salir de la app.
   Para pasar de una hoja a otra se usa takeLayer + reuse (history.back() es asíncrono y se desfasaba). */
const layers = []; let skipPop = 0; const popWaiters = [];
function pushLayer(id) { layers.push(id); try { history.pushState({ atril: layers.length }, ''); } catch (e) {} }
function popLayer(id) { const i = layers.lastIndexOf(id); if (i < 0) return; layers.splice(i, 1); skipPop++; history.back(); }
function takeLayer(from) { const i = layers.lastIndexOf(from); if (i < 0) return false; layers.splice(i, 1); return true; }
function afterPops(fn) { if (!skipPop) fn(); else popWaiters.push(fn); }
window.addEventListener('popstate', () => {
  if (skipPop) { skipPop--; if (!skipPop) popWaiters.splice(0).forEach((f) => f()); return; }
  const id = layers.pop(); if (!id) return;
  if (id === 'session') { closeSession(true); render(); }
  else if (id === 'reg') { const ft = R && R.fromTimer; closeReg(true); if (ft && S.meta.active) openSession(); }
  else if (id === 'piece') closePiece(true);
  else if (id === 'rec') closeRec(true);
  else if (id === 'share') closeShare(true);
  else if (id === 'acct') closeAcct(true);
});

/* ---------- sesión ---------- */
let tick = null, askDiscard = false, wl = null;
async function wake() { try { if (navigator.wakeLock) wl = await navigator.wakeLock.request('screen'); } catch (e) { wl = null; } }
function unwake() { try { if (wl) wl.release(); } catch (e) {} wl = null; }
function startSession(focus, opt) {
  if (!S.meta.active) { setMeta('active', { start: Date.now(), acc: 0, running: true, focus: focus || null, mini: !!(opt && opt.mini) }); sessionNote(); }
  askDiscard = false; openSession(opt && opt.reuse);
}
function openSession(reuse) {
  showOv('ov-session', 'session', reuse);
  renderSession(); clearInterval(tick); tick = setInterval(paintSession, 1000); wake();
}
function closeSession(fromPop) {
  if ($('ov-session').hidden) return;
  $('ov-session').hidden = true; clearInterval(tick); tick = null; unwake(); lockBody();
  if (!fromPop) popLayer('session');
}
function miniText(a) { return elapsed(a) < MINI_MS ? 'solo 2 minuticos… después tú decides' : '¡ya van 2! lo que siga es regalo'; }
function renderSession() {
  const a = S.meta.active; if (!a) return;
  const f = a.focus;
  let card = '<section class="focus-card paper tape"><span class="eyebrow">tocando libre…</span><p class="muted">Al terminar eliges qué tocaste.</p></section>';
  if (f) {
    const links = itemLinks(f.t, f.id);
    card = '<section class="focus-card paper tape"><span class="eyebrow">tocando…</span><h2>' + esc(itemName(f.t, f.id)) + '</h2>' + whereHtml(f.t, f.id)
      + postitPend(f.t === 'piece' ? S.pieces[f.id] : null)
      + (links.length ? '<div class="linkrow">' + links.map((l) => extA(l.u, 'ghost', I.out + 'Abrir ' + esc(l.l))).join('') + '</div>' : '')
      + '</section>';
  }
  const ask = noteAskable() ? '<div class="note-card"><span>¿Te dejo un aviso arriba, en las notificaciones, para volver a Atril de un toque cuando termines?</span><span class="inline"><button class="btn sm solid" data-act="note-yes">Sí, avísame</button><button class="btn sm" data-act="note-no">No, gracias</button></span></div>' : '';
  $('ov-session').innerHTML = '<div class="ov-in">'
    + '<div class="ov-top"><button class="backbtn" data-act="minimize">' + I.back + 'Inicio</button><button class="x" data-act="discard-ask" aria-label="Descartar sesión">' + I.close + '</button></div>'
    + (askDiscard ? '<div class="confirm" style="justify-content:flex-end">¿Descartar este rato sin guardarlo? <button class="btn sm danger" data-act="discard-yes">Descartar</button><button class="btn sm" data-act="discard-no">Seguir</button></div>' : '')
    + '<div class="clock"><div class="time' + (a.running ? '' : ' paused') + '" id="clock-time" aria-live="off">' + clockText(elapsed(a)) + '</div><div class="muted" id="clock-sub">' + (a.running ? (a.mini ? miniText(a) : 'cualquier tiempo cuenta') : 'en pausa') + '</div>'
    + (a.mini ? '<div class="minibar" aria-hidden="true"><i id="mini-bar" style="width:' + Math.min(100, elapsed(a) / MINI_MS * 100).toFixed(1) + '%"></i></div>' : '')
    + '<button class="ghost" style="margin-top:12px" data-act="' + (a.running ? 'pause' : 'resume') + '" id="clock-btn">' + (a.running ? 'Pausar' : 'Seguir') + '</button></div>'
    + card + ask
    + '<div class="spacer"><button class="wood" data-act="finish">Terminar</button></div></div>';
}
function paintSession() {
  const a = S.meta.active; if (!a) return;
  const t = $('clock-time'); if (t) { t.textContent = clockText(elapsed(a)); t.classList.toggle('paused', !a.running); }
  const b = $('clock-btn'); if (b) { b.dataset.act = a.running ? 'pause' : 'resume'; b.textContent = a.running ? 'Pausar' : 'Seguir'; }
  const s = $('clock-sub'); if (s) s.textContent = a.running ? (a.mini ? miniText(a) : 'cualquier tiempo cuenta') : 'en pausa';
  const mb = $('mini-bar'); if (mb) mb.style.width = Math.min(100, elapsed(a) / MINI_MS * 100).toFixed(1) + '%';
}

/* ---------- registro corto (y edición de un registro) ---------- */
let R = null;
const ikey = (it) => it.t + ':' + it.id;
function curPos(it) { return it.t === 'course' ? ((S.courses[it.id] || {}).lesson || '') : ((S.pieces[it.id] || {}).pos || ''); }
function openReg(o, reuse) {
  const items = o.focus ? [o.focus] : [];
  R = { minutes: o.minutes || '', fromTimer: !!o.fromTimer, long: !!o.long, adjust: !o.fromTimer || !!o.long, day: 'hoy', other: '', items, pos: {}, song: {}, track: {}, done: {},
    picker: !items.length, more: false, extra: [], note: '', adding: false, newTitle: '', newKind: 'mia', err: '', edit: null };
  for (const it of items) seedItem(it);
  showOv('ov-reg', 'reg', reuse); renderReg();
}
function openEdit(id) {
  const s = S.sessions[id]; if (!s) return;
  R = { minutes: s.minutes, fromTimer: false, long: false, adjust: true, day: 'otro', other: s.day, items: [], pos: {}, song: {}, track: {}, done: {}, picker: false, more: true, extra: (s.tags || []).filter((t) => TAGNAME[t]), note: s.note || '', adding: false, newTitle: '', newKind: 'mia', err: '', edit: id };
  showOv('ov-reg', 'reg'); renderReg();
}
function seedItem(it) {
  const k = ikey(it); R.pos[k] = curPos(it);
  if (it.t === 'course') R.song[k] = (S.courses[it.id] || {}).song || '';
  if (it.t === 'piece') { const p = S.pieces[it.id] || {}; R.track[k] = p.track || 'compas'; R.done[k] = {}; }
}
function closeReg(fromPop) {
  if ($('ov-reg').hidden) return;
  $('ov-reg').hidden = true; R = null; lockBody();
  if (!fromPop) popLayer('reg');
}
function posField(it) {
  const k = ikey(it), id = 'rp-' + k.replace(':', '-');
  if (it.t === 'course') return '<label class="field" for="' + id + '">vídeo en el que quedaste<input type="text" id="' + id + '" data-pos="' + esc(k) + '" placeholder="Ej. 12" value="' + esc(R.pos[k]) + '" enterkeyhint="done"></label>'
    + '<label class="field" for="' + id + '-song">canción (opcional)<input type="text" id="' + id + '-song" data-song="' + esc(k) + '" placeholder="Ej. Clocks" value="' + esc(R.song[k] || '') + '" enterkeyhint="done"></label>';
  const tr = R.track[k];
  return '<div class="inline" style="justify-content:space-between"><span class="small muted">¿Cómo la sigues?</span><div class="seg" role="group" aria-label="Cómo la sigues"><button data-act="reg-track" data-k="' + esc(k) + '" data-v="compas" aria-pressed="' + (tr === 'compas') + '">Compás</button><button data-act="reg-track" data-k="' + esc(k) + '" data-v="tiempo" aria-pressed="' + (tr === 'tiempo') + '">Minuto</button></div></div>'
    + '<label class="field" for="' + id + '">' + (tr === 'tiempo' ? 'minuto donde quedaste' : 'compás donde quedaste') + '<input type="text" id="' + id + '" data-pos="' + esc(k) + '" ' + (tr === 'tiempo' ? 'placeholder="Ej. 2:35"' : 'inputmode="numeric" placeholder="Ej. 24"') + ' value="' + esc(R.pos[k]) + '" enterkeyhint="done"></label>';
}
function renderReg() {
  if (!R) return;
  let h = '<div class="ov-in"><div class="ov-top"><button class="backbtn" data-act="reg-back">' + I.back + (R.fromTimer ? 'Cronómetro' : 'Volver') + '</button></div>';
  h += '<header class="page-head">' + (R.edit ? '<h1 class="page-title">Corregir registro</h1>' : R.fromTimer ? '<h1 class="page-title">¡Tocaste ' + esc(R.minutes) + ' min!</h1>' : '<h1 class="page-title">¿Cuánto tocaste?</h1>');
  if (R.long) h += '<p class="hand" style="font-size:24px;line-height:1.15;color:var(--terra)">El cronómetro se quedó corriendo un buen rato. ¿Sí fue tanto? Ajusta los minutos si no.</p>';
  if (R.fromTimer && !R.adjust) h += '<button class="textbtn" style="align-self:flex-start;padding:0" data-act="reg-adjust">Ajustar minutos</button>';
  h += '</header>';
  if (R.adjust) h += '<section class="section"><div class="chips">' + [5, 10, 15, 20, 30, 45, 60].map((n) => '<button class="chip sm" data-act="reg-min" data-v="' + n + '" aria-pressed="' + (+R.minutes === n) + '">' + n + '</button>').join('') + '</div>'
    + '<label class="field" for="r-min">minutos<input type="number" inputmode="numeric" id="r-min" min="1" max="600" value="' + esc(R.minutes) + '" enterkeyhint="done"></label></section>';
  if (!R.fromTimer) h += '<section class="section"><span class="eyebrow">¿cuándo?</span><div class="seg" role="group" aria-label="Día">' + [['hoy', 'Hoy'], ['ayer', 'Ayer'], ['otro', 'Otro día']].map(([k, l]) => '<button data-act="reg-day" data-v="' + k + '" aria-pressed="' + (R.day === k) + '">' + l + '</button>').join('') + '</div>'
    + (R.day === 'otro' ? '<label class="field" for="r-date">fecha<input type="date" id="r-date" max="' + todayKey() + '" value="' + esc(R.other) + '"></label>' : '') + '</section>';
  if (R.edit) {
    const s = S.sessions[R.edit] || {}, names = sessItems(s).map((it) => itemName(it.t, it.id));
    if (names.length) h += '<p class="muted">' + esc(names.join(' · ')) + '</p>';
  }
  for (const it of R.items) {
    const k = ikey(it), p = it.t === 'piece' ? S.pieces[it.id] : null, pend = pendingOf(p);
    h += '<section class="panel"><div class="panel-head"><h3>' + esc(itemName(it.t, it.id)) + '</h3><button class="x" data-act="reg-rm" data-k="' + esc(k) + '" aria-label="Quitar ' + esc(itemName(it.t, it.id)) + '">' + I.close + '</button></div>' + posField(it)
      + (pend.length ? '<div><span class="eyebrow">pendientes</span>' + pend.map((t) => '<label class="check' + (R.done[k][t.id] ? ' done' : '') + '"><input type="checkbox" data-rdone="' + esc(k) + '|' + esc(t.id) + '"' + (R.done[k][t.id] ? ' checked' : '') + '><span>' + esc(t.text) + '</span></label>').join('') + '</div>' : '')
      + '</section>';
  }
  if (!R.edit) {
    if (R.picker) {
      const sel = new Set(R.items.map(ikey));
      const opts = pieceList().filter((p) => p.state !== 'sale').concat(pieceList().filter((p) => p.state === 'sale'));
      h += '<section class="section"><span class="eyebrow">' + (R.items.length ? '¿qué más tocaste?' : '¿qué tocaste?') + '</span><div class="chips">'
        + opts.filter((p) => !sel.has('piece:' + p.id)).map((p) => '<button class="chip" data-act="reg-add" data-t="piece" data-id="' + esc(p.id) + '">' + esc(p.title) + '</button>').join('')
        + courseList().filter((c) => !sel.has('course:' + c.id)).map((c) => '<button class="chip" data-act="reg-add" data-t="course" data-id="' + esc(c.id) + '">' + esc(c.name) + '</button>').join('')
        + (R.adding ? '' : '<button class="chip add" data-act="reg-new">+ pieza nueva</button>') + '</div>'
        + (R.adding ? '<div class="inline"><input type="text" id="r-np" aria-label="Nombre de la pieza nueva" placeholder="Nombre de la pieza" value="' + esc(R.newTitle) + '" enterkeyhint="done"><div class="seg" role="group" aria-label="De quién es">' + KINDS.map((x) => '<button data-act="reg-newkind" data-v="' + x.k + '" aria-pressed="' + (R.newKind === x.k) + '">' + (x.k === 'grupo' ? 'Grupo' : x.l) + '</button>').join('') + '</div><button class="btn sm solid" data-act="reg-addpiece">Agregar</button></div>' : '')
        + '</section>';
    } else {
      h += '<button class="textbtn" style="align-self:flex-start;padding:0" data-act="reg-picker">' + I.plus + ' ¿Tocaste algo más?</button>';
    }
  }
  if (R.more) {
    h += '<section class="section"><span class="eyebrow">más detalles</span><div class="chips">' + EXTRA.map((t) => '<button class="chip sm" data-act="reg-extra" data-v="' + t.k + '" aria-pressed="' + R.extra.includes(t.k) + '">' + t.l + '</button>').join('') + '</div>'
      + '<label class="field" for="r-note">nota<input type="text" id="r-note" placeholder="Cómo te sentiste, qué costó…" value="' + esc(R.note) + '" enterkeyhint="done"></label></section>';
  } else h += '<button class="textbtn muted" style="align-self:flex-start;padding:0" data-act="reg-more">Más detalles (técnica, nota)</button>';
  if (R.err) h += '<p class="err" role="alert">' + esc(R.err) + '</p>';
  h += '<div class="spacer"><button class="wood" data-act="reg-save">Guardar</button></div></div>';
  $('ov-reg').innerHTML = h;
}
function saveReg() {
  const min = Math.round(+R.minutes);
  if (!(min >= 1)) { R.err = 'Escribe cuántos minutos tocaste.'; R.adjust = true; renderReg(); return; }
  let day = todayKey();
  if (!R.fromTimer) { if (R.day === 'ayer') day = dkey(addDays(new Date(), -1)); else if (R.day === 'otro') { if (!R.other) { R.err = 'Elige el día en que tocaste.'; renderReg(); return; } day = R.other; } }
  if (R.edit) {
    const old = S.sessions[R.edit], id = R.edit, keep = (old && old.tags || []).filter((t) => !TAGNAME[t]);
    const next = Object.assign({}, old, { minutes: min, day, note: R.note.trim(), tags: keep.concat(R.extra) });
    closeReg(); if (old) put('sessions', id, next); toast('Registro corregido'); return;
  }
  const items = [];
  for (const it of R.items) {
    const k = ikey(it), pos = String(R.pos[k] || '').trim();
    const song = it.t === 'course' ? String(R.song[k] || '').trim() : '';
    const rec = { t: it.t, id: it.id }; if (pos) rec.pos = pos; if (song) rec.song = song;
    items.push(rec);
    if (it.t === 'course') {
      const cur = S.courses[it.id]; if (!cur) continue;
      if ((pos && pos !== (cur.lesson || '')) || (song && song !== (cur.song || ''))) put('courses', it.id, Object.assign({}, cur, pos ? { lesson: pos } : {}, song ? { song } : {}));
    } else {
      const p = S.pieces[it.id]; if (!p) continue;
      const doneIds = Object.keys(R.done[k] || {}).filter((x) => R.done[k][x]);
      const np = Object.assign({}, p, { track: R.track[k] || p.track || 'compas' });
      if (pos) np.pos = pos;
      if (doneIds.length) np.todos = (p.todos || []).map((t) => (doneIds.includes(t.id) ? Object.assign({}, t, { done: true }) : t));
      if (stable(strip(np)) !== stable(strip(p))) put('pieces', it.id, np);
    }
  }
  const s = { day, minutes: min, items, tags: R.extra.slice(), note: R.note.trim(), at: Date.now(), timer: R.fromTimer };
  const wasTimer = R.fromTimer;
  closeReg();
  put('sessions', uid(), s);
  if (wasTimer) { setMeta('active', null); closeSession(); }
  sugIdx = 0; route = 'hoy'; render(); window.scrollTo(0, 0);
  afterPops(() => { if (location.hash !== '#hoy') location.hash = '#hoy'; });
  celebrate();
}

/* ---------- hoja de pieza ---------- */
let P = null;
function openPiece(id, pre, reuse) {
  const p = id ? S.pieces[id] : null;
  P = p ? { id, title: p.title || '', kind: kindOf(p), state: p.state || 'aprendiendo', track: p.track || 'compas', pos: p.pos || '', link: p.link || '', video: p.video || '', note: p.note || '', todos: clone(p.todos || []), newTodo: '', confirm: false, err: '' }
    : Object.assign({ id: null, title: '', kind: repTab, state: 'aprendiendo', track: 'compas', pos: '', link: '', video: '', note: '', todos: [], newTodo: '', confirm: false, err: '' }, pre || {});
  showOv('ov-piece', 'piece', reuse); renderPiece();
  if (!p && !P.title) setTimeout(() => { const i = $('p-title'); if (i) i.focus(); }, 50);
}
function closePiece(fromPop) {
  if ($('ov-piece').hidden) return;
  $('ov-piece').hidden = true; P = null; confirmRec = null; lockBody();
  if (!fromPop) popLayer('piece');
}
function renderPiece() {
  if (!P) return;
  const isNew = !P.id, des = P.kind === 'desafio';
  let h = '<div class="ov-in"><div class="ov-top"><button class="backbtn" data-act="p-close">' + I.back + 'Volver</button>' + (isNew ? '' : '<button class="btn sm solid" data-act="p-play">Tocar ahora</button>') + '</div>'
    + '<label class="field" for="p-title">nombre<input type="text" id="p-title" value="' + esc(P.title) + '" placeholder="' + (des ? 'Ej. Desafío de la semana 3' : 'Ej. Skinny Love') + '" enterkeyhint="done"></label>'
    + '<section class="section"><span class="eyebrow">¿de quién es?</span><div class="seg" role="group" aria-label="De quién es">' + KINDS.map((x) => '<button data-act="p-kind" data-v="' + x.k + '" aria-pressed="' + (P.kind === x.k) + '">' + x.l + '</button>').join('') + '</div></section>'
    + '<section class="section"><span class="eyebrow">estado</span><div class="seg" role="group" aria-label="Estado">' + STATES.map((s) => '<button data-act="p-state" data-v="' + s.k + '" aria-pressed="' + (P.state === s.k) + '">' + (des && s.k === 'sale' ? 'Hecho' : s.l) + '</button>').join('') + '</div></section>'
    + '<section class="panel"><div class="panel-head"><h3>Dónde vas</h3><div class="seg" role="group" aria-label="Cómo la sigues"><button data-act="p-track" data-v="compas" aria-pressed="' + (P.track === 'compas') + '">Compás</button><button data-act="p-track" data-v="tiempo" aria-pressed="' + (P.track === 'tiempo') + '">Minuto</button></div></div>'
    + '<label class="field" for="p-pos">' + (P.track === 'tiempo' ? 'minuto del vídeo o canción' : 'compás de la partitura') + '<input type="text" id="p-pos" ' + (P.track === 'tiempo' ? 'placeholder="Ej. 2:35"' : 'inputmode="numeric" placeholder="Ej. 24"') + ' value="' + esc(P.pos) + '" enterkeyhint="done"></label>'
    + '<label class="field" for="p-link">enlace a la partitura (opcional)<input type="url" inputmode="url" id="p-link" placeholder="https://…" value="' + esc(P.link) + '" enterkeyhint="done"></label>'
    + '<label class="field" for="p-video">enlace al vídeo o tutorial (opcional)<input type="url" inputmode="url" id="p-video" placeholder="https://…" value="' + esc(P.video) + '" enterkeyhint="done"></label></section>'
    + '<section class="panel"><div class="panel-head"><h3>Pendientes</h3><span class="hand muted" style="font-size:21px">' + (P.kind === 'grupo' ? 'para el próximo encuentro' : 'lo que falta sacar') + '</span></div>'
    + (P.todos.length ? '<div>' + P.todos.map((t) => '<div class="inline" style="flex-wrap:nowrap"><label class="check' + (t.done ? ' done' : '') + '" style="flex:1"><input type="checkbox" data-ptodo="' + esc(t.id) + '"' + (t.done ? ' checked' : '') + '><span>' + esc(t.text) + '</span></label><button class="x" data-act="p-todo-rm" data-id="' + esc(t.id) + '" aria-label="Quitar pendiente">' + I.close + '</button></div>').join('') + '</div>' : '<p class="muted small">Nada pendiente.</p>')
    + '<div class="inline"><input type="text" id="p-newtodo" aria-label="Nuevo pendiente" placeholder="Ej. el puente, la mano izquierda del coro" value="' + esc(P.newTodo) + '" enterkeyhint="done"><button class="btn sm" data-act="p-todo-add">Anotar</button></div></section>'
    + '<label class="field" for="p-note">nota (opcional)<input type="text" id="p-note" placeholder="Tonalidad, digitación, lo que quieras recordar" value="' + esc(P.note) + '" enterkeyhint="done"></label>';
  if (!isNew) {
    const recs = recList().filter((r) => r.ref === P.id);
    h += '<section class="panel"><div class="panel-head"><h3>Grabaciones</h3><span class="hand muted" style="font-size:21px">para oír cuánto avanzas</span></div>'
      + (recs.length ? '<div class="recs">' + recs.map((r) => recRow(r, false)).join('') + '</div>' : '<p class="muted small">Aún no te has grabado con esta pieza.</p>')
      + (canRecord() ? '<button class="btn" style="align-self:flex-start;display:inline-flex;align-items:center;gap:8px" data-act="rec-open" data-id="' + esc(P.id) + '">' + I.mic + 'Grabarme 30 segundos</button>' : '<p class="muted small">Este navegador no deja grabar audio.</p>') + '</section>';
  }
  if (P.err) h += '<p class="err" role="alert">' + esc(P.err) + '</p>';
  h += '<div class="spacer"><button class="wood" data-act="p-save">' + (isNew ? (des ? 'Agregar desafío' : 'Agregar pieza') : 'Guardar') + '</button>';
  if (!isNew) h += P.confirm ? '<div class="confirm" style="justify-content:center">¿Borrar esta pieza? <button class="btn sm danger" data-act="p-del-yes">Borrar</button><button class="btn sm" data-act="p-del-no">Cancelar</button></div>'
    : '<button class="textbtn muted" style="align-self:center" data-act="p-del">Borrar pieza</button>';
  h += '</div></div>';
  $('ov-piece').innerHTML = h;
}
function pieceFromSheet() {
  const old = P.id ? S.pieces[P.id] : {};
  return Object.assign({}, old, { title: P.title.trim(), kind: P.kind, group: P.kind === 'grupo', state: P.state, track: P.track, pos: P.pos.trim(), link: P.link.trim(), video: P.video.trim(), note: P.note.trim(), todos: P.todos, at: (old && old.at) || Date.now() });
}
function savePiece(thenPlay) {
  if (P.newTodo.trim()) { P.todos.push({ id: uid(), text: P.newTodo.trim(), done: false }); P.newTodo = ''; }
  if (!P.title.trim()) { P.err = 'Ponle nombre.'; renderPiece(); return; }
  const id = P.id || uid(), isNew = !P.id;
  put('pieces', id, pieceFromSheet());
  if (thenPlay) { const reuse = takeLayer('piece'); closePiece(true); startSession({ t: 'piece', id }, { reuse }); }
  else { closePiece(); toast(isNew ? 'Agregada a tu atril' : 'Guardado'); }
}

/* ---------- grabaciones de 30 segundos ----------
   El audio se guarda en este aparato (IndexedDB) y, si hay cuenta, se sube a Supabase Storage (carpeta privada atril-audio).
   En S.recs solo va la ficha: de qué pieza es, fecha, duración y si ya subió. */
const REC_MAX = 30, BUCKET = 'atril-audio';
const canRecord = () => !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
let idb = null, playing = null, recRetryAt = 0, recBusy = false;
function idbOpen() {
  return new Promise((res, rej) => {
    if (idb) return res(idb);
    if (!window.indexedDB) return rej(new Error('sin IndexedDB'));
    const r = indexedDB.open('atril-audio', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('blobs');
    r.onsuccess = () => { idb = r.result; res(idb); };
    r.onerror = () => rej(r.error);
  });
}
function idbDo(mode, fn) { return idbOpen().then((d) => new Promise((res, rej) => { const tx = d.transaction('blobs', mode), q = fn(tx.objectStore('blobs')); tx.oncomplete = () => res(q && q.result); tx.onerror = () => rej(tx.error); })); }
const idbPut = (id, blob) => idbDo('readwrite', (s) => s.put(blob, id));
const idbGet = (id) => idbDo('readonly', (s) => s.get(id)).catch(() => null);
const idbDel = (id) => idbDo('readwrite', (s) => s.delete(id)).catch(() => null);
const recPath = (id) => cloud.session.user.id + '/' + id;
async function uploadRecs() {
  if (!cloudReady() || recBusy || Date.now() < recRetryAt) return;
  recBusy = true;
  try {
    for (const r of recList()) {
      if (r.up) continue;
      const blob = await idbGet(r.id); if (!blob) continue; /* se grabó en otro aparato: lo sube ese */
      const path = recPath(r.id);
      const w = await cloud.sb.storage.from(BUCKET).upload(path, blob, { contentType: String(r.mime || 'audio/webm').split(';')[0], upsert: true });
      if (w.error) { recRetryAt = Date.now() + 600000; break; }
      if (S.recs[r.id]) put('recs', r.id, Object.assign({}, S.recs[r.id], { up: true, path }));
    }
  } catch (e) { recRetryAt = Date.now() + 600000; }
  recBusy = false;
}
async function recBlob(r) {
  let blob = await idbGet(r.id);
  if (!blob && r.up && r.path && cloudReady()) {
    const d = await cloud.sb.storage.from(BUCKET).download(r.path);
    if (!d.error && d.data) { blob = d.data; idbPut(r.id, blob).catch(() => {}); }
  }
  return blob;
}
function repaintRecs() {
  if (P && !typingIn($('ov-piece'))) renderPiece();
  if (route === 'diario' && !typingIn($('view'))) render();
}
async function playRec(id) {
  const au = $('player');
  if (playing === id) { au.pause(); playing = null; repaintRecs(); return; }
  const r = S.recs[id]; if (!r) return;
  let blob = null;
  try { blob = await recBlob(Object.assign({ id }, r)); } catch (e) {}
  if (!blob) { toast(r.up ? 'No se pudo traer el audio. Revisa tu internet.' : 'Ese audio está en el otro aparato y aún no ha subido.'); return; }
  try { if (au.dataset.url) URL.revokeObjectURL(au.dataset.url); } catch (e) {}
  au.dataset.url = au.src = URL.createObjectURL(blob);
  playing = id; repaintRecs();
  au.play().catch(() => { playing = null; repaintRecs(); });
}
$('player').addEventListener('ended', () => { playing = null; repaintRecs(); });
function deleteRec(id) {
  const r = S.recs[id]; if (!r) return;
  if (playing === id) { $('player').pause(); playing = null; }
  if (r.up && r.path && cloudReady()) cloud.sb.storage.from(BUCKET).remove([r.path]).catch(() => {});
  idbDel(id); del('recs', id); repaintRecs();
}
/* ¿Vale la pena ofrecer grabarse? Solo tras tocar hoy una pieza que lleva 30 días (o nunca) sin grabación. */
function recDue() {
  if (!canRecord()) return null;
  const tk = todayKey();
  const today = sessList().filter((s) => s.day === tk).sort((a, b) => (b.at || 0) - (a.at || 0))[0];
  if (!today) return null;
  const it = sessItems(today).find((x) => x.t === 'piece' && S.pieces[x.id]); if (!it) return null;
  let skip = ''; try { skip = localStorage.getItem('atril.recskip') || ''; } catch (e) {}
  if (skip === tk + ':' + it.id) return null;
  const last = recList().find((r) => r.ref === it.id);
  if (last && Date.now() - (last.at || 0) < 30 * 86400000) return null;
  return it.id;
}
let G = null;
function openRec(pieceId, reuse) {
  if (!S.pieces[pieceId]) return;
  G = { ref: pieceId, stage: 'idle', start: 0, blob: null, url: '', mime: '', dur: 0, err: '', mr: null, stream: null, timer: null };
  showOv('ov-rec', 'rec', reuse); renderRec();
}
function stopTracks() { if (G && G.stream) { try { G.stream.getTracks().forEach((t) => t.stop()); } catch (e) {} G.stream = null; } }
function closeRec(fromPop) {
  if ($('ov-rec').hidden) return;
  if (G) { clearInterval(G.timer); try { if (G.mr && G.mr.state !== 'inactive') { G.mr.onstop = null; G.mr.stop(); } } catch (e) {} stopTracks(); try { if (G.url) URL.revokeObjectURL(G.url); } catch (e) {} }
  $('ov-rec').hidden = true; G = null; lockBody();
  if (!fromPop) popLayer('rec');
}
function renderRec() {
  if (!G) return;
  let h = '<div class="ov-in"><div class="ov-top"><button class="backbtn" data-act="rec-close">' + I.back + 'Volver</button></div>'
    + '<header class="page-head"><h1 class="page-title">Grábate 30 segundos</h1><p class="muted">' + esc(itemName('piece', G.ref)) + '. Solo audio: queda con la fecha para que después oigas cuánto avanzaste.</p></header>';
  if (G.stage === 'idle') h += '<button class="recbig" data-act="rec-start">Grabar<small>hasta 30 s</small></button><p class="hand muted" style="text-align:center;font-size:24px">no tiene que salir perfecto: es una foto de hoy</p>';
  else if (G.stage === 'rec') h += '<div class="rectime" id="rec-time" aria-live="off">0:00</div><button class="recbig live" data-act="rec-stop">Parar<small>se detiene sola a los 30 s</small></button>';
  else if (G.stage === 'done') h += '<audio class="inline" controls src="' + esc(G.url) + '"></audio><p class="hand muted" style="text-align:center;font-size:24px">' + Math.round(G.dur) + ' segundos</p>'
    + '<div class="spacer"><button class="wood" data-act="rec-save">Guardar</button><button class="wood alt" data-act="rec-again">Repetir</button></div>';
  if (G.err) h += '<p class="err" role="alert">' + esc(G.err) + '</p>';
  $('ov-rec').innerHTML = h + '</div>';
}
async function startRec() {
  if (!G || G.stage === 'rec') return;
  G.err = '';
  try {
    G.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (e) { if (G) { G.err = 'No pude usar el micrófono. Dale permiso a Atril en los ajustes del sitio y vuelve a intentar.'; renderRec(); } return; }
  if (!G) return;
  try {
    const want = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((t) => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t));
    const mr = new MediaRecorder(G.stream, want ? { mimeType: want } : undefined), chunks = [];
    G.mr = mr; G.mime = mr.mimeType || want || 'audio/webm';
    mr.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    mr.onstop = () => {
      if (!G) return;
      clearInterval(G.timer); stopTracks();
      G.dur = Math.min(REC_MAX, (Date.now() - G.start) / 1000);
      G.blob = new Blob(chunks, { type: G.mime }); G.url = URL.createObjectURL(G.blob);
      G.stage = G.blob.size ? 'done' : 'idle'; if (!G.blob.size) G.err = 'No quedó nada grabado. Intenta otra vez.';
      renderRec();
    };
    mr.start(); G.start = Date.now(); G.stage = 'rec'; renderRec();
    G.timer = setInterval(() => {
      if (!G) return;
      const s = (Date.now() - G.start) / 1000, t = $('rec-time'); if (t) t.textContent = '0:' + pad(Math.min(REC_MAX, Math.floor(s)));
      if (s >= REC_MAX) stopRec();
    }, 250);
  } catch (e) { stopTracks(); G.err = 'Este navegador no pudo grabar.'; G.stage = 'idle'; renderRec(); }
}
function stopRec() { if (G && G.mr && G.mr.state !== 'inactive') { try { G.mr.stop(); } catch (e) {} } }
async function saveRec() {
  if (!G || !G.blob) return;
  const id = uid(), ref = G.ref, dur = G.dur, mime = G.mime, blob = G.blob;
  try { await idbPut(id, blob); } catch (e) { G.err = 'No se pudo guardar en este aparato.'; renderRec(); return; }
  closeRec();
  put('recs', id, { t: 'piece', ref, at: Date.now(), dur: Math.round(dur * 10) / 10, mime, up: false });
  toast('¡Guardada! En unos meses te vas a oír distinto.', 3200);
  repaintRecs(); uploadRecs();
}

/* ---------- compartir un enlace hacia Atril (Chrome → Compartir → Atril) ---------- */
let H = null;
function readShare() {
  let q; try { q = new URLSearchParams(location.search); } catch (e) { return null; }
  if (!q.has('url') && !q.has('text') && !q.has('title')) return null;
  const m = [q.get('url'), q.get('text')].filter(Boolean).join(' ').match(/https?:\/\/[^\s]+/i);
  const title = (q.get('title') || '').trim();
  try { history.replaceState(null, '', location.pathname + location.hash); } catch (e) {}
  const url = m ? safeUrl(m[0]) : '';
  return url ? { url, title } : null;
}
function openShare(sh) {
  H = { url: sh.url, title: sh.title || '', dest: null, slot: 'video', lesson: sh.title || '' };
  showOv('ov-share', 'share'); renderShare();
}
function closeShare(fromPop) {
  if ($('ov-share').hidden) return;
  $('ov-share').hidden = true; H = null; lockBody();
  if (!fromPop) popLayer('share');
}
function renderShare() {
  if (!H) return;
  const is = (t, id) => !!(H.dest && H.dest.t === t && H.dest.id === id);
  let h = '<div class="ov-in"><div class="ov-top"><button class="backbtn" data-act="share-close">' + I.back + 'Cancelar</button></div>'
    + '<header class="page-head"><h1 class="page-title">Guardar este enlace</h1></header>'
    + '<p class="sharelink">' + (H.title ? '<b>' + esc(H.title) + '</b><br>' : '') + esc(H.url) + '</p>'
    + '<section class="section"><span class="eyebrow">¿es el vídeo donde vas en un curso?</span><div class="chips">' + courseList().map((c) => '<button class="chip" data-act="share-dest" data-t="course" data-id="' + esc(c.id) + '" aria-pressed="' + is('course', c.id) + '">' + esc(c.name) + '</button>').join('') + '</div></section>'
    + '<section class="section"><span class="eyebrow">¿o es de una pieza?</span><div class="chips">' + pieceList().map((p) => '<button class="chip" data-act="share-dest" data-t="piece" data-id="' + esc(p.id) + '" aria-pressed="' + is('piece', p.id) + '">' + esc(p.title) + '</button>').join('')
    + '<button class="chip add" data-act="share-new">+ pieza o desafío nuevo</button></div></section>';
  if (H.dest && H.dest.t === 'course') h += '<label class="field" for="sh-lesson">vídeo en el que vas<input type="text" id="sh-lesson" value="' + esc(H.lesson) + '" placeholder="Ej. 12, o el nombre del vídeo" enterkeyhint="done"></label>';
  if (H.dest && H.dest.t === 'piece') h += '<div class="seg" role="group" aria-label="Qué es el enlace"><button data-act="share-slot" data-v="link" aria-pressed="' + (H.slot === 'link') + '">Es la partitura</button><button data-act="share-slot" data-v="video" aria-pressed="' + (H.slot === 'video') + '">Es el vídeo</button></div>';
  h += '<div class="spacer">' + (H.dest ? '<button class="wood" data-act="share-save">Guardar</button>' : '<p class="hand muted" style="text-align:center;font-size:24px">elige dónde guardarlo</p>') + '</div></div>';
  $('ov-share').innerHTML = h;
}
function saveShare() {
  if (!H || !H.dest) return;
  const d = H.dest, url = H.url; let name = '';
  if (d.t === 'course') { const c = S.courses[d.id]; if (!c) return; name = c.name; put('courses', d.id, Object.assign({}, c, { link: url }, H.lesson.trim() ? { lesson: H.lesson.trim() } : {})); }
  else { const p = S.pieces[d.id]; if (!p) return; name = p.title; put('pieces', d.id, Object.assign({}, p, { [H.slot]: url })); }
  closeShare(); toast('Enlace guardado en ' + name);
}

/* ---------- cuenta y cuaderno ---------- */
let A = null;
function openAcct() {
  A = { email: '', pass: '', err: '', busy: false, confirmOut: false };
  showOv('ov-acct', 'acct'); renderAcct();
}
function closeAcct(fromPop) {
  if ($('ov-acct').hidden) return;
  $('ov-acct').hidden = true; A = null; lockBody();
  if (!fromPop) popLayer('acct');
}
function renderAcct() {
  if (!A || $('ov-acct').hidden || typingIn($('ov-acct'))) return;
  let h = '<div class="ov-in"><div class="ov-top"><button class="backbtn" data-act="acct-close">' + I.back + 'Volver</button></div>'
    + '<header class="page-head"><h1 class="page-title">Cuenta y cuaderno</h1><p class="muted" data-sync>' + esc(SYNC_TXT[cloud.state]) + '</p></header>';
  if (!cloud.sb) {
    h += '<p class="muted">No se pudo cargar la conexión con la nube. Revisa tu internet y vuelve a abrir Atril. Mientras tanto, todo queda en este aparato.</p>';
  } else if (!cloud.session) {
    h += '<p>Entra con la misma cuenta de Fibra y Trazo. Así la tablet y el celular ven lo mismo, y si empiezas el cronómetro en uno lo ves en el otro.</p>'
      + '<form id="acct-form" class="section" novalidate>'
      + '<label class="field" for="a-email">correo<input type="email" id="a-email" autocomplete="username" inputmode="email" autocapitalize="off" spellcheck="false" value="' + esc(A.email) + '" enterkeyhint="next"></label>'
      + '<label class="field" for="a-pass">contraseña<input type="password" id="a-pass" autocomplete="current-password" value="' + esc(A.pass) + '" enterkeyhint="go"></label>'
      + (A.err ? '<p class="err" role="alert">' + esc(A.err) + '</p>' : '')
      + '<button class="wood" type="submit"' + (A.busy ? ' disabled' : '') + '>' + (A.busy ? 'Entrando…' : 'Entrar') + '</button></form>';
  } else {
    const pend = recList().filter((r) => !r.up).length;
    h += '<section class="panel"><span class="eyebrow">entraste como</span><p style="overflow-wrap:anywhere">' + esc(cloud.session.user.email || '') + '</p>'
      + (pend ? '<p class="small muted">' + pend + (pend === 1 ? ' grabación está' : ' grabaciones están') + ' solo en este aparato por ahora.</p>' : '')
      + '<div class="inline"><button class="btn solid" data-act="acct-sync">Sincronizar ahora</button></div></section>';
  }
  h += '<section class="panel"><label class="field" for="a-name">este cuaderno es de<input type="text" id="a-name" value="' + esc(S.meta.settings.name || '') + '" placeholder="Tu nombre, para la portada" autocomplete="given-name" enterkeyhint="done"></label></section>';
  if (canNotify()) {
    const perm = Notification.permission, on = perm === 'granted' && S.meta.settings.notify === 'on';
    h += '<section class="panel"><div class="panel-head"><h3>Aviso de sesión en curso</h3><span class="tag' + (on ? ' done' : '') + '">' + (on ? 'Activo' : 'Apagado') + '</span></div>'
      + '<p class="small muted">Mientras corre el cronómetro deja una notificación para volver a Atril de un toque.</p>'
      + (perm === 'denied' ? '<p class="small err">Este aparato tiene bloqueadas las notificaciones de Atril. Se cambia en los ajustes del sitio, en Chrome.</p>'
        : '<button class="btn" style="align-self:flex-start" data-act="' + (on ? 'note-off' : 'note-yes') + '">' + (on ? 'Apagar' : 'Activar') + '</button>') + '</section>';
  }
  if (cloud.session) h += A.confirmOut
    ? '<div class="confirm">¿Cerrar sesión? Lo de este aparato se queda aquí, pero deja de sincronizar. <button class="btn sm danger" data-act="acct-out-yes">Cerrar sesión</button><button class="btn sm" data-act="acct-out-no">Cancelar</button></div>'
    : '<button class="textbtn muted" style="align-self:flex-start;padding:0" data-act="acct-out">Cerrar sesión</button>';
  $('ov-acct').innerHTML = h + '</div>';
}
async function doLogin() {
  if (!A || A.busy || !cloud.sb) return;
  const ei = $('a-email'), pi = $('a-pass');
  A.email = ei ? ei.value.trim() : ''; A.pass = pi ? pi.value : '';
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  if (!A.email || !A.pass) { A.err = 'Escribe tu correo y tu contraseña.'; renderAcct(); return; }
  A.busy = true; A.err = ''; renderAcct();
  try {
    const r = await cloud.sb.auth.signInWithPassword({ email: A.email, password: A.pass });
    if (r.error) { if (A) { A.busy = false; A.err = authErr(r.error); renderAcct(); } return; }
    cloud.session = r.data.session;
    closeAcct(); render();
    toast('Listo. Ahora Atril se guarda en tu cuenta');
    syncNow();
  } catch (e) {
    if (A) { A.busy = false; A.err = authErr(e); renderAcct(); }
  }
}

/* ---------- portada del cuaderno ---------- */
function coverHtml(first) {
  const who = (S.meta.settings.name || '').trim();
  return '<div class="cv" data-act="cover-open">' + GARABATOS.sol() + GARABATOS.estrella() + GARABATOS.notas() + GARABATOS.hoja() + GARABATOS.espiral() + GARABATOS.corazon()
    + '<div class="label"><span class="n">Atril</span><span class="s">cuaderno de piano</span>'
    + (first ? '<label class="field" for="cv-name">este cuaderno es de<input type="text" id="cv-name" placeholder="Tu nombre" autocomplete="given-name" enterkeyhint="go"></label><button class="wood" data-act="cover-name">Abrir mi cuaderno</button>'
      : (who ? '<span class="de">de ' + esc(who) + '</span>' : '')) + '</div></div>';
}
function showCover() {
  const c = $('cover'); let seen = false, asked = false;
  try { seen = sessionStorage.getItem('atril.cover') === '1'; asked = localStorage.getItem('atril.coverAsked') === '1'; } catch (e) { seen = true; }
  if (seen || S.meta.active || pendingShare) return;
  try { sessionStorage.setItem('atril.cover', '1'); } catch (e) {}
  const first = !asked && !(S.meta.settings.name || '').trim();
  c.innerHTML = coverHtml(first); c.hidden = false;
  if (!first) setTimeout(openCover, 600);
}
function openCover() {
  const c = $('cover'); if (c.hidden || c.classList.contains('open')) return;
  try { localStorage.setItem('atril.coverAsked', '1'); } catch (e) {}
  c.classList.add('open');
  setTimeout(() => { c.hidden = true; c.innerHTML = ''; c.classList.remove('open'); }, reduced() ? 220 : 720);
}

/* ---------- aviso de sesión en curso (notificación) ---------- */
const canNotify = () => 'Notification' in window && 'serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === '127.0.0.1' || location.hostname === 'localhost');
const noteAskable = () => canNotify() && Notification.permission === 'default' && S.meta.settings.notify !== 'off';
async function sessionNote() {
  const a = S.meta.active;
  if (!a || !canNotify() || Notification.permission !== 'granted' || S.meta.settings.notify !== 'on') return;
  try {
    const reg = await navigator.serviceWorker.getRegistration(); if (!reg) return;
    const f = a.focus;
    await reg.showNotification('Atril · sesión en curso', { body: (f ? itemName(f.t, f.id) + ' · ' : '') + 'toca aquí para volver y terminar', tag: 'atril-sesion', icon: 'icons/icon-192.png', badge: 'icons/badge-96.png', silent: true, requireInteraction: true, timestamp: a.start });
  } catch (e) {}
}
async function clearNote() {
  if (!canNotify()) return;
  try { const reg = await navigator.serviceWorker.getRegistration(); if (!reg) return; (await reg.getNotifications({ tag: 'atril-sesion' })).forEach((n) => n.close()); } catch (e) {}
}
async function noteYes() {
  let p = 'denied';
  try { p = await Notification.requestPermission(); } catch (e) {}
  setSetting('notify', p === 'granted' ? 'on' : 'off');
  if (p === 'granted') { sessionNote(); toast('Listo: verás el aviso mientras corre el cronómetro'); } else toast('Sin aviso. Lo puedes activar después en Cuenta y cuaderno.', 3200);
  if (!$('ov-session').hidden) renderSession();
  renderAcct();
}

/* ---------- toast ---------- */
let toastT = null;
function toast(msg, ms, action) {
  const t = $('toast'); t.textContent = msg; t.classList.toggle('act', !!action);
  if (action) { const b = document.createElement('button'); b.type = 'button'; b.textContent = action.label; b.addEventListener('click', () => { t.classList.remove('show'); action.fn(); }); t.appendChild(b); }
  t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), ms || 2400);
}

/* ---------- eventos ---------- */
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const act = el.dataset.act, id = el.dataset.id, v = el.dataset.v, k = el.dataset.k;
  switch (act) {
    case 'go': if (S.meta.active) openSession(); else startSession({ t: el.dataset.t, id }); break;
    case 'go-open': if (S.meta.active) openSession(); else startSession({ t: el.dataset.t, id }); break; /* es un <a>: además abre el enlace */
    case 'mini': if (S.meta.active) openSession(); else startSession({ t: el.dataset.t, id }, { mini: true }); break;
    case 'free': startSession(null); break;
    case 'resume-ov': openSession(); break;
    case 'manual': openReg({}); break;
    case 'other': sugIdx++; render(); break;
    case 'goto-cursos': location.hash = '#cursos'; break;
    case 'to-group': repTab = 'grupo'; break;
    case 'new-piece': openPiece(null); break;
    case 'open-piece': openPiece(id); break;
    case 'rep-tab': repTab = v; render(); break;
    case 'mes': diaYM = v; render(); break;
    case 'minimize': closeSession(); render(); break;
    case 'pause': { const a = S.meta.active; if (a) setMeta('active', Object.assign({}, a, { acc: elapsed(a), running: false })); paintSession(); break; }
    case 'resume': { const a = S.meta.active; if (a) setMeta('active', Object.assign({}, a, { start: Date.now(), running: true })); paintSession(); break; }
    case 'discard-ask': askDiscard = true; renderSession(); break;
    case 'discard-no': askDiscard = false; renderSession(); break;
    case 'discard-yes': askDiscard = false; setMeta('active', null); closeSession(); render(); toast('Descartado. No pasa nada.'); break;
    case 'finish': { const a = S.meta.active; const mins = Math.max(1, Math.round(elapsed(a) / 60000)); const reuse = takeLayer('session'); closeSession(true); openReg({ minutes: mins, fromTimer: true, focus: a && a.focus, long: mins > LARGO_MIN }, reuse); break; }
    case 'note-yes': noteYes(); break;
    case 'note-no': setSetting('notify', 'off'); if (!$('ov-session').hidden) renderSession(); break;
    case 'note-off': setSetting('notify', 'off'); clearNote(); renderAcct(); break;
    case 'reg-back': { const ft = R && R.fromTimer; if (ft && S.meta.active) { const reuse = takeLayer('reg'); closeReg(true); openSession(reuse); } else closeReg(); break; }
    case 'reg-adjust': R.adjust = true; renderReg(); setTimeout(() => { const i = $('r-min'); if (i) i.focus(); }, 0); break;
    case 'reg-min': R.minutes = +v; R.err = ''; renderReg(); break;
    case 'reg-day': R.day = v; R.err = ''; renderReg(); break;
    case 'reg-track': R.track[k] = v; renderReg(); break;
    case 'reg-rm': R.items = R.items.filter((it) => ikey(it) !== k); if (!R.items.length) R.picker = true; renderReg(); break;
    case 'reg-add': { const it = { t: el.dataset.t, id }; R.items.push(it); seedItem(it); renderReg(); break; }
    case 'reg-picker': R.picker = true; renderReg(); break;
    case 'reg-more': R.more = true; renderReg(); break;
    case 'reg-extra': R.extra = R.extra.includes(v) ? R.extra.filter((x) => x !== v) : R.extra.concat(v); renderReg(); break;
    case 'reg-new': R.adding = true; renderReg(); setTimeout(() => { const i = $('r-np'); if (i) i.focus(); }, 0); break;
    case 'reg-newkind': R.newKind = v; renderReg(); break;
    case 'reg-addpiece': {
      const title = R.newTitle.trim(); if (!title) { const i = $('r-np'); if (i) i.focus(); break; }
      const nid = uid(); put('pieces', nid, { title, kind: R.newKind, group: R.newKind === 'grupo', state: 'aprendiendo', track: 'compas', at: Date.now() });
      const it = { t: 'piece', id: nid }; R.items.push(it); seedItem(it); R.adding = false; R.newTitle = ''; R.newKind = 'mia'; renderReg(); break;
    }
    case 'reg-save': saveReg(); break;
    case 'p-close': closePiece(); break;
    case 'p-kind': P.kind = v; renderPiece(); break;
    case 'p-state': P.state = v; renderPiece(); break;
    case 'p-track': P.track = v; renderPiece(); break;
    case 'p-todo-add': if (P.newTodo.trim()) { P.todos.push({ id: uid(), text: P.newTodo.trim(), done: false }); P.newTodo = ''; renderPiece(); setTimeout(() => { const i = $('p-newtodo'); if (i) i.focus(); }, 0); } break;
    case 'p-todo-rm': P.todos = P.todos.filter((t) => t.id !== id); renderPiece(); break;
    case 'p-save': savePiece(false); break;
    case 'p-play': if (S.meta.active) { toast('Ya tienes una sesión abierta'); break; } savePiece(true); break;
    case 'p-del': P.confirm = true; renderPiece(); break;
    case 'p-del-no': P.confirm = false; renderPiece(); break;
    case 'p-del-yes': { const pid = P.id, old = S.pieces[pid]; closePiece(); del('pieces', pid); toast('Pieza borrada', 6000, { label: 'Deshacer', fn: () => put('pieces', pid, old) }); break; }
    case 'goal': setSetting('goal', +v); break;
    case 'sedit': openEdit(id); break;
    case 'sdel': { const old = S.sessions[id]; if (!old) break; del('sessions', id); toast('Registro borrado', 6000, { label: 'Deshacer', fn: () => put('sessions', id, old) }); break; }
    case 'course-new': courseAdding = true; render(); setTimeout(() => { const i = $('nc-name'); if (i) i.focus(); }, 0); break;
    case 'course-add-no': courseAdding = false; render(); break;
    case 'course-add': { const i = $('nc-name'), name = i ? i.value.trim() : ''; if (!name) { if (i) i.focus(); break; } if (i) i.blur(); courseAdding = false; put('courses', uid(), { name, at: Date.now() }); toast('Curso agregado'); break; }
    case 'course-edit': if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); courseEdit = courseEdit === id ? null : id; setTimeout(render, 0); break;
    case 'course-del': confirmCourse = id; render(); break;
    case 'course-del-no': confirmCourse = null; render(); break;
    case 'course-del-yes': { const old = S.courses[id]; confirmCourse = null; courseEdit = null; del('courses', id); toast('Curso borrado', 6000, { label: 'Deshacer', fn: () => put('courses', id, old) }); break; }
    case 'rec-open': { const pid = id; if (P) { if (P.title.trim() && P.id) put('pieces', P.id, pieceFromSheet()); const reuse = takeLayer('piece'); closePiece(true); openRec(pid, reuse); } else openRec(pid); break; }
    case 'rec-skip': try { localStorage.setItem('atril.recskip', todayKey() + ':' + id); } catch (x) {} render(); break;
    case 'rec-close': closeRec(); break;
    case 'rec-start': startRec(); break;
    case 'rec-stop': stopRec(); break;
    case 'rec-again': try { if (G.url) URL.revokeObjectURL(G.url); } catch (x) {} G.blob = null; G.url = ''; G.stage = 'idle'; renderRec(); break;
    case 'rec-save': saveRec(); break;
    case 'rec-play': playRec(id); break;
    case 'rec-del': confirmRec = id; repaintRecs(); break;
    case 'rec-del-no': confirmRec = null; repaintRecs(); break;
    case 'rec-del-yes': confirmRec = null; deleteRec(id); toast('Grabación borrada'); break;
    case 'share-close': closeShare(); break;
    case 'share-dest': H.dest = { t: el.dataset.t, id }; renderShare(); break;
    case 'share-slot': H.slot = v; renderShare(); break;
    case 'share-save': saveShare(); break;
    case 'share-new': { const pre = { video: H.url, title: H.title, kind: 'desafio', track: 'tiempo' }; const reuse = takeLayer('share'); closeShare(true); openPiece(null, pre, reuse); break; }
    case 'acct': openAcct(); break;
    case 'acct-close': closeAcct(); break;
    case 'acct-sync': syncNow().then(() => toast(cloud.state === 'ok' ? 'Al día' : SYNC_TXT[cloud.state])); break;
    case 'acct-out': A.confirmOut = true; renderAcct(); break;
    case 'acct-out-no': A.confirmOut = false; renderAcct(); break;
    case 'acct-out-yes': if (cloud.sb) cloud.sb.auth.signOut().catch(() => {}); cloud.session = null; setSync('nologin'); closeAcct(); render(); toast('Sesión cerrada'); break;
    case 'cover-open': if (!e.target.closest('.label') || !$('cv-name')) openCover(); break;
    case 'cover-name': { const i = $('cv-name'), name = i ? i.value.trim() : ''; if (name) setSetting('name', name); openCover(); break; }
  }
});
document.addEventListener('input', (e) => {
  const t = e.target;
  if (A && t.id === 'a-email') { A.email = t.value; return; }
  if (A && t.id === 'a-pass') { A.pass = t.value; return; }
  if (H && t.id === 'sh-lesson') { H.lesson = t.value; return; }
  if (R) {
    if (t.id === 'r-min') { R.minutes = t.value; R.err = ''; return; }
    if (t.id === 'r-date') { R.other = t.value; return; }
    if (t.id === 'r-np') { R.newTitle = t.value; return; }
    if (t.id === 'r-note') { R.note = t.value; return; }
    if (t.dataset.pos) { R.pos[t.dataset.pos] = t.value; return; }
    if (t.dataset.song) { R.song[t.dataset.song] = t.value; return; }
  }
  if (P) {
    const map = { 'p-title': 'title', 'p-pos': 'pos', 'p-link': 'link', 'p-video': 'video', 'p-note': 'note', 'p-newtodo': 'newTodo' };
    if (map[t.id]) { P[map[t.id]] = t.value; if (t.id === 'p-title') P.err = ''; }
  }
});
document.addEventListener('keydown', (e) => {
  const id = e.target && e.target.id;
  if (e.key === 'Enter') {
    const btn = { 'p-newtodo': '[data-act="p-todo-add"]', 'r-np': '[data-act="reg-addpiece"]', 'nc-name': '[data-act="course-add"]', 'cv-name': '[data-act="cover-name"]' }[id];
    if (btn) { e.preventDefault(); const b = document.querySelector(btn); if (b) b.click(); }
    else if (e.target.tagName === 'INPUT' && e.target.type !== 'checkbox' && !e.target.closest('form')) e.target.blur();
  }
  if (e.key === 'Escape' && layers.length && e.target.tagName !== 'INPUT') history.back();
});
document.addEventListener('change', (e) => {
  const t = e.target;
  if (t.id === 'r-date' && R) { R.other = t.value; return; }
  if (t.dataset.rdone && R) { const [k, tid] = t.dataset.rdone.split('|'); R.done[k][tid] = t.checked; t.closest('.check').classList.toggle('done', t.checked); return; }
  if (t.dataset.ptodo && P) { const td = P.todos.find((x) => x.id === t.dataset.ptodo); if (td) td.done = t.checked; t.closest('.check').classList.toggle('done', t.checked); return; }
  if (t.id === 'g-next') { setMeta('group', Object.assign({}, S.meta.group, { next: t.value })); return; }
  if (t.id === 'a-name') { const name = t.value.trim(); if (name !== (S.meta.settings.name || '')) { setSetting('name', name); toast('Anotado en la portada'); } return; }
  if (t.dataset.course) {
    const id = t.dataset.course, f = t.dataset.f, cur = S.courses[id]; if (!cur) return;
    const val = t.value.trim();
    if ((cur[f] || '') === val || (f === 'name' && !val)) return;
    put('courses', id, Object.assign({}, cur, { [f]: f === 'link' ? (safeUrl(val) || val) : val }));
    toast('Anotado');
  }
});
document.addEventListener('submit', (e) => { e.preventDefault(); if (e.target.id === 'acct-form') doLogin(); });

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  if (!$('ov-session').hidden) { paintSession(); wake(); }
  if (!typingIn($('view'))) render();
  if (cloudReady()) syncNow();
});
window.addEventListener('hashchange', () => {
  const go = () => { readRoute(); courseEdit = null; courseAdding = false; confirmCourse = null; confirmRec = null; render(); window.scrollTo(0, 0); };
  if (document.startViewTransition && !reduced() && !layers.length) document.startViewTransition(go); else go();
});

/* ---------- arranque ---------- */
readRoute();
const pendingShare = readShare();
render();
showCover();
setInterval(() => { if (route === 'hoy' && S.meta.active && $('ov-session').hidden && !typingIn($('view'))) render(); }, 15000);
initCloud();
if (pendingShare) openShare(pendingShare);
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === '127.0.0.1' || location.hostname === 'localhost')) { window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); }); }
try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {}); } catch (e) {}
