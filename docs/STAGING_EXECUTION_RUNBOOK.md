# New Monday — ejecución STAGING aislada

## Regla absoluta

**Monday se consulta exclusivamente en modo lectura. Nunca se ejecutan mutaciones.**

La ejecución STAGING escribe únicamente en una base MongoDB aislada cuyo nombre debe contener `staging`, `test` o `sandbox`. El script se bloquea si detecta que la URI apunta a la misma base que producción.

## Secretos necesarios

Configurar fuera del repositorio y sin pegarlos en issues, commits o documentación:

- `MONGODB_STAGING_URI`: conexión a una base aislada, por ejemplo una base cuyo nombre sea `new-monday-staging`.
- `MONDAY_API_TOKEN`: token usado únicamente por `services/mondayReadOnlyClient.js`. Ese cliente rechaza cualquier documento GraphQL que contenga `mutation` antes de enviarlo.
- `MONGODB_URI` (recomendado en el entorno de ejecución): URI de producción solo para que el guard pueda comparar destinos y bloquear una coincidencia accidental. El script no escribe en esa URI.

## Línea base obligatoria

La importación solo se considera válida si reproduce simultáneamente:

- 17 workspaces efectivos.
- 103 tableros totales.
- 55 tableros visibles/operativos.
- 48 tableros internos de subitems.
- 1.230 items de primer nivel.
- 413 subitems.
- fingerprints de esquema correctos para todos los tableros.
- fingerprints de datos correctos para los 55 tableros visibles.
- 0 escrituras en Monday.
- 0 escrituras en la base de producción.

Los 17 workspaces incluyen 11 devueltos por la consulta normal de workspaces y 6 workspaces técnicos descubiertos desde referencias de tableros accesibles.

## Comando

```bash
npm run staging:isolated
```

El comando termina con código distinto de cero si falla la auditoría, cambia la línea base o se incumple una protección de aislamiento.

## Qué NO hace

- No promociona STAGING a los modelos principales de New Monday.
- No modifica `main`.
- No despliega Render.
- No ejecuta `/api/seed`.
- No crea, cambia, archiva ni borra nada en Monday.

## Paso posterior si STAGING queda verde

1. Conservar el run y su auditoría.
2. Ejecutar preview de promoción, sin aplicar.
3. Probar exportación Excel sobre la base aislada.
4. Modificar una copia controlada del Excel.
5. Ejecutar recuperación `preview` y comprobar conflictos.
6. Aplicar recuperación únicamente en la base de prueba.
7. Comparar datos y fórmulas después de la recuperación.
8. Solo después valorar la promoción de la PR #2 a `main`, con autorización explícita.
