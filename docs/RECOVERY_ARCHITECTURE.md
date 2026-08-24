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
- `_WORKSPACES`;
- `_BOARDS`;
- una hoja por tablero visible;
- IDs técnicos ocultos para reconciliación;
- una copia JSON oculta de los valores dinámicos de cada item;
- columnas visibles con los nombres del tablero;
- validaciones de lista para Status y Dropdown cuando la configuración lo permite;
- subitems identificados y vinculados con su padre.

La primera fila de cada hoja de tablero contiene claves técnicas estables y permanece oculta. La segunda fila contiene los encabezados visibles para trabajar normalmente.

## Pendiente antes de producción

- Ejecutar una importación STAGING real y revisar el informe de auditoría.
- Construir la importación/reconciliación desde el Excel editado.
- Conectar la generación del Excel con la carpeta NEW MONDAY de Google Drive para mantener una copia actual y snapshots históricos.
- Probar recuperación completa en un entorno de prueba.
- No fusionar v2 a `main` hasta terminar esas pruebas.
