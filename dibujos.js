'use strict';
/* Dibujos a crayola de Atril.
   - GARABATOS: adornos sueltos para márgenes y portada.
   - DIBUJOS: el "dibujo del mes". Cada uno es una lista de pedacitos (regs) que se van pintando,
     uno por sesión, en el orden de la lista. `z` decide qué queda encima al dibujar. Nunca se despinta.
   Todo usa los filtros #crayon y #crayon-line definidos en index.html. */
const CRAYON = { rojo: '#E4572E', naranja: '#F29E4C', amarillo: '#F2C14E', lima: '#8CC152', verde: '#4FA35B', hoja: '#2F8F5B',
  cielo: '#7CC4E8', azul: '#4A90D9', morado: '#8E6BBF', rosa: '#E889A8', cafe: '#B07A4B', tierra: '#D9753F', gris: '#8E8A93', uva: '#5B4A86' };
const CRAYONS = [CRAYON.rojo, CRAYON.naranja, CRAYON.amarillo, CRAYON.verde, CRAYON.cielo, CRAYON.azul, CRAYON.morado, CRAYON.rosa];

const circ = (cx, cy, r) => 'M' + (cx - r) + ' ' + cy + ' a' + r + ' ' + r + ' 0 1 0 ' + (2 * r) + ' 0 a' + r + ' ' + r + ' 0 1 0 ' + (-2 * r) + ' 0 Z';
const elip = (cx, cy, rx, ry) => 'M' + (cx - rx) + ' ' + cy + ' a' + rx + ' ' + ry + ' 0 1 0 ' + (2 * rx) + ' 0 a' + rx + ' ' + ry + ' 0 1 0 ' + (-2 * rx) + ' 0 Z';
function estrella(cx, cy, R) {
  let d = '';
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? R * .45 : R; d += (i ? 'L' : 'M') + (cx + r * Math.cos(a)).toFixed(1) + ' ' + (cy + r * Math.sin(a)).toFixed(1) + ' '; }
  return d + 'Z';
}
const anillo = (cx, cy, R, r) => circ(cx, cy, R) + ' ' + circ(cx, cy, r);
const banda = (cx, cy, R, r) => 'M' + (cx - R) + ' ' + cy + ' A' + R + ' ' + R + ' 0 0 1 ' + (cx + R) + ' ' + cy + ' L' + (cx + r) + ' ' + cy + ' A' + r + ' ' + r + ' 0 0 0 ' + (cx - r) + ' ' + cy + ' Z';
const nube = (x, y) => 'M' + (x - 26) + ' ' + (y + 10) + ' C' + (x - 42) + ' ' + (y + 10) + ' ' + (x - 40) + ' ' + (y - 10) + ' ' + (x - 24) + ' ' + (y - 10)
  + ' C' + (x - 22) + ' ' + (y - 27) + ' ' + (x + 2) + ' ' + (y - 29) + ' ' + (x + 7) + ' ' + (y - 14) + ' C' + (x + 21) + ' ' + (y - 22) + ' ' + (x + 36) + ' ' + (y - 8) + ' ' + (x + 27) + ' ' + (y + 10) + ' Z';
const cabeza = (x, y) => ({ d: elip(x, y, 6.5, 4.8), t: 'rotate(-20 ' + x + ' ' + y + ')' });
const plica = (x, y, h) => 'M' + (x + 6) + ' ' + (y - 1) + ' L' + (x + 6.5) + ' ' + (y - (h || 24));
const corchete = (x, y, h) => plica(x, y, h) + ' c3 7 11 8 7 19';

const HOJA = 'M0 -8 C-8 2 -30 0 -34 -22 C-37 -42 -18 -58 0 -66 C18 -58 37 -42 34 -22 C30 0 8 2 0 -8 Z';
const VENAS = 'M0 -8 L0 -60 M-33 -24 L-17 -25 M-29 -41 L-13 -38 M33 -24 L17 -25 M29 -41 L13 -38';

