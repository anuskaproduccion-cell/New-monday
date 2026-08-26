# New Monday · progreso de paridad · 2026-08-26

Regla absoluta: **Monday se consulta exclusivamente en modo lectura. Toda funcionalidad nueva se implementa solo en New Monday.**

Este documento complementa `MONDAY_PARITY_AUDIT_2026-08-25.md`. La primera gran tanda de paridad se publicó desde la PR #5; el trabajo post-publicación continúa de forma aislada en la PR #6 (`agent/post-publish-qa`), sin modificar directamente `main`.

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
- [x] **Modales y menús**: foco inicial, trampa de foco en diálogos, Escape, restauración al ancla, roles `dialog/menu/menuitem` y navegación con flechas/Inicio/Fin.
- [x] **Sidebar por teclado**: navegación jerárquica con flechas y alternativa `Shift+F10` al drag & drop para mover tableros entre carpetas.

## Rendimiento / colaboración · cerrada en código

- [x] **Virtualización/render parcial**: a partir de 260 elementos, New Monday mantiene una ventana de hasta 120 filas por grupo, con spacers y actualización por scroll. Los contadores y resúmenes siguen usando el conjunto completo de datos.
- [x] **Alturas reales**: el fallback coincide con la fila CSS de 38 px y las filas/subitems visibles alimentan alturas medidas para reducir deriva de scroll.
- [x] **Índice de alturas**: acumulados por grupo y búsqueda binaria para localizar el offset visible, evitando recorrer linealmente miles de items en cada cálculo de ventana.
- [x] **Navegación compatible con virtualización**: foco, rangos, copiar/pegar y `Shift + flechas` operan sobre el modelo completo aunque haya filas fuera del DOM.
- [x] **Sincronización entre sesiones**: stream SSE autenticado same-origin en `/api/realtime/stream`, con scopes board/workspace/global.
- [x] **Refresco remoto dirigido**: cambios simples pueden leer solo el item afectado; cascadas, bulk, ordering y cambios estructurales conservan refrescos más amplios por seguridad.
- [x] **Coalescencia de ráfagas**: cambios rápidos no pierden items, conservan siempre el evento de mayor alcance y tienen un límite de latencia aproximado de 1,2 s salvo interacción local activa.
- [x] **Coordinación con mutaciones locales**: realtime se aplaza mientras hay `POST/PATCH/PUT/DELETE` local en vuelo, eliminando carreras entre blur/guardado y refresco remoto.
- [x] **Supresión de eco propio solo en mutaciones eco-seguras**: cada pestaña usa un identificador efímero compartido entre su API y su stream SSE. La política está auditada para el PATCH condicional de celda, crear item, mover item, archivar, desarchivar, restaurar y enviar un item a papelera. Duplicar y reordenar conservan su eco porque afectan a otros items además del principal. El identificador no es autenticación, no se persiste y no forma parte del payload de cambio.
- [x] **Reconexión segura**: al restablecer SSE se hace una resincronización para recuperar cambios que pudieran haberse producido durante la desconexión.
- [x] **Estado de conexión visible**: indicador En vivo / Reconectando / Sin conexión y revalidación al volver a una pestaña tras inactividad.

## Diferencias que quedan después de este lote

### Diferencias operativas reales pendientes

- [ ] **Validación visual integral en navegador real** de focus, teclado, virtualización, Gantt, popovers, Updates y dos sesiones simultáneas antes de sacar la PR #6 de Draft.
- [ ] **Decisión de producto sobre `critical path / baseline` de Gantt**. No es un bloqueo técnico actual; solo se implementará si aporta valor operativo.

### Diferencias condicionadas por decisiones futuras

- [ ] **Permisos locales por usuario/rol** únicamente si New Monday adopta un modelo real de usuarios. El acceso actual está protegido por sesión/contraseña.
- [ ] **Bus realtime compartido** únicamente si Render pasa a varias instancias. Con una sola instancia, el hub SSE actual cubre las sesiones conectadas a ese proceso.
- [ ] **Tuning para varios miles de elementos** si esa escala aparece de forma habitual en datos reales; la virtualización actual ya dispone de ventanas, alturas medidas e índice binario para reducir el coste de scroll.

## Lectura del estado de paridad

Los bloques funcionales principales observados en Monday y priorizados para New Monday están cerrados en código: grupos, tabla/columnas, tipos de columna, subitems, vistas, Gantt, navegación/tablero, elementos, Updates, archivos, relaciones/mirror, teclado, accesibilidad, undo/redo, virtualización y colaboración realtime.

Por tanto, lo pendiente ya no es otra gran fase de reconstrucción funcional. La mayor parte del trabajo restante es **QA visual/comportamental y decisiones opcionales de producto o escala**.

## Seguridad y publicación

- Monday sigue en **solo lectura**; este trabajo no añade ninguna mutación a Monday.
- No se ejecuta el seed destructivo durante esta auditoría.
- No se escribe directamente en MongoDB de producción durante el desarrollo de la rama.
- La PR #5 ya fue fusionada y constituye el corte publicado anterior.
- La PR #6 continúa **Draft**, abierta y separada de producción.
- No fusionar ni desplegar la PR #6 hasta completar el nuevo corte de revisión y recibir autorización expresa.

## Validación

El HEAD funcional `cee2b9518a8782bc555941344d35abf66ffed669` quedó verde en ambas puertas de CI el 2026-08-26:

1. `New Monday v2 validation`: `npm test`, audit de dependencias y syntax checks: **PASS**; STAGING/recovery/auditoría publicada no se ejecutaron sin disparador explícito.
2. `New Monday group and timeline parity validation`: `npm test`, `npm audit --omit=dev --audit-level=high` y syntax checks específicos: **PASS**.

La cobertura incluye, entre otros, realtime cliente/servidor, coalescencia y latencia de ráfagas, contexto de origen, política de eco propio segura, tracking de mutaciones, virtualización por alturas, teclado/rangos, modales, menús y sidebar.
