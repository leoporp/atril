# Atril

Cuaderno de piano "sin culpa" de Leo: te dice qué tocar hoy, recuerda dónde vas en cada pieza, curso y desafío, guarda los pendientes del grupo, pinta a crayola el dibujo del mes con cada sesión y deja grabarte 30 segundos para oír después cuánto avanzas.

- **La app** (este repositorio) se publica con GitHub Pages: https://leoporp.github.io/atril/
- **Los datos** viven en Supabase (el mismo proyecto de Fibra y Trazo): la tabla `atril_state` y la carpeta privada `atril-audio`. Cada cuenta solo ve lo suyo.
- **Configuración:** `config.js` lleva la dirección del proyecto y la clave pública. Nunca la clave secreta.
- **Base de datos:** `supabase/setup.sql` crea la tabla, la carpeta de audios y las reglas de privacidad.

Los cambios a la app no tocan los datos: una actualización solo reemplaza el código.