function teclado() {
  const regs = [], cols = [CRAYON.rojo, CRAYON.naranja, CRAYON.amarillo, CRAYON.lima, CRAYON.verde, CRAYON.cielo, CRAYON.azul, CRAYON.morado, CRAYON.rosa, CRAYON.rojo];
  const negras = [1, 2, 4, 5, 6, 8, 9];
  for (let i = 0; i < 10; i++) {
    const x = 20 + i * 20;
    regs.push({ d: 'M' + (x + .8) + ' 81 L' + (x + 19.4) + ' 80 L' + (x + 19.8) + ' 169 L' + (x + .4) + ' 170 Z', c: cols[i], z: 0 });
    if (negras.includes(i + 1)) { const b = x + 20; regs.push({ d: 'M' + (b - 6) + ' 80.5 L' + (b + 6) + ' 80 L' + (b + 6.4) + ' 134 L' + (b - 6.3) + ' 135 Z', c: CRAYON.uva, z: 1 }); }
  }
  const n1 = cabeza(52, 52), n2 = cabeza(118, 40), n3 = cabeza(184, 54);
  regs.push(Object.assign({ c: CRAYON.rojo, z: 2 }, n1), Object.assign({ c: CRAYON.azul, z: 2 }, n2), Object.assign({ c: CRAYON.verde, z: 2 }, n3));
  return { nombre: 'un teclado de colores', regs, lineas: [plica(52, 52), corchete(118, 40), plica(184, 54), 'M14 76 L226 75', 'M14 174 L226 175'] };
}
function monstera() {
  const hojas = [['translate(120 78)', CRAYON.hoja], ['translate(84 102) rotate(-38) scale(.9)', CRAYON.verde], ['translate(156 102) rotate(38) scale(.9)', CRAYON.lima],
    ['translate(64 134) rotate(-74) scale(.74)', CRAYON.verde], ['translate(176 134) rotate(74) scale(.74)', CRAYON.hoja]];
  const regs = [{ d: 'M91 152 L149 152 L143 190 L97 190 Z', c: CRAYON.tierra, z: 1 }, { d: 'M84 139 L156 138 L154 153 L86 153 Z', c: CRAYON.rojo, z: 2 }];
  hojas.forEach(([t, c]) => regs.push({ d: HOJA, t, c, z: 0, extra: VENAS }));
  regs.push({ d: circ(36, 36, 15), c: CRAYON.amarillo, z: 0 }, { d: 'M38 190 L202 190 L208 198 L32 198 Z', c: CRAYON.cafe, z: 0 });
  const n1 = cabeza(196, 44), n2 = cabeza(216, 70);
  regs.push(Object.assign({ c: CRAYON.morado, z: 2 }, n1), Object.assign({ c: CRAYON.rosa, z: 2 }, n2));
  return { nombre: 'una monstera', regs, lineas: ['M120 139 L120 72', 'M118 139 C110 124 96 112 86 100', 'M122 139 C130 124 144 112 154 100', 'M116 140 C100 138 82 136 68 133', 'M124 140 C140 138 158 136 172 133',
    'M36 12 L36 4 M14 36 L6 36 M58 36 L66 36 M20 20 L14 14 M52 20 L58 14 M20 52 L14 58 M52 52 L58 58', corchete(196, 44, 22), plica(216, 70, 22)] };
}
function arcoiris() {
  const R = [100, 88, 76, 64, 52, 40, 28], cols = [CRAYON.rojo, CRAYON.naranja, CRAYON.amarillo, CRAYON.verde, CRAYON.azul, CRAYON.morado];
  const regs = cols.map((c, i) => ({ d: banda(120, 158, R[i], R[i + 1]), c, z: 0 }));
  regs.push({ d: nube(40, 164), c: CRAYON.cielo, z: 1 }, { d: nube(196, 164), c: CRAYON.cielo, z: 1 });
  const n1 = cabeza(34, 60), n2 = cabeza(200, 48);
  regs.push(Object.assign({ c: CRAYON.rosa, z: 2 }, n1), Object.assign({ c: CRAYON.verde, z: 2 }, n2));
  regs.push({ d: estrella(120, 24, 13), c: CRAYON.amarillo, z: 2 }, { d: estrella(76, 34, 8), c: CRAYON.naranja, z: 2 }, { d: estrella(164, 30, 8), c: CRAYON.rosa, z: 2 });
  return { nombre: 'un arcoíris', regs, lineas: [corchete(34, 60), plica(200, 48)] };
}
function tocadiscos() {
  const cx = 104, cy = 122;
  const regs = [{ d: anillo(cx, cy, 52, 41), c: CRAYON.morado, z: 1, eo: 1 }, { d: anillo(cx, cy, 41, 30), c: CRAYON.azul, z: 1, eo: 1 }, { d: anillo(cx, cy, 30, 20), c: CRAYON.verde, z: 1, eo: 1 },
    { d: anillo(cx, cy, 20, 11), c: CRAYON.amarillo, z: 1, eo: 1 }, { d: circ(cx, cy, 11), c: CRAYON.rojo, z: 1 },
    { d: 'M172 80 L181 83 L150 134 L141 129 Z', c: CRAYON.gris, z: 3 }, { d: circ(180, 78, 10), c: CRAYON.naranja, z: 3 },
    { d: circ(186, 164, 7), c: CRAYON.rosa, z: 2 }, { d: circ(166, 164, 7), c: CRAYON.cielo, z: 2 }];
  const n1 = cabeza(52, 34), n2 = cabeza(112, 22), n3 = cabeza(176, 36);
  regs.push(Object.assign({ c: CRAYON.rojo, z: 2 }, n1), Object.assign({ c: CRAYON.azul, z: 2 }, n2), Object.assign({ c: CRAYON.verde, z: 2 }, n3));
  regs.push({ d: 'M30 62 L210 60 L212 182 L28 184 Z', c: CRAYON.cafe, z: 0 });
  return { nombre: 'un tocadiscos', regs, lineas: [corchete(52, 34, 22), plica(112, 22, 18), corchete(176, 36, 22), circ(cx, cy, 2)] };
}
const DIBUJOS = [teclado(), monstera(), arcoiris(), tocadiscos()];
const dibujoDe = (ym) => { const [y, m] = ym.split('-').map(Number); return DIBUJOS[(y * 12 + (m - 1)) % DIBUJOS.length]; };
/* Estrellitas de regalo cuando ya está todo pintado y sigues tocando */
const EXTRAS = [[18, 14], [224, 16], [14, 108], [228, 112], [22, 188], [222, 190], [70, 10], [170, 10], [120, 6], [8, 60], [232, 62], [120, 194]];

