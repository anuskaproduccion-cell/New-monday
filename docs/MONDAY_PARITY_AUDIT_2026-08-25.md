# New Monday · auditoría viva de paridad con Monday

Fecha de actualización: 2026-08-26

Regla absoluta: **Monday se consulta en solo lectura. Toda interacción nueva se implementa únicamente en New Monday.**

Esta auditoría es una especificación viva de producto: una diferencia solo se marca como cerrada cuando está implementada en la rama de paridad y pasa CI. Antes de fusionar a producción, el lote completo requiere además validación visual.

## Patrón de referencia inmediato

Tablero Monday: `MQFR_POST` (`5097801091`).

Esquema real observado: Name, Person, Status, Cronograma, Fórmula, Dependencia Strict con varias dependencias permitidas, Reloj mundial, Solape Weeks y Subitems. Vistas reales: Gantt + un `FeatureBoardView` interno llamado `Crear la Vista Vibe` (`monday-vibe-app`), que **no debe renderizarse como pestaña operativa**.

## Fuentes oficiales Monday utilizadas

- Board basics: https://support.monday.com/hc/en-us/articles/115005317249-The-basics-of-a-board
- Groups: https://support.monday.com/hc/en-us/articles/360011472320-The-basics-of-groups
- Columns: https://support.monday.com/hc/en-us/articles/115005466609-The-basics-of-columns
- Column Center: https://support.monday.com/hc/en-us/articles/115005310285-Available-column-types-on-monday-com
- Status: https://support.monday.com/hc/en-us/articles/360001269685-The-Status-Column
- People: https://support.monday.com/hc/en-us/articles/360002281539-The-People-Column
- Timeline: https://support.monday.com/hc/en-us/articles/115005333969-The-Timeline-Column
- Gantt: https://support.monday.com/hc/en-us/articles/360015643840-The-Gantt-Chart-View-and-Widget
- Subitems: https://support.monday.com/hc/en-us/articles/360011905480-All-about-subitems
- World Clock: https://support.monday.com/hc/en-us/articles/360001139425-The-World-Clock-Column
- Files: https://support.monday.com/hc/en-us/articles/360000597900-The-Files-Column
- File management: https://support.monday.com/hc/en-us/articles/115005339505-How-to-manage-files-in-monday-com
- Files Gallery: https://support.monday.com/hc/en-us/articles/360001264249-The-Files-Gallery-View
- Board views: https://support.monday.com/hc/en-us/articles/360001267945-The-board-views
- Updates / glossary: https://support.monday.com/hc/en-us/articles/115005934045-Glossary
- Connect Boards / Mirror: https://support.monday.com/hc/en-us/articles/360001733859-The-Mirror-Column
- Multi-board mirroring: https://support.monday.com/hc/en-us/articles/4403442212498-Multi-board-mirroring
- Board permissions / board menu: https://support.monday.com/hc/en-us/articles/115005315809-Board-permissions
- Archive / restore: https://support.monday.com/hc/en-us/articles/115005314609-How-to-archive-and-restore-data

## Cerrado / implementado en PR Draft #5

### Grupos

- [x] Cabecera de grupo próxima a Monday: menú a la izquierda, flecha, color y nombre.
- [x] Renombrado inline haciendo clic sobre el nombre.
- [x] Paleta de colores basada en los colores oficiales de grupo de Monday.
- [x] Duplicar grupo con elementos y subitems.
- [x] Crear grupo desde el menú y desde el final del tablero.
- [x] Contraer/expandir un grupo.
- [x] Contraer/expandir todos los grupos desde menú y atajo `Ctrl+G`.
- [x] Drag & drop de grupos.
- [x] Resumen compacto visible cuando un grupo está contraído, reutilizando los resúmenes configurados por columna.

### Tabla y columnas

