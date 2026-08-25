# New Monday · auditoría viva de paridad con Monday

Fecha: 2026-08-25

Regla absoluta: **Monday se consulta en solo lectura. Toda interacción nueva se implementa únicamente en New Monday.**

Esta auditoría es una especificación viva de producto: una diferencia solo se marca como cerrada cuando está implementada en la rama de paridad, pasa CI y queda pendiente únicamente la validación visual antes de fusionar a producción.

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
- [x] Dependencias: selector múltiple compatible con `allowMultipleItems:true`; motor Strict en cascada.
- [x] Dropdown: chips + selector múltiple.
- [x] Subitems: abrir/crear inline y editar sus celdas.
- [x] Reloj mundial: selector buscable de zona/ciudad, formato 12/24h, UTC offset y horario laboral.
- [x] Board Relation: picker buscable, uno o varios elementos según configuración y chips de vínculos.
- [x] Mirror: presentación local según el tipo reflejado en vez de texto plano cuando la semántica está disponible.
- [x] Files Column: varios archivos, drag & drop, subida desde ordenador, enlace externo, descarga y retirada local.
- [x] Adjuntos locales persistentes en MongoDB GridFS; no dependen del filesystem efímero de Render.

### Vistas

- [x] Ocultar `FeatureBoardView` / Vibe internos de la tira de vistas.
- [x] Tabla principal + vistas operativas reales + `+` para crear vista.
- [x] Eliminar Cronograma local duplicado de la tira cuando existe Gantt real.
- [x] Utilidades propias de New Monday separadas de las vistas de Monday.
- [x] Crear, renombrar, duplicar y eliminar vistas locales.
- [x] Reordenar vistas por drag & drop y teclado.
- [x] Filtros avanzados y multi-orden guardables por vista.
- [x] Files Gallery local en cuadrícula/lista consolidando Files Column y adjuntos de Updates/respuestas.

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
- [x] Agrupación visual por grupos.

### Tablero / navegación

- [x] Renombrado inline del tablero haciendo clic en el nombre.
- [x] Estrella de favorito funcional y sección Favoritos en el sidebar.
- [x] Menú `⋯` del tablero con renombrar, favorito, copiar enlace, información, actividad y archivo.
- [x] Deep-link por tablero mediante `?board=<id>`.
- [x] Archivar tablero localmente sin borrar elementos.
- [x] Navegador de tableros archivados y restauración desde el menú del workspace.

### Colaboración y continuidad

- [x] Updates/comentarios y respuestas locales.
- [x] Acceso a Updates desde bocadillo del item y presentación como panel lateral.
- [x] Adjuntos en Updates y respuestas usando el mismo almacenamiento GridFS.
- [x] Actividad/historial local.
- [x] Archivo, Papelera y restauración de elementos.
- [x] Exportación Excel, preview de recuperación, conflictos y recuperación validada en staging.

## Diferencias todavía visibles / funcionales

### Prioridad alta

- [ ] Subitems: modelar esquema de columnas propio de subitems cuando difiera del padre; hoy reutilizamos mayoritariamente el esquema principal.
- [ ] Menú de elemento: completar jerarquía visual y acciones equivalentes de Monday.
- [ ] Gantt: controles de color por Estado/Grupo y configuración más completa.
- [ ] Gantt: critical path / baseline solo si aportan valor real a los tableros de producción y la configuración los requiere.
- [ ] Sidebar/workspace: carpetas, recientes, jerarquía y menús más próximos a Monday.
- [ ] Menú de tablero: duplicación segura, descripción e información compartida sin alterar las huellas de importación.

### Prioridad media

- [ ] Estado: drag & drop real para reordenar etiquetas y descripciones de labels.
- [ ] Files: preview seguro de imágenes/PDF y administración de archivos huérfanos; hoy las descargas se sirven como attachment por seguridad.
- [ ] Enlace/Email: presentación compacta y editor emergente en vez de input permanente.
- [ ] Updates: @mentions, indicador/conteo por item y editor enriquecido.
- [ ] Resumen de columnas también visible de forma útil con grupos contraídos.
- [ ] Menú por pestaña de vista directamente en la propia pestaña, no solo desde la toolbar de la vista activa.
- [ ] Overflow/responsive de vistas cuando hay muchas vistas reales.
- [ ] Board Relation/Mirror: multi-board mirroring completo cuando una columna conecte varios tableros a la vez.

### Paridad de interacción y accesibilidad

- [ ] Selección/hover/focus de filas y celdas más fiel al board de Monday.
- [ ] Menús emergentes que se reposicionen durante scroll horizontal/vertical.
- [ ] Navegación por teclado dentro de todos los selectores emergentes.
- [ ] Undo/redo local para ediciones recientes.
- [ ] Menú/ayuda de atajos equivalente a la experiencia de hoja de cálculo de Monday.
- [ ] Virtualización/render parcial para tableros grandes, evitando rerender completo tras cada cambio.

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

Último lote validado el 2026-08-25 antes del bloque final de archivo de tableros:
- `npm test`: PASS
- `npm audit --omit=dev --audit-level=high`: PASS
- syntax checks: PASS
- workflow general v2: PASS
- STAGING/recovery no se ejecutan salvo disparador explícito.

El bloque posterior de archivo/restauración de tableros queda sujeto al siguiente CI automático de la rama.

Producción no se modifica durante esta auditoría. PR #5 permanece Draft hasta revisión visual y autorización expresa de publicación.

## Criterio de cierre

Una diferencia se marca como cerrada solo cuando:
1. funciona sobre datos reales importados;
2. no escribe nada en Monday;
3. pasa tests/sintaxis/audit de dependencias;
4. no degrada backup Excel ni recuperación;
5. se valida visualmente antes de fusionar a `main`.