function dibujoSVG(dib, n, cls) {
  const orden = dib.regs.map((r, i) => Object.assign({ i }, r)).sort((a, b) => (a.z - b.z) || (a.i - b.i));
  const tr = (r) => (r.t ? ' transform="' + r.t + '"' : '');
  let body = '';
  const pen = ' fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" opacity=".82"';
  for (const r of orden) {
    if (r.i < n) body += '<path d="' + r.d + '"' + tr(r) + ' fill="' + r.c + '"' + (r.eo ? ' fill-rule="evenodd"' : '') + ' filter="url(#crayon)"/>';
    else if (r.z > 0) body += '<path d="' + r.d + '"' + tr(r) + ' fill="var(--dib-bg, var(--bg))"' + (r.eo ? ' fill-rule="evenodd"' : '') + '/>'; /* lo de encima tapa lo de abajo aunque no esté pintado */
    body += '<path d="' + r.d + (r.extra ? ' ' + r.extra : '') + '"' + tr(r) + pen + '/>';
  }
  const extra = Math.max(0, n - dib.regs.length);
  for (let k = 0; k < Math.min(extra, EXTRAS.length); k++) body += '<path d="' + estrella(EXTRAS[k][0], EXTRAS[k][1], 7) + '" fill="' + CRAYONS[(k * 3) % CRAYONS.length] + '" filter="url(#crayon)"/>';
  for (const d of dib.lineas || []) body += '<path d="' + d + '"' + pen + '/>';
  return '<svg class="' + (cls || 'dibujo') + '" viewBox="0 0 240 200" aria-hidden="true">' + body + '</svg>';
}