- [x] Motor de columnas dinámicas por tablero.
- [x] Ocultar la columna técnica Monday `name` cuando duplica la columna principal Elemento.
- [x] `+` al final de la cabecera para crear columnas.
- [x] Redimensionar columnas arrastrando y conservar el ancho por tablero.
- [x] Reordenar, ocultar y fijar columnas.
- [x] Menú de columna con ordenar asc/desc, filtrar por columna, renombrar, configurar, resumen, fijar, ocultar y duplicar.
- [x] Resúmenes de grupo por columna: distribución Estado, suma de Numbers/Formula, rangos Date/Timeline y conteos People/Dropdown.
- [x] Crear elemento directamente desde la fila `Agregar elemento`.
- [x] Selección múltiple y acciones en lote.
- [x] Navegación de celdas por teclado, copiar/pegar y pegado de rangos TSV/Excel.
- [x] Indicador discreto `Guardando… / ✓ / !` por celda y eliminación del toast global en cada autosave simple.

### Tipos de columna

- [x] Cronograma compacto tipo batería con editor Inicio/Fin e hitos.
- [x] Fecha compacta con editor emergente en lugar de `<input type=date>` permanente.
- [x] Fórmula visual limpia y de solo lectura; evita `ƒ null`.
- [x] Personas: avatares + selector emergente con selección múltiple local.
- [x] Personas: límite configurable 1/2/3/ilimitadas y selector restringido a equipo/importados conocidos.
- [x] Estado: selector desde celda + editor de etiquetas y colores, hasta 40 etiquetas y estado gris vacío.
- [x] Estado: reordenación drag & drop de labels y descripciones locales de etiquetas.
- [x] Dependencias: selector múltiple compatible con `allowMultipleItems:true`; motor Strict en cascada.
- [x] Dropdown: chips + selector múltiple.
- [x] Subitems: abrir/crear inline y editar sus celdas.
- [x] Subitems: resolver de forma local el tablero interno `Subelementos de …` y usar su esquema real para mapear IDs/tipos de columna cuando difieren del padre, sin copiar ni mutar el esquema importado.
- [x] Subitems: copia local administrable para crear, renombrar, describir, ocultar, reordenar y retirar columnas sin mutar Monday.
- [x] Reloj mundial: selector buscable de zona/ciudad, formato 12/24h, UTC offset y horario laboral.
- [x] Board Relation: picker buscable, uno o varios elementos según configuración y chips de vínculos.
- [x] Board Relation/Mirror multi-board: relaciones entre varios tableros y columna reflejada configurable por tablero.
- [x] Mirror: presentación local según el tipo reflejado en vez de texto plano cuando la semántica está disponible.
- [x] Files Column: varios archivos, drag & drop, subida desde ordenador, enlace externo, descarga y retirada local.
- [x] Adjuntos locales persistentes en MongoDB GridFS; no dependen del filesystem efímero de Render.
- [x] GridFS protege archivos compartidos: no elimina físicamente un archivo mientras siga referenciado por Items/Updates, necesario para duplicaciones seguras.
- [x] Preview inline seguro de imágenes/PDF y revisión/limpieza explícita de archivos huérfanos con revalidación antes de borrar.
- [x] Email y Enlace: representación compacta y editor emergente en vez de inputs permanentes.

### Vistas

- [x] Ocultar `FeatureBoardView` / Vibe internos de la tira de vistas.
- [x] Tabla principal + vistas operativas reales + `+` para crear vista.
- [x] Eliminar Cronograma local duplicado de la tira cuando existe Gantt real.
- [x] Utilidades propias de New Monday separadas de las vistas de Monday.
- [x] Crear, renombrar, duplicar y eliminar vistas locales.
- [x] Reordenar vistas por drag & drop y teclado.
- [x] Filtros avanzados y multi-orden guardables por vista.
- [x] Files Gallery local en cuadrícula/lista consolidando Files Column y adjuntos de Updates/respuestas.
- [x] Menú `⌄` directamente en cada pestaña guardada para abrir, renombrar, duplicar y eliminar.
- [x] Menú de pestaña accesible también por menú contextual / `Shift+F10`.
- [x] Overflow responsivo con menú `Más` cuando no caben todas las vistas, preservando visible la activa.

