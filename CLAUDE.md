# Atril: contexto para seguir trabajando

Atril es la app de práctica de piano de Leo (hermana de Fibra `leoporp/fibra` y Trazo `leoporp/trazo`). La usa sobre todo en la **tablet** junto al piano y a veces en el celular (Android, Chrome, instalada en la pantalla de inicio). **Leo es el usuario final y el único usuario.**

Este archivo es el traspaso entre chats: léelo antes de tocar algo.

## Cómo trabajar con Leo

- Español, casual y directo. Honesto, sin condescendencia.
- Si no tienes más de 90 % de certeza de lo que quiere, hazle preguntas cerradas antes (con una opción recomendada).
- Después de cada cambio: `python3 tests/sync_test.py` (Playwright; dos aparatos contra una nube falsa) y mirar `tests/shots/` (tablet clara, celular oscuro). Luego commit con atribución, `git push origin main` y decirle que cierre y abra la app.
- Respuestas finales cortas, en lenguaje de usuario.

## Arquitectura

- `index.html`: toda la app (HTML, CSS y JS vanilla, sin build). Rutas por hash: `#hoy`, `#repertorio`, `#cursos`, `#semana`. Hojas a pantalla completa: sesión (cronómetro), registro corto, pieza, cuenta.
- Estado `S` en `localStorage` (`atril.v4`): `sessions{id}`, `pieces{id}`, `meta{courses, active, settings, group}`, más `tomb{sessions, pieces}` (borrados con su hora) y `mu{clave}` (hora de cambio de cada `meta`). Cada registro lleva `u` = hora de su último cambio. Escribe solo con `put`, `del` y `setMeta`.
- `config.js`: URL y **publishable key** del mismo proyecto Supabase de Fibra y Trazo. Nunca la secret.
- `supabase/setup.sql`: tabla `atril_state` (un JSON por usuario, RLS "solo lo propio"). Idempotente.
- Sincronización (`syncNow`): lee la nube, junta con lo local registro por registro con `mergeStates` (gana el `u` más reciente; un borrado gana en empate) y sube solo si cambió algo (`stable()` compara con llaves ordenadas porque Postgres las reordena). Corre 600 ms después de cada cambio, al volver a la app, al recuperar internet y cada 20 s con la app visible. Así la tablet y el celular no se pisan, y un cronómetro (`meta.active`) empezado en uno se ve en el otro.
- Inicio de sesión: solo "Entrar" con la cuenta de Fibra (sesión de Supabase en `atril-auth`; Fibra y Trazo usan otras claves en el mismo origen `leoporp.github.io`).
- Botón atrás de Android: cada hoja suma una entrada al historial (`pushLayer`/`popLayer`, `skipPop`). Para pasar de una hoja a otra (cronómetro → registro, pieza → cronómetro) usa `takeLayer` + `reuse`, nunca cerrar y abrir seguido: `history.back()` es asíncrono y se desfasaba (la app podía salirse). `afterPops` espera a que terminen los `back()` antes de cambiar de sección.
- Fuentes locales en `fonts/` (Newsreader e Instrument Sans, OFL). `sw.js`: network-first, sirve sin internet; si cambias `SHELL`, sube `CACHE`.
- Hosting: GitHub Pages desde `main` del repo público `leoporp/atril` → https://leoporp.github.io/atril/. No metas datos personales en el código.

## Decisiones ya tomadas

- Diseño: crema y madera, acento verde monstera, sin texturas; claro u oscuro según el sistema. En tablet (≥840 px) Hoy va en dos columnas.
- "Hoy te toca": una sola sugerencia, lo más olvidado primero; si el encuentro con Santi y Juanma es en los próximos 7 días, primero lo pendiente del grupo. "Otra idea" pasa a la siguiente.
- Piezas: se siguen por compás (partitura) o minuto (vídeo/canción); pendientes por pieza; estados Aprendiendo / Puliendo / Ya me sale. Cursos de Jaime Altozano (piano y armonía): solo vídeo en el que va y canción.
- Semana: solo lo que sí tocó (silencios en días pasados sin práctica, nada en los futuros); intención diaria, sin "te faltó".
- Sin metrónomo (su piano tiene). Se puede registrar sin cronómetro.

## Historia

- Antes vivía como página de claude.ai con la base de datos de esa página (vacía al migrar, nov 2026). Se pasó a GitHub Pages + Supabase como Fibra y Trazo para instalarla en la tablet.
