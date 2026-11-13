# Atril: contexto para seguir trabajando

Atril es el cuaderno de piano de Leo (hermana de Fibra `leoporp/fibra` y Trazo `leoporp/trazo`). La usa sobre todo en la **tablet, en horizontal**, junto al piano, y a veces en el celular (Android, Chrome, instalada en la pantalla de inicio). **Leo es el usuario final y el único usuario.**

Dato clave de uso: **mientras toca, en la pantalla de la tablet está la partitura o el vídeo, no Atril.** Atril se abre antes (para decidir y arrancar) y después (para anotar). Todo lo que ayude a ir y volver sin fricción vale.

Este archivo es el traspaso entre chats: léelo antes de tocar algo.

## Cómo trabajar con Leo

- Español, casual y directo. Honesto, sin condescendencia.
- Si no tienes más de 90 % de certeza de lo que quiere, hazle preguntas cerradas antes (con una opción recomendada). No es diseñador: muéstrale opciones visuales y propón.
- Después de cada cambio: `python3 tests/sync_test.py` y `python3 tests/funciones_test.py` (Playwright contra una nube falsa) y, si es visual, `python3 tests/pantallas.py [filtro]` y mirar `tests/shots/pantallas/` (claro y oscuro, tablet y celular). Luego commit con atribución, `git push origin main` y decirle que cierre y abra la app.
- Respuestas finales cortas, en lenguaje de usuario.

## Arquitectura

- Sin build. `index.html` (cáscara + filtros SVG de crayola), `atril.css`, `atril.js` (toda la lógica; el orden de secciones está en su encabezado), `dibujos.js` (garabatos y dibujos del mes). Si cambias alguno, sube el `?v=` en `index.html` y `CACHE` en `sw.js` (y agrégalo a `SHELL` si es nuevo).
- Rutas por hash: `#hoy`, `#repertorio`, `#cursos`, `#diario`. Hojas a pantalla completa: sesión (cronómetro), registro, pieza, grabar, compartir, cuenta.
- Estado `S` en `localStorage` (`atril.v4`, modelo `v:5`): colecciones `sessions`, `pieces`, `courses`, `recs` (cada registro con `u` = hora de su último cambio), `meta{active, settings, group}`, `tomb{…}` (borrados con su hora) y `mu{clave}` (hora de cada `meta`). Escribe solo con `put`, `del`, `setMeta`, `setSetting`. `normalize()` migra lo viejo (v4 guardaba los cursos en `meta.courses`).
- Cursos: los crea Leo. Los dos de fábrica (`piano`, `armonia`) tienen id fijo y `u:0` para que dos aparatos nuevos no los dupliquen; si los borra, la marca en `tomb` evita que renazcan.
- Piezas: `kind` = `mia` | `grupo` | `desafio` (los desafíos de Jaime Altozano son piezas con esa etiqueta), `link` (partitura) y `video`, `track` compás/minuto, `pos`, `todos`, `state`.
- `config.js`: URL y **publishable key** del mismo proyecto Supabase de Fibra y Trazo. Nunca la secret.
- `supabase/setup.sql`: tabla `atril_state` (un JSON por usuario, RLS "solo lo propio") y carpeta privada `atril-audio` para las grabaciones. Idempotente.
- Sincronización (`syncNow`): lee la nube, junta con lo local registro por registro (`mergeStates`: gana el `u` más reciente; un borrado gana en empate) y sube solo si cambió algo (`stable()` compara con llaves ordenadas porque Postgres las reordena). Corre 600 ms después de cada cambio, al volver a la app, al recuperar internet y cada 20 s. Un cronómetro (`meta.active`) empezado en un aparato se ve en el otro.
- Grabaciones: el audio vive en IndexedDB (`atril-audio`/`blobs`) y se sube a Supabase Storage (`<uid>/<id>`); en `S.recs` solo va la ficha (`ref` = pieza, `at`, `dur`, `mime`, `up`, `path`). Si la carpeta no existe o falla, se queda local y reintenta cada 10 min (`recRetryAt`).
- Inicio de sesión: solo "Entrar" con la cuenta de Fibra (sesión en `atril-auth`).
- Botón atrás de Android: cada hoja suma una entrada al historial (`showOv`/`pushLayer`/`popLayer`, `skipPop`). Para pasar de una hoja a otra usa `takeLayer` + `reuse`, nunca cerrar y abrir seguido (`history.back()` es asíncrono y la app se salía). `afterPops` espera antes de cambiar de sección.
- Enlaces de fuera (`extHref`): Leo los quiere en **Chrome de verdad**, no en la pestaña interna de la app instalada. En Android instalada se arma un `intent://…;package=com.android.chrome;S.browser_fallback_url=…`. No se pudo probar en un aparato real: si reporta que siguen abriendo "dentro", revisar esto.
- Compartir → Atril (`share_target` del manifest, GET): la app abre con `?url=&text=&title=`, `readShare()` saca el enlace y `openShare` pregunta en qué curso o pieza guardarlo. Solo existe en la app instalada, y Chrome tarda hasta un día en actualizar una instalación vieja.
- Aviso de sesión en curso: notificación desde el service worker (`sessionNote`/`clearNote`, `notificationclick` en `sw.js`). El navegador de pruebas no deja mostrar notificaciones reales; la prueba simula el permiso.
- `sw.js`: network-first, sirve sin internet. Hosting: GitHub Pages desde `main` del repo público `leoporp/atril` → https://leoporp.github.io/atril/. No metas datos personales en el código (el nombre de la portada se guarda en sus datos, no aquí).