### Gantt

- [x] Lista de items a la izquierda y calendario horizontal a la derecha.
- [x] Barras arrastrables y redimensionables.
- [x] Hitos.
- [x] Línea de Hoy y control para centrarla.
- [x] Dependencias Strict se desplazan en cascada al mover fechas.
- [x] Líneas/flechas visuales entre predecesor y dependiente.
- [x] Resaltado de fila al hover.
- [x] Respeto de `show_weekends:false` cuando la vista importada lo configura.
- [x] Zoom Día / Semana / Mes.
- [x] Agrupación configurable por Grupo / Estado / Persona / Sin agrupación y campos laterales configurables.
- [x] Selector de color de barras por Grupo o por primera columna Estado disponible, conservado como preferencia local.

### Tablero / navegación

- [x] Renombrado inline del tablero haciendo clic en el nombre.
- [x] Descripción del tablero persistente y editable directamente bajo el nombre.
- [x] Estrella de favorito funcional y sección Favoritos en el sidebar.
- [x] Sección Recientes en el sidebar, recordando los últimos tableros abiertos localmente.
- [x] Sidebar agrupado por fases reconocibles de producción (Pre/Producción, Rodaje, Edición, Post, Otros), con secciones contraíbles locales.
- [x] Carpetas persistentes por workspace, jerarquía manual, drag & drop de tableros y vuelta a organización automática.
- [x] Menú `⋯` del tablero con renombrar, descripción, favorito, copiar enlace, información, duplicar, actividad y archivo.
- [x] Mover tablero entre workspaces conservando su contenido y limpiando la carpeta anterior.
- [x] Duplicación segura del tablero con grupos, columnas, vistas, items y subitems; la copia elimina IDs de Monday y se convierte en contenido local de New Monday.
- [x] Deep-link por tablero mediante `?board=<id>`.
- [x] Archivar tablero localmente sin borrar elementos.
- [x] Navegador de tableros archivados y restauración desde el menú del workspace.

### Elementos / interacción

- [x] Menú de elemento reorganizado con jerarquía visual consistente.
- [x] Acceso desde el menú a Actualizaciones, renombrado, duplicado, movimiento, archivo y papelera.
- [x] Movimiento de elemento mediante picker de grupos con búsqueda y señalización del grupo actual.
- [x] Popovers y menús se reposicionan durante scroll/resize y se cierran si el ancla sale de pantalla.
- [x] Navegación por teclado común en menús/selectores emergentes: flechas, Inicio/Fin y Escape con retorno de foco al ancla.
- [x] Grid accesible con roving tabindex, `aria-selected`, focus visible y labels contextuales de celdas.
- [x] Navegación ampliada con Inicio/Fin, Ctrl/Cmd+Inicio/Fin, Page Up/Page Down, Enter/F2, Escape y Espacio para selección de fila.
- [x] Panel de ayuda de atajos con `Ctrl/Cmd+/` o `?`, live region y soporte `prefers-reduced-motion`.
- [x] Undo/redo local de celdas con comprobación optimista de `updatedAt` para evitar sobrescrituras concurrentes silenciosas.

### Colaboración y continuidad

