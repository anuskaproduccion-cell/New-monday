# New Monday v2 — estado de implementación

Fecha: 2026-08-24

## Regla de seguridad absoluta

**Monday se estudia y se lee, pero no se modifica nunca.**

La integración de New Monday con Monday es unidireccional y de solo lectura. El cliente `services/mondayReadOnlyClient.js` rechaza explícitamente cualquier documento GraphQL que contenga `mutation`.

## Implementado en la rama `agent/monday-engine-v2`

### Motor de datos

- Workspace persistente con clasificación y trazabilidad de origen.
- Board con grupos, columnas y vistas dinámicas.
- Item con `columnValues` dinámico.
- IDs de origen de Monday para trazabilidad sin sincronización bidireccional.
- Subitems como items anidados, no como tableros visibles independientes.
- Duplicación de elementos conservando valores.
- Duplicación de grupos y columnas.
- Renombrado de grupo conservando ID estable.
- Movimiento y reordenación de elementos.
- Reordenación de grupos y columnas.
- Archivo, papelera y restauración.
- Dependencias `strict` con desplazamiento en cascada.
- Fórmula de semanas observada en los tableros reales.
- Normalización de datos leídos desde Monday.
- Lectura paginada de tableros grandes.

### Frontend dinámico

- Navegación por workspace.
- Sidebar de tableros por workspace.
- Tabla generada desde el esquema real de columnas del Board.
- Fallback compatible con los datos legacy v1.
- Render y edición para People, Status, Timeline, Date, Formula, Dependency, World Clock, Dropdown, Email, Link, Numbers y Text.
- Render de File, Board Relation, Mirror y Subtasks.
- Menú de elemento: duplicar, mover, archivar, papelera y añadir subitem.
- Menú de grupo: renombrar, cambiar color y duplicar.
- Menú de columna: renombrar, fijar/desfijar, ocultar y duplicar.
- Selección múltiple con acciones en lote.
- Drag & drop de elementos entre grupos.
- Drag & drop para reordenar grupos.
- Drag & drop para reordenar columnas.
- Gantt dinámico basado en la primera columna Timeline/Date disponible.
- Movimiento y resize de barras conectado al motor de dependencias.
- Visualización básica de milestones.
- Vistas guardadas visibles como pestañas; Gantt y vistas de progreso tienen render local.

## Pendiente antes de promover a `main`

- Importación staging completa de todos los workspaces/tableros/items/subitems.
- Resolver Board Relation y Mirror para todos los casos importados y no solo relaciones ya presentes localmente.
- Editor de archivos y subida local.
- Updates/comentarios/respuestas.
- Actividad/historial local.
- Filtros avanzados y multi-sort con persistencia por vista.
- Copiar/pegar y navegación de teclado completa.
- Creación/configuración completa de columnas por tipo.
- Creación, duplicación y gestión de vistas.
- Trash/Archive UI dedicada para restaurar desde la interfaz.
- Snapshots y exportación Excel de emergencia.
- Pruebas funcionales de navegador.
- Auditoría visual final frente a Monday en modo de consulta.

## Estado de validación

GitHub Actions valida sintaxis del backend, servicios y frontend v2, además de ejecutar `npm test`. La ejecución de CI correspondiente al bloque de frontend dinámico y drag & drop ha finalizado correctamente.

## Producción

`main` y Render no se modifican durante esta fase. La PR #2 permanece en Draft hasta completar la validación funcional y visual.