## Decisiones ya tomadas

- **Diseño: cuaderno a mano, juguetón, "más cuaderno"** (elegido por Leo, nov 2026). Papel con grano y línea roja de margen; letra a mano (Caveat) solo para acentos, nunca para párrafos; cinta, post-its, círculos de lápiz; **garabatos a crayola** (`GARABATOS`, filtros `#crayon` y `#crayon-line`) junto a títulos y al final de Hoy; **portada** de cartón que se abre sola al entrar (la primera vez pregunta de quién es el cuaderno; no sale si hay sesión en curso). En tablet la navegación son **pestañas de cuaderno** a la izquierda; en celular, barra abajo.
- Antes rechazó: texturas de madera/papel pegadas encima (demasiado), el diseño plano y limpio ("le falta textura"), y tres direcciones sin textura (oscura tipo Spotify, tipográfica, bloques de color). No volver ahí. Tampoco quiso sellos por hitos ni vibración.
- Claro u oscuro según el sistema; oscuro = "cuaderno de noche".
- **Hoy:** una sola sugerencia ("hoy te toca…"), lo más olvidado primero; lo pendiente del grupo va adelante si el encuentro con Santi y Juanma es en ≤7 días; lo que "ya sale" vuelve de **repaso** a los 21 días sin tocarse. Botones: "¡Me senté a tocar!", "…y abrir partitura/vídeo" (arranca y abre el enlace), "solo 2 minutos" (compromiso mínimo: barrita hasta 2:00 y después "lo que siga es regalo"), "Otra idea".
- **Dibujo del mes:** un dibujo a lápiz por mes (`DIBUJOS`, rota) que se pinta a crayola, un pedacito por sesión; nunca se despinta; al completarse, las sesiones extra son estrellas. Está en Hoy y, grande, en Diario.
- **Diario** (antes "Semana"): mes de un vistazo (calendario con los días tocados pintados, tiempo por pieza), grabaciones, registros por semana (tocar uno lo corrige; la ✕ lo borra con "Deshacer"), rato diario, cuenta. Solo muestra lo que sí tocó: nada de rachas ni "te faltó".
- **Grabarse 30 s:** desde la ficha de una pieza, o Atril lo ofrece en Hoy tras tocar una pieza que lleva 30 días (o nunca) sin grabación.
- Cronómetro olvidado: si marca más de 90 min, antes de guardar pregunta y deja ajustar.
- Sin metrónomo (su piano tiene). Se puede registrar sin cronómetro.
- Ideas que no quiso por ahora: Copiar para Claude, mandar pendientes al grupo por WhatsApp, lista de vídeos de cada curso (le da pereza armarla), tarea chiquita en vez de pieza, "la próxima empiezo por…", arranque por NFC, dado de juegos, recordatorio diario.

## Historia

- El `id` del manifest es `atril-app` (no `./`). En el celular de Leo la instalación quedó trabada desde el primer intento (hecho desde un navegador interno): Chrome dice "ya está instalada" pero no abre, ni siquiera el acceso directo, mientras Fibra y Trazo sí abren. Cambiar el id y la dirección del manifest no lo arregló. Hipótesis sin confirmar: quedó un paquete a medias que reclama `leoporp.github.io/atril/`; la salida propuesta es publicar en otra dirección (renombrar el repo). En la tablet instaló bien.
- Antes vivía como página de claude.ai (vacía al migrar, nov 2026). Se pasó a GitHub Pages + Supabase como Fibra y Trazo.
