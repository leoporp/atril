# Atril: contexto para seguir trabajando

Atril es la app de práctica de piano de Leo (hermana de Fibra `leoporp/fibra` y Trazo `leoporp/trazo`). La usa sobre todo en la **tablet** junto al piano y a veces en el celular (Android, Chrome, instalada en la pantalla de inicio). **Leo es el usuario final y el único usuario.**

Este archivo es el traspaso entre chats: léelo antes de tocar algo.

## Cómo trabajar con Leo

- Español, casual y directo. Honesto, sin condescendencia.
- Si no tienes más de 90 % de certeza de lo que quiere, hazle preguntas cerradas antes (con una opción recomendada).
- Después de cada cambio: `python3 tests/sync_test.py` (Playwright; dos aparatos contra una nube falsa) y, si es visual, `python3 tests/pantallas.py` y mirar `tests/shots/pantallas/` (todas las pantallas, claro y oscuro, tablet y celular). Luego commit con atribución, `git push origin main` y decirle que cierre y abra la app.
- Respuestas finales cortas, en lenguaje de usuario.

## Arquitectura

- `index.html`: toda la app (HTML, CSS y JS vanilla, sin build). Rutas por hash: `#hoy`, `#repertorio`, `#cursos`, `#semana`. Hojas a pantalla completa: sesión (cronómetro), registro corto, pieza, cuenta.
- Estado `S` en `localStorage` (`atril.v4`): `sessions{id}`, `pieces{id}`, `meta{courses, active, settings, group}`, más `tomb{sessions, pieces}` (borrados con su hora) y `mu{clave}` (hora de cambio de cada `meta`). Cada registro lleva `u` = hora de su último cambio. Escribe solo con `put`, `del` y `setMeta`.
- `config.js`: URL y **publishable key** del mismo proyecto Supabase de Fibra y Trazo. Nunca la secret.
- `supabase/setup.sql`: tabla `atril_state` (un JSON por usuario, RLS "solo lo propio"). Idempotente.
- Sincronización (`syncNow`): lee la nube, junta con lo local registro por registro con `mergeStates` (gana el `u` más reciente; un borrado gana en empate) y sube solo si cambió algo (`stable()` compara con llaves ordenadas porque Postgres las reordena). Corre 600 ms después de cada cambio, al volver a la app, al recuperar internet y cada 20 s con la app visible. Así la tablet y el celular no se pisan, y un cronómetro (`meta.active`) empezado en uno se ve en el otro.
- Inicio de sesión: solo "Entrar" con la cuenta de Fibra (sesión de Supabase en `atril-auth`; Fibra y Trazo usan otras claves en el mismo origen `leoporp.github.io`).
- Botón atrás de Android: cada hoja suma una entrada al historial (`pushLayer`/`popLayer`, `skipPop`). Para pasar de una hoja a otra (cronómetro → registro, pieza → cronómetro) usa `takeLayer` + `reuse`, nunca cerrar y abrir seguido: `history.back()` es asíncrono y se desfasaba (la app podía salirse). `afterPops` espera a que terminen los `back()` antes de cambiar de sección.
- Fuentes locales en `fonts/` (Fraunces 600 para títulos, Nunito Sans para leer, Caveat para la letra a mano; OFL). Grano del papel: `img/grain-light.png` y `img/grain-dark.png` (PNG, no filtros SVG: más liviano en la tablet). `sw.js`: network-first, sirve sin internet; si cambias `SHELL`, sube `CACHE`.
- Hosting: GitHub Pages desde `main` del repo público `leoporp/atril` → https://leoporp.github.io/atril/. No metas datos personales en el código.

## Decisiones ya tomadas

- Diseño (nov 2026, elegido por Leo en el lienzo de claude.ai "Atril — nuevas direcciones de diseño"): **cuaderno a mano, juguetón**. Papel con grano y línea roja de margen, letra a mano (Caveat) solo para acentos (títulos de sección, posiciones, notas, botones grandes), nunca para párrafos. Hoja "hoy te toca…" con cinta, la cifra de dónde vas encerrada en un círculo de lápiz, pendiente como post-it, lista "En tu atril" en renglones de cuaderno con color por tipo (grupo terracota, mía ciruela, curso verde), grupo como post-it. Al guardar: toast en post-it + notitas que suben (`celebrate`; respeta "reducir movimiento").
- Antes le habían sobrado las texturas pegadas encima (madera y papel en todo); lo que quería era textura de *cuaderno* (anotaciones, cinta, post-its), no ruido. No volver a meter vetas de madera.
- Claro u oscuro según el sistema; oscuro = "cuaderno de noche" (papel café oscuro, lápiz claro, mismos colores más suaves). En tablet (≥840 px) Hoy va en dos columnas: hoja de hoy a la izquierda; semana, atril y grupo a la derecha (la semana arriba para que se vea sin bajar).
- Semana: notación musical dibujada a mano (pentagrama ondulado, figuras decorativas, silencios en días pasados sin práctica, círculo punteado "hoy"), los minutos escritos a mano debajo.
- "Hoy te toca": una sola sugerencia, lo más olvidado primero; si el encuentro con Santi y Juanma es en los próximos 7 días, primero lo pendiente del grupo. "Otra idea" pasa a la siguiente.
- Piezas: se siguen por compás (partitura) o minuto (vídeo/canción); pendientes por pieza; estados Aprendiendo / Puliendo / Ya me sale. Cursos de Jaime Altozano (piano y armonía): solo vídeo en el que va y canción.
- Semana: solo lo que sí tocó (silencios en días pasados sin práctica, nada en los futuros); intención diaria, sin "te faltó".
- Sin metrónomo (su piano tiene). Se puede registrar sin cronómetro.

## Historia

- El `id` del manifest es `atril-app` (no `./`): el primer intento de instalar en el celular desde un navegador interno (enlace abierto dentro de otra app) dejó a Chrome creyendo que ya estaba instalada. No lo cambies sin motivo: cada cambio hace que Chrome la vea como otra app. Instalar siempre desde la app de Chrome, no desde enlaces dentro de otras apps.

- Antes vivía como página de claude.ai con la base de datos de esa página (vacía al migrar, nov 2026). Se pasó a GitHub Pages + Supabase como Fibra y Trazo para instalarla en la tablet.