- [x] Updates/comentarios y respuestas locales.
- [x] Acceso a Updates desde bocadillo del item y presentación como panel lateral.
- [x] Indicador/conteo de Updates + respuestas directamente en el item.
- [x] Adjuntos en Updates y respuestas usando el mismo almacenamiento GridFS.
- [x] `@menciones` locales con picker restringido a personas conocidas y resaltado visual; no se presentan como notificaciones externas.
- [x] Editor enriquecido local de Updates con formato, listas, citas, enlaces y Ctrl/Cmd+Enter.
- [x] Actividad/historial local.
- [x] Archivo, Papelera y restauración de elementos.
- [x] Exportación Excel, preview de recuperación, conflictos y recuperación validada en staging.
- [x] Virtualización/render parcial para tableros grandes: ventana de filas por grupo, spacers equivalentes y navegación compatible con filas fuera del DOM.
- [x] Sincronización entre sesiones mediante SSE same-origin autenticado y refresco del tablero afectado, diferido mientras existe una interacción de edición/drag/resize.
- [x] Indicador visible En vivo / Reconectando / Sin conexión y revalidación al volver a la pestaña.

## Diferencias todavía visibles / funcionales

### Decisiones de producto / escalabilidad

- [ ] Gantt: evaluar `critical path / baseline` solo si aportan valor real a los tableros de producción.
- [ ] Permisos locales por usuario/rol solo si el proyecto adopta un modelo real de usuarios; el acceso actual sigue siendo por sesión/contraseña.
- [ ] Si Render se escala a varias instancias, sustituir el hub SSE en memoria por un bus compartido (Redis/pub-sub, MongoDB Change Streams u otro) para propagar eventos entre procesos.
- [ ] Medir con tableros reales de varios miles de elementos y ajustar umbral/tamaño de ventana de virtualización si esa escala se vuelve habitual.

### Validación previa a publicación

- [ ] Revisión visual integral en navegador real de focus, teclado, virtualización, Gantt, popovers, Updates y sincronización entre dos sesiones antes de fusionar.

## Hallazgos oficiales que guían la siguiente fase

1. **Groups**: Monday permite renombrar al hacer clic, cambiar color desde el menú de tres puntos, duplicar, contraer, contraer todos y reordenar por drag & drop.
2. **Status**: cada columna conserva sus propias labels/colores; se editan desde la celda y pueden existir hasta 40. El gris vacío es el estado predeterminado.
3. **People**: admite una o varias personas y equipos; la columna puede limitar ownership a 1, 2, 3 o ilimitado.
4. **Subitems**: pueden tener un esquema de columnas propio, compartido por todos los subitems del tablero.
5. **Gantt**: items a la izquierda, calendario a la derecha, hitos y líneas de dependencia; es una representación visual de Date/Timeline y Dependency.
6. **World Clock**: selector buscable por ciudad, formato 12/24h, UTC offset opcional y horario laboral configurable.
7. **Files**: la celda permite añadir desde ordenador/enlace/servicios externos y una Files Gallery consolida archivos del board.
8. **Updates**: el bocadillo del item abre una conversación contextual con updates, respuestas, menciones y adjuntos.
9. **Connect Boards / Mirror**: la relación selecciona items de uno o varios tableros y Mirror conserva/agrupa la semántica del tipo reflejado.
10. **Board Menu**: las acciones de tablero viven en el menú superior y el archivo debe ser reversible desde un Board Archive.

## Estado de validación

Lote validado el 2026-08-26:
- `npm test`: PASS, incluyendo resolución de esquema de Subitems, protección de referencias GridFS, duplicación local de tableros y hub realtime.
- `npm audit --omit=dev --audit-level=high`: PASS.
- syntax checks: PASS, incluyendo accesibilidad, virtualización, realtime, ruta SSE y hub de eventos.
- workflow general v2: PASS.
- workflow específico de paridad: PASS.
- STAGING/recovery no se ejecutan salvo disparador explícito.
- ninguna de estas validaciones ejecuta mutaciones en Monday.

Producción no se modifica durante esta auditoría. PR #5 permanece Draft hasta revisión visual y autorización expresa de publicación.

## Criterio de cierre

Una diferencia se marca como cerrada solo cuando:
1. funciona sobre datos reales importados;
2. no escribe nada en Monday;
3. pasa tests/sintaxis/audit de dependencias;
4. no degrada backup Excel ni recuperación;
5. el lote completo se valida visualmente antes de fusionar a `main`.
