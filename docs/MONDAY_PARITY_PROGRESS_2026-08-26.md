# New Monday · progreso de paridad · 2026-08-26

Regla absoluta: **Monday se consulta exclusivamente en modo lectura. Toda funcionalidad nueva se implementa solo en New Monday.**

Este documento complementa `MONDAY_PARITY_AUDIT_2026-08-25.md` y registra el estado real de la rama `agent/monday-group-parity` después de cerrar los bloques de prioridad alta, varias diferencias de prioridad media y el bloque de interacción/rendimiento/colaboración.

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

## Interacción / accesibilidad · cerrada en código

- [x] **Focus y selección tipo hoja de cálculo**: celdas con focus visible, fila seleccionada consistente y estados `aria-selected`/`aria-current`.
- [x] **Grid accesible**: tablas declaradas como `grid`, celdas como `gridcell`, cabeceras de columna, labels contextuales y navegación con roving tabindex.
- [x] **Navegación ampliada**: flechas, Inicio/Fin, Ctrl/Cmd+Inicio/Fin y Page Up/Page Down sobre el modelo de datos, no solo sobre las filas presentes en pantalla.
- [x] **Edición por teclado**: Enter/F2 abre el editor, Escape devuelve el foco a la celda y Espacio selecciona/deselecciona la fila.
- [x] **Ayuda de atajos**: panel de ayuda con `Ctrl/Cmd+/` o `?` y live region para anunciar cambios relevantes a tecnologías de asistencia.
- [x] **Preferencia de movimiento reducido**: animaciones/transiciones prescindibles se desactivan cuando el sistema solicita `prefers-reduced-motion`.

## Rendimiento / colaboración · cerrada en código

- [x] **Virtualización/render parcial**: a partir de 260 elementos, New Monday mantiene una ventana de hasta 120 filas por grupo, con spacers de altura equivalente y actualización por scroll. Los contadores y resúmenes siguen usando el conjunto completo de datos.
- [x] **Navegación compatible con virtualización**: si una acción de teclado necesita una fila que no está en el DOM, la ventana se desplaza antes de restaurar el foco.
- [x] **Sincronización entre sesiones**: stream SSE autenticado same-origin en `/api/realtime/stream`; los cambios registrados en actividad se emiten a sesiones abiertas del mismo servidor.
- [x] **Refresco remoto seguro**: la sesión receptora recarga únicamente el tablero y sus items, conserva la vista activa y difiere el refresco mientras existe edición/drag/resize en curso.
- [x] **Estado de conexión visible**: indicador En vivo / Reconectando / Sin conexión y revalidación al volver a una pestaña tras un periodo de inactividad.
- [x] **Regresión del hub realtime**: prueba unitaria dedicada para suscripción, emisión, serialización SSE y desconexión.

## Diferencias que quedan después de este lote

### Producto / validación visual

- [ ] Validación visual integral en navegador real de todo el lote de paridad antes de sacar la PR de Draft.
- [ ] Decidir si `critical path / baseline` de Gantt aporta valor operativo real.

### Escalabilidad futura

- [ ] Si en producción se supera de forma habitual una escala de varios miles de elementos por tablero, medir con datos reales y ajustar `ROW_HEIGHT`, `WINDOW_SIZE` y umbrales de virtualización.
- [ ] Si Render se escala a varias instancias, sustituir el hub SSE en memoria por un bus compartido (por ejemplo Redis/pub-sub o MongoDB Change Streams) para propagar cambios entre procesos. En una instancia, el stream actual ya sincroniza sesiones abiertas.

### Modelo de usuarios / permisos

- [ ] Permisos locales por usuario/rol solo si el proyecto adopta un modelo real de usuarios. El acceso protegido actual sigue siendo por sesión/contraseña de New Monday.

## Seguridad y publicación

- Monday sigue en **solo lectura**; este lote no añade ninguna mutación a Monday.
- No se ejecuta el seed destructivo durante esta auditoría.
- No se escribe en MongoDB de producción durante el desarrollo de la rama.
- La PR #5 continúa **Draft**.
- No fusionar a `main` ni desplegar este lote hasta completar revisión visual integral y recibir autorización expresa.

## Validación

El lote funcional de accesibilidad, virtualización y realtime quedó verde en ambas puertas de CI el 2026-08-26:

1. `New Monday v2 validation`: `npm test`, audit de dependencias y syntax checks: **PASS**; STAGING/recovery/auditoría publicada no se ejecutaron porque no hubo disparador explícito. El workflow general comprueba ahora también la ruta SSE, el hub realtime y los tres módulos cliente nuevos.
2. `New Monday group and timeline parity validation`: `npm test`, `npm audit --omit=dev --audit-level=high` y syntax checks específicos, incluidos accesibilidad, virtualización, realtime, ruta SSE y hub de eventos: **PASS**.

Los commits posteriores que solo actualizan documentación o cobertura de CI vuelven a disparar las puertas, pero no alteran el comportamiento funcional ya validado.
