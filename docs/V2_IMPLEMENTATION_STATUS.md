# New Monday v2 — estado de implementación

Fecha: 2026-08-24

## Regla de seguridad absoluta

**Monday se estudia y se lee, pero no se modifica nunca.**

La integración de New Monday con Monday es unidireccional y de solo lectura. El cliente `services/mondayReadOnlyClient.js` rechaza explícitamente cualquier documento GraphQL que contenga `mutation` y existe una prueba automática específica para esta política.

## Implementado en la rama `agent/monday-engine-v2`

### Motor de datos

- Workspace persistente: workspace = película.
- Board dinámico: tablero = fase.
- Grupos, columnas y vistas dinámicas.
- Items y subitems con `columnValues` dinámico.
- IDs de origen de Monday para trazabilidad sin sincronización bidireccional.
- Subitems anidados, no expuestos como tableros internos independientes.
- Duplicación, movimiento, reordenación, archivo, papelera y restauración dentro de New Monday.
- Dependencias `strict` con desplazamiento en cascada.
- Motor local para las fórmulas reales observadas.
- Normalización de datos leídos desde Monday.
- Lectura paginada de tableros grandes.
- Historial local `ActivityEvent` para registrar cambios hechos dentro de New Monday.
- Historial de creación, edición, duplicación y reordenación de grupos y columnas, además de cambios de tablero e items.
- Actualizaciones/comentarios por item con respuestas, almacenados únicamente en New Monday.

### Frontend dinámico

- Navegación por workspace.
- Sidebar de tableros por workspace.
- Tabla generada desde el esquema real de columnas del Board.
- Render y edición para People, Status, Timeline, Date, Formula, Dependency, World Clock, Dropdown, Email, Link, Numbers y Text.
- Render de File, Board Relation, Mirror y Subtasks.
- Menús de elemento, grupo y columna.
- Selección múltiple.
- Drag & drop de items, grupos y columnas.
- Gantt dinámico con movimiento y resize conectado al motor de dependencias.
- Pestañas de vistas.
- Filtros por múltiples condiciones sobre Elemento, Grupo y columnas dinámicas.
- Operadores contiene/no contiene, igual/distinto, vacío/no vacío, mayor/menor y antes/después.
- Multi-sort con prioridad de criterios.
- Filtros y orden temporales en Tabla/Cronograma.
- Persistencia de filtros y multi-sort en vistas guardadas.
- Crear, renombrar, duplicar y eliminar vistas guardadas sin afectar los items del tablero.
- Panel de `Actualizaciones y actividad` por elemento, con publicaciones y respuestas.
- Vista `Actividad` del tablero con historial de acciones locales.
- Vistas dedicadas `Archivo` y `Papelera`, ambas con restauración.
- Navegación de celdas con flechas y Enter.
- Selección rectangular de celdas mediante arrastre, Shift+clic y Shift+flechas.
- Copia de rangos seleccionados como TSV compatible con Excel y Google Sheets.
- Copiar una celda y pegar valores escalares soportados desde el portapapeles; columnas calculadas/relacionales quedan protegidas.
- Pegado de rangos tabulados desde Excel/Sheets/TSV sobre varias filas y columnas a partir de la celda activa, con validación por tipo y omisión segura de columnas de solo lectura.
- Crear columnas dinámicas desde la interfaz para Texto, Números, Estado, Personas, Cronograma, Fecha, Reloj mundial, Dropdown, Email y Enlace.
- Gestión de columnas: renombrar, descripción, fijar/desfijar, ocultar/mostrar y configurar etiquetas de Estado/Dropdown.
- Botones `Respaldo Excel` y `Recuperar Excel`.

### Migración segura desde Monday

- Importación completa a colecciones STAGING aisladas en MongoDB.
- Auditoría mediante conteos y fingerprints SHA-256 por tablero.
- Endpoints para consultar runs, progreso y auditoría.
- Preview de promoción de staging.
- Promoción protegida por confirmación explícita.
- Bloqueo de conflictos contra registros locales.
- Cero operaciones de escritura en Monday en staging, auditoría y promoción.

### Excel de emergencia y recuperación

- Generador `.xlsx` operativo desde New Monday.
- `_MANIFEST`, `_WORKSPACES`, `_BOARDS` y una hoja por tablero visible.
- IDs técnicos ocultos y línea base JSON por item.
- Validaciones de Status, Dropdown, Grupo, Tipo y Acción cuando aplica.
- Items y subitems editables durante una caída.
- Creación offline de items y subitems.
- Acciones explícitas `ARCHIVAR` y `PAPELERA`; borrar una fila no borra datos.
- Preview de recuperación sin escrituras.
- Detección de conflictos concurrentes.
- Confirmación explícita antes de aplicar.
- Aplicación transaccional en MongoDB.
- Recálculo de fórmulas locales tras recuperación.
- Formula, Mirror, File, Dependency y Board Relation se conservan pero son de solo lectura en la recuperación manual por ahora.

### Google Drive

- Sincronizador `services/driveBackup.js`.
- Comando `npm run sync:drive-backup`.
- `NEW_MONDAY_BACKUP.xlsx` como copia actual.
- `NEW_MONDAY_BACKUP_YYYY-MM-DD.xlsx` como snapshot diario.
- Credenciales de Google fuera del repositorio mediante variables secretas.
- El sincronizador parte de MongoDB de New Monday y no necesita `MONDAY_API_TOKEN`.
- Guía de configuración en `docs/DRIVE_BACKUP_SETUP.md`.

## Pendiente antes de promover a `main`

- Ejecutar una importación STAGING real y revisar la auditoría completa.
- Probar una recuperación completa Excel → preview → apply contra una base MongoDB de prueba.
- Configurar una cuenta de servicio de Google, compartir con ella la carpeta `NEW MONDAY` y verificar la primera copia real en Drive.
- Crear el Cron Job de Render después de validar manualmente la sincronización.
- Resolver edición segura de columnas relacionales en recuperación si se decide soportarla.
- Completar historial para algunas acciones masivas y operaciones especiales.
- Añadir reordenación visual de pestañas/vistas y más tipos de vista.
- Completar opciones avanzadas específicas de columnas relacionales/calculadas.
- Hacer pruebas funcionales de navegador y auditoría visual final frente a Monday, siempre en modo consulta.

## Estado de validación

GitHub Actions ejecuta `npm test` y validaciones de sintaxis del backend, servicios, scripts y frontend v2. Los tests de Excel, recuperación y sincronización Drive están incluidos en CI. La gestión avanzada de columnas, el pegado/copia de rangos, la selección rectangular y el historial de grupos/columnas forman parte del bloque validado por el workflow.

## Producción

`main` y Render no se modifican durante esta fase. La PR #2 permanece en Draft hasta completar la validación funcional, de migración, recuperación y respaldo.
