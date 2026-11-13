# Atril

App de práctica de piano "sin culpa" de Leo: te dice qué tocar hoy, recuerda dónde vas en cada pieza y en los cursos, guarda los pendientes del grupo y muestra la semana en notación de batería.

- **La app** (este repositorio) se publica con GitHub Pages: https://leoporp.github.io/atril/
- **Los datos** viven en Supabase (el mismo proyecto de Fibra y Trazo), en la tabla `atril_state`. Cada cuenta solo ve lo suyo.
- **Configuración:** `config.js` lleva la dirección del proyecto y la clave pública. Nunca la clave secreta.
- **Base de datos:** `supabase/setup.sql` crea la tabla y las reglas de privacidad.

Los cambios a la app no tocan los datos: una actualización solo reemplaza el código.
