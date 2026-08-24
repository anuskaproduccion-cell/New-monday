# New Monday — arquitectura de migración y recuperación

## Regla absoluta

**Monday original es solo una fuente de consulta. Nunca se modifica.**

Toda lectura de Monday pasa por el cliente `mondayReadOnlyClient`, que rechaza cualquier documento GraphQL que contenga `mutation`.

## Flujo de migración

1. Monday se consulta en modo lectura.
2. Se copia todo a colecciones STAGING aisladas dentro de MongoDB de New Monday.
3. Se auditan conteos y fingerprints de esquema/datos.
4. Solo un run `completed` con `audit.ok === true` puede llegar al preview de promoción.
5. La promoción requiere un texto de confirmación específico del run.
6. La promoción escribe únicamente en las colecciones de producción de New Monday.
7. La promoción no borra registros locales. Si un `mondayId` ya pertenece a un registro `local`, se considera conflicto y se bloquea.
8. Monday no recibe ninguna operación durante staging, auditoría ni promoción.

## Excel de emergencia

El endpoint `/api/backups/excel` genera un `.xlsx` operativo desde la base de datos de New Monday.

El libro incluye:
- `_README` con instrucciones de emergencia;
- `_MANIFEST` técnico oculto con versión de esquema y fecha de generación;
- `_WORKSPACES`;
- `_BOARDS`, incluyendo la correspondencia exacta entre tablero y hoja Excel;
- una hoja por tablero visible;
- IDs técnicos ocultos para reconciliación;
- línea base JSON oculta por item, con `updatedAt`, valores dinámicos, grupo y padre;
- columnas visibles con los nombres del tablero;
- validaciones de lista para Status, Dropdown, Grupo, Tipo y Acción cuando la configuración lo permite;
- subitems identificados y vinculados con su padre.

La primera fila de cada hoja de tablero contiene claves técnicas estables y permanece oculta. La segunda fila contiene los encabezados visibles para trabajar normalmente.

### Qué se puede hacer durante una caída

- editar nombres, grupos y columnas escalares soportadas;
- cambiar Status, People, Timeline, Date, World Clock, Dropdown, Email, Link, Numbers y Text;
- crear elementos nuevos dentro de grupos existentes;
- crear subelementos nuevos indicando el nombre exacto del elemento padre;
- marcar elementos para `ARCHIVAR` o `PAPELERA`.

Eliminar una fila del Excel no borra nada en New Monday. Para evitar pérdidas accidentales, las bajas solo se procesan mediante la columna visible `Acción`.

Formula, Mirror, File, Dependency y Board Relation se conservan en el backup, pero actualmente se consideran de solo lectura durante la reconciliación manual del Excel. Si se editan, el preview bloquea la recuperación de esa fila y muestra el conflicto.

## Recuperación desde Excel

La recuperación nunca aplica un archivo directamente.

1. El usuario selecciona el `.xlsx` desde `Recuperar Excel`.
2. `/api/backups/excel/recovery/preview` carga el libro y calcula las diferencias sin cambiar datos.
3. Se valida la versión del backup y la presencia de columnas técnicas.
4. Se compara cada item editado con la línea base del momento en que se generó el Excel.
5. Si el item o el tablero cambió en New Monday después del backup, se genera un conflicto de concurrencia y no se sobrescribe automáticamente.
6. Los nuevos elementos se validan contra grupos existentes; los nuevos subelementos deben tener un padre identificable de forma única.
7. El preview se guarda como un `ExcelRecoveryRun` con fingerprint SHA-256 del archivo y operaciones exactas.
8. Si no hay conflictos, la interfaz muestra el resumen y exige una confirmación explícita.
9. `/api/backups/excel/recovery/runs/:runId/apply` vuelve a comprobar que ningún item cambió desde el preview.
10. La aplicación se ejecuta dentro de una transacción MongoDB y escribe exclusivamente en New Monday.
11. Las fórmulas locales soportadas se recalculan antes de guardar.
12. Monday original recibe **0 escrituras** en todo el flujo.

## Interfaz

La rama v2 incluye dos controles en la barra lateral:

- `Respaldo Excel`: genera y descarga el backup operativo.
- `Recuperar Excel`: analiza el archivo, muestra conflictos o un resumen y exige escribir `RECUPERAR` antes de aplicar.

## Copia automática en Google Drive

Está implementado `services/driveBackup.js` y el comando `npm run sync:drive-backup`.

El sincronizador:

1. genera el mismo Excel recuperable desde New Monday;
2. crea o reemplaza `NEW_MONDAY_BACKUP.xlsx` dentro de la carpeta configurada;
3. crea `NEW_MONDAY_BACKUP_YYYY-MM-DD.xlsx` una sola vez por fecha;
4. usa una cuenta de servicio de Google con acceso únicamente a la carpeta compartida;
5. no necesita `MONDAY_API_TOKEN` y no consulta ni escribe Monday;
6. registra explícitamente `mondayWriteOperations: 0`.

El código ya está construido, pero la sincronización real con la carpeta `NEW MONDAY` todavía no está activada: faltan configurar las credenciales de una cuenta de servicio de Google en Render y compartir con ella esa carpeta. Las credenciales nunca se guardarán en GitHub ni dentro del Excel. La guía está en `docs/DRIVE_BACKUP_SETUP.md`.

## Pendiente antes de producción

- Ejecutar una importación STAGING real y revisar el informe de auditoría.
- Probar una recuperación completa Excel → preview → apply en un entorno de prueba con MongoDB real.
- Configurar la cuenta de servicio de Google, compartir la carpeta NEW MONDAY y probar la primera escritura real del backup en Drive.
- Crear el Cron Job de Render después de validar manualmente la sincronización.
- Ampliar recuperación de columnas relacionales cuando esté validado el modelo de resolución sin ambigüedades.
- No fusionar v2 a `main` hasta terminar esas pruebas.