/* ---------- garabatos sueltos ---------- */
const gb = (vb, body, cls, attrs) => '<svg class="gb ' + (cls || '') + '" viewBox="' + vb + '" aria-hidden="true"' + (attrs || '') + '><g filter="url(#crayon-line)" fill="none" stroke-linecap="round" stroke-linejoin="round">' + body + '</g></svg>';
const GARABATOS = {
  sol: (c) => gb('0 0 80 80', '<circle cx="40" cy="40" r="15" fill="' + (c || CRAYON.amarillo) + '" stroke="' + (c || CRAYON.amarillo) + '" stroke-width="3"/><path d="M40 8v10M40 62v10M8 40h10M62 40h10M17 17l7 7M56 56l7 7M63 17l-7 7M24 56l-7 7" stroke="' + CRAYON.naranja + '" stroke-width="4"/>', 'g-sol'),
  estrella: (c) => gb('0 0 60 60', '<path d="' + estrella(30, 31, 22) + '" fill="' + (c || CRAYON.naranja) + '" stroke="' + (c || CRAYON.naranja) + '" stroke-width="3"/>', 'g-estrella'),
  notas: (c) => gb('0 0 90 80', '<path d="M24 60V18l40-8v42" stroke="' + (c || CRAYON.morado) + '" stroke-width="5"/><ellipse cx="15" cy="61" rx="10" ry="7.5" fill="' + (c || CRAYON.morado) + '" stroke="' + (c || CRAYON.morado) + '" stroke-width="2"/><ellipse cx="55" cy="53" rx="10" ry="7.5" fill="' + (c || CRAYON.morado) + '" stroke="' + (c || CRAYON.morado) + '" stroke-width="2"/>', 'g-notas'),
  nota: (c) => gb('0 0 50 80', '<path d="M30 58V12c4 12 18 12 10 30" stroke="' + (c || CRAYON.azul) + '" stroke-width="5"/><ellipse cx="20" cy="60" rx="11" ry="8" fill="' + (c || CRAYON.azul) + '" stroke="' + (c || CRAYON.azul) + '" stroke-width="2"/>', 'g-nota'),
  espiral: (c) => gb('0 0 70 70', '<path d="M35 35c0-6 9-6 9 1 0 10-16 10-17-1-1-15 24-17 26 0 2 20-32 22-35 1" stroke="' + (c || CRAYON.rojo) + '" stroke-width="4.5"/>', 'g-espiral'),
  zigzag: (c) => gb('0 0 140 30', '<path d="M6 20l16-12 16 12 16-12 16 12 16-12 16 12 16-12 16 12" stroke="' + (c || CRAYON.cielo) + '" stroke-width="5"/>', 'g-zigzag'),
  onda: (c) => gb('0 0 160 24', '<path d="M4 14c12-12 24 12 38 0s24 12 38 0 24 12 38 0 24 10 36 0" stroke="' + (c || CRAYON.amarillo) + '" stroke-width="7" vector-effect="non-scaling-stroke"/>', 'g-onda', ' preserveAspectRatio="none"'),
  hoja: (c) => gb('0 0 80 84', '<g transform="translate(40 78)"><path d="' + HOJA + '" fill="' + (c || CRAYON.verde) + '" stroke="' + (c || CRAYON.verde) + '" stroke-width="3"/><path d="' + VENAS + '" stroke="' + CRAYON.hoja + '" stroke-width="2.5"/></g>', 'g-hoja'),
  corazon: (c) => gb('0 0 60 56', '<path d="M30 48C8 32 6 12 18 9c7-2 11 4 12 8 1-4 5-10 12-8 12 3 10 23-12 39z" fill="' + (c || CRAYON.rosa) + '" stroke="' + (c || CRAYON.rosa) + '" stroke-width="3"/>', 'g-corazon'),
  flecha: (c) => gb('0 0 90 50', '<path d="M6 12c22 26 46 28 72 14M64 14l15 12-17 8" stroke="' + (c || CRAYON.rojo) + '" stroke-width="4.5"/>', 'g-flecha')
};
