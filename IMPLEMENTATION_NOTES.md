# New Monday — implementación 2026-08-24

Esta rama reconstruye la estructura correcta de la aplicación y prepara la versión funcional de New Monday sin modificar todavía `main`.

## Incluido

- Estructura `models/`, `routes/` y `public/` restaurada.
- Datos seed completos de GY_GUAYOTA.
- Tabla principal editable.
- Estados editables.
- Fechas editables con `input[type=date]`.
- Dependencias editables mediante selector de elementos del tablero.
- Columnas Fórmula, Reloj mundial y Solape Weeks visibles.
- Reloj mundial basado en la zona horaria del miembro asignado.
- Cronograma interactivo: mover barras y redimensionar inicio/fin.
- Vista de equipo editable.
- Búsqueda por tablero y por contenido.
- Estética clara inspirada en Monday.com, con grupos coloreados y avatares.
- Endpoint `/api/health` para comprobar conexión a MongoDB.

## Validación realizada

Se ha comprobado la sintaxis JavaScript con `node --check` en servidor, modelos, rutas, seed y frontend.

## Bloqueo de publicación

El último despliegue de Render registra `MongoServerError: bad auth : authentication failed`. Antes de fusionar esta rama a `main`, hay que corregir `MONGODB_URI` en el servicio `New-monday` de Render con una cadena válida del MongoDB Atlas asociado a la cuenta de producción.
