# New Monday · progreso de paridad · 2026-08-26

Regla absoluta: **Monday se consulta exclusivamente en modo lectura. Toda funcionalidad nueva se implementa solo en New Monday.**

Este documento complementa `MONDAY_PARITY_AUDIT_2026-08-25.md` y registra el estado real de la rama `agent/monday-group-parity` después de cerrar los bloques de prioridad alta y varias diferencias de prioridad media.

## Prioridad alta · cerrada en código

- [x] **Gantt configurable**: agrupación por Grupo / Estado / Persona / Sin agrupación y campos laterales configurables (Grupo, Estado, Persona, Fechas y Dependencia), guardados por tablero localmente.
- [x] **Workspace y sidebar**: carpetas persistentes por workspace; crear, renombrar, eliminar y mover tableros con drag & drop; opción de volver a organización automática.
- [x] **Subitems**: esquema local propio administrable. Se puede partir del esquema interno importado y crear una copia local para crear, renombrar, describir, ocultar, reordenar y retirar columnas sin mutar Monday.
- [x] **Undo/redo seguro**: historial local de celdas con Ctrl/Cmd+Z, redo y guardas optimistas basadas en `updatedAt`; los conflictos concurrentes devuelven 409 y obligan a recargar antes de sobrescribir.

### Decisión pendiente, no bloqueante

- [ ] **Critical path / baseline de Gantt**: evaluar con el equipo si aportan valor operativo real antes de implementarlos. No se añaden solo por imitar Monday si no existe una necesidad validada.

## Prioridad media · progreso adicional

- [x] **Files preview**: preview inline seguro de imágenes y PDF, con `nosniff`, tipos permitidos y apertura same-origin.
- [x] **Files / limpieza**: revisión explícita de archivos huérfanos de GridFS y limpieza confirmada. La revisión es dry-run por defecto y cada archivo se vuelve a comprobar antes de eliminarlo para proteger referencias activas.
- [x] **Updates**: editor enriquecido local con negrita, cursiva, código, listas, citas, enlaces http/https, @menciones y Ctrl/Cmd+Enter. El renderizado conserva las menciones y no inserta HTML del usuario sin escapar.
- [x] **Overflow de vistas**: pestañas responsivas con menú “Más” cuando no caben en el ancho disponible, manteniendo visible la vista activa.
- [x] **Board Relation / Mirror multi-board**: una relación puede apuntar a varios tableros; el picker busca elementos entre todos ellos y Mirror permite configurar por tablero qué columna reflejar.
- [x] **Mover tablero entre workspaces**: acción local desde el menú del tablero; conserva grupos, columnas, vistas, elementos y subitems y limpia la carpeta anterior al cambiar de workspace.

## Diferencias que quedan después de este lote

### Interacción / accesibilidad

- [ ] Afinar todavía más selección, hover y focus de filas/celdas para acercarlos a los microcomportamientos de Monday.
- [ ] Añadir un menú/ayuda de atajos equivalente a la experiencia de hoja de cálculo.

### Rendimiento / colaboración

- [ ] Virtualización o render parcial para tableros grandes, evitando reconstrucciones completas del DOM tras cambios simples.
- [ ] Sincronización en tiempo real entre dos sesiones de New Monday. El bloqueo optimista ya evita sobrescrituras silenciosas, pero aún no empuja cambios de una sesión a otra automáticamente.

### Modelo de usuarios / permisos

- [ ] Permisos locales por usuario/rol solo si el proyecto adopta un modelo real de usuarios. El acceso protegido actual sigue siendo por sesión/contraseña de New Monday.

## Seguridad y publicación

- Monday sigue en **solo lectura**; este lote no añade ninguna mutación a Monday.
- No se ejecuta el seed destructivo durante esta auditoría.
- No se escribe en MongoDB de producción durante el desarrollo de la rama.
- La PR #5 continúa **Draft**.
- No fusionar a `main` ni desplegar este lote hasta completar revisión visual integral y recibir autorización expresa.

## Validación

La rama mantiene dos puertas de CI:

1. `New Monday v2 validation`: tests, audit de dependencias y syntax checks; STAGING/recovery/auditoría publicada solo se ejecutan con disparadores explícitos.
2. `New Monday group and timeline parity validation`: `npm test`, `npm audit --omit=dev --audit-level=high` y syntax checks de los módulos de paridad.

Cada bloque nuevo se integra en esas validaciones antes de considerarse cerrado en código.
