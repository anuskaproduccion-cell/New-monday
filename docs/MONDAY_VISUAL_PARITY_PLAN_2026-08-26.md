# New Monday · plan de paridad visual con Monday · 2026-08-26

Regla absoluta: **Monday se consulta únicamente como referencia de solo lectura. Toda implementación visual se realiza exclusivamente en New Monday.**

## Objetivo

Elevar New Monday desde paridad funcional alta a una experiencia visual y de interacción coherente con el lenguaje de Monday dentro del alcance operativo ya auditado. La meta no es copiar assets propietarios ni depender de recursos externos, sino reproducir con CSS/HTML propios la jerarquía, densidad, geometría, estados y ritmo visual que hacen reconocible la experiencia.

## Definición de “paridad visual alta”

Se considera alcanzada cuando, dentro de los flujos auditados, New Monday mantiene de forma consistente:

- jerarquía de shell, sidebar, board header y vistas;
- densidad de tabla y relación entre cabeceras, filas, grupos y columnas;
- tipografía, contraste y pesos coherentes;
- controles compactos, radios, bordes y sombras homogéneos;
- estados hover, focus, pressed, selected, disabled, loading y save feedback;
- menús, popovers, modales y paneles laterales con la misma familia visual;
- Gantt, Updates, Files, ciclo de vida y Backup/Recovery integrados en el mismo sistema visual.

La paridad se refiere al alcance funcional observado/auditado para New Monday. No implica replicar módulos del ecosistema monday.com que nunca hayan formado parte del alcance del proyecto.

## Arquitectura visual implementada

La paridad visual se aplica como capas finales del cascade, después de los CSS funcionales/componentes existentes:

1. `v2-visual-parity.css`: tokens, shell, tabla, grupos, controles base, menús y modales.
2. `v2-visual-parity-components.css`: pickers especializados, Updates, editor rico, menciones, adjuntos, save-state y responsive interno de componentes.
3. `v2-visual-parity-views.css`: Gantt, Files Gallery, Activity/Archive/Trash y Backup/Recovery.
4. `v2-visual-parity-responsive.css`: compactación progresiva del shell y superficies globales a 1100/900/720/560 px sin ocultar navegación funcional.
5. `v2-visual-parity-states.css`: focus final, pressed, disabled, sidebar jerárquico, drag/drop, resize, selección de menús, realtime, toasts, connection errors y reduced-motion.

La capa de estados se carga en último lugar para impedir que estilos históricos silencien feedback de teclado, estados deshabilitados, drag/resize o señalización del sistema.

Esta estrategia evita refactors destructivos de decenas de hojas históricas y permite revisar/retirar cada capa de forma aislada.

## Fase 1 · Foundations + shell + tabla

Estado: **BASE CERRADA EN CÓDIGO · QA VISUAL PENDIENTE**

### Design tokens

- [x] Crear una capa visual final independiente, cargada después del resto de CSS.
- [x] Centralizar color primario, texto, muted, superficies, bordes, sidebar, sombras, radios y alturas.
- [x] Mantener `38px` como altura base de fila para preservar compatibilidad con la virtualización actual.
- [ ] Validar visualmente contraste y proporciones en navegador real.

### Shell

- [x] Unificar sidebar, brand, workspace switcher, búsqueda y navegación.
- [x] Unificar board header, título, subtítulo, búsqueda global y botones.
- [x] Unificar tabs de vistas, active/hover y borde inferior.
- [x] Añadir adaptación responsive conservadora a 1100/900/720/560 px sin esconder los tableros.
- [x] Unificar tableros normales, Favoritos, Recientes, Fases y Carpetas: hover/active/focus/drop-target.
- [x] Añadir `focus-visible` faltante a Recientes.
- [x] Igualar el título inline de edición con la escala visible del header: 24/22/21/19/17 px según breakpoint.
- [x] Igualar la descripción inline con la densidad del subtítulo, incluida la adaptación estrecha.
- [ ] Revisar responsive real en navegador.

### Tabla principal

- [x] Unificar cabeceras, grid, filas y estados hover/selected.
- [x] Mantener pinned columns/sticky behavior sin alterar posiciones funcionales.
- [x] Unificar grupo, título/color, add-item row y celdas editables.
- [x] Unificar Status/People/chips y estados de edición.
- [x] Integrar visualmente `Guardando… / ✓ / !` con el resto de la tabla.
- [x] Unificar feedback visual de drag source, drop target y group drop target.
- [x] Unificar handle activo de resize de columnas sin modificar su lógica.
- [ ] QA visual con subitems expandidos y virtualización activa.

## Fase 2 · Menús, popovers, modales y Updates

Estado: **BASE Y MICROACABADO DE CÓDIGO CERRADOS · QA REAL PENDIENTE**

- [x] Base visual común para floating menus y status menus.
- [x] Base visual común para modales y backdrop.
- [x] Unificar People, Status, Date, Dropdown, Dependency, Relation/Mirror y World Clock: superficie, bordes, sombras, search, opciones, selección y acciones.
- [x] Unificar panel lateral de Updates, tabs, composer, cards, replies y estados principales.
- [x] Integrar toolbar de editor enriquecido, código, citas y enlaces.
- [x] Integrar menciones y picker de menciones.
- [x] Integrar adjuntos pendientes/publicados y botones de archivo.
- [x] Añadir adaptación responsive de drawer/pickers/componentes.
- [x] Mantener popovers anclados al hacer scroll/resize y limitar su posición al viewport.
- [x] Corregir cierre exterior persistente: un clic dentro del popover ya no consume el listener que permite cerrarlo después desde fuera.
- [x] Añadir `tests/popoverPositioning.test.js` al `npm test`.
- [ ] Ajustar detalles adicionales únicamente si QA real detecta diferencias visibles.

## Fase 3 · Vistas especiales

Estado: **BASE PRINCIPAL CERRADA EN CÓDIGO · QA REAL PENDIENTE**

- [x] Gantt: help/header, controles, left pane, grid temporal, grupos, barras, dependencias y Today.
- [x] Files Gallery: header, stats, selector grid/list, cards/list y estados vacíos.
- [x] Activity / Archive / Trash: headers, listas, cards, eventos y estados vacíos.
- [x] Backup/Recovery: herramientas de sidebar, modal, formularios, alertas, resumen, conflictos y confirmación.
- [ ] QA visual real de Gantt con zoom, agrupación, milestones y dependencias largas.
- [ ] QA visual real de Files con nombres largos, varios tipos y preview.
- [ ] QA visual real de Backup/Recovery con conflictos y responsive.

## Fase 4 · Microinteracciones y QA comparativa

Estado: **PREPARADA EN CÓDIGO · QA EN NAVEGADOR PENDIENTE**

La revisión se guía por `docs/MONDAY_VISUAL_QA_CHECKLIST_2026-08-26.md`.

- [x] Preparar breakpoints responsive del shell sin esconder navegación.
- [x] Integrar hover/focus/save feedback principales en el sistema visual.
- [x] Unificar pressed/active sin desplazar layout.
- [x] Unificar disabled nativo y `aria-disabled`.
- [x] Unificar feedback de drag/drop y resize.
- [x] Integrar estados En vivo / Reconectando / Sin conexión en el lenguaje visual del header.
- [x] Integrar toasts, connection error, loading y empty state.
- [x] Endurecer `prefers-reduced-motion` en la capa final.
- [x] Cubrir posicionamiento y ciclo de cierre exterior de popovers con regresión automática.
- [x] Evitar el salto tipográfico al entrar en edición de título/descripción del tablero.
- [ ] Auditoría visual pantalla por pantalla.
- [ ] Restauración de foco y teclado visualmente coherentes en navegador real.
- [ ] QA con dos sesiones realtime.
- [ ] QA con tableros >260 items y subitems expandidos.
- [ ] QA responsive en los anchos de la checklist.
- [ ] Capturar diferencias restantes y cerrarlas antes de sacar la PR de Draft.

## Regresión automática

`tests/visualParityShell.test.js` comprueba que:

- existan los tokens visuales esenciales;
- se preserve `--nm-row-height:38px`;
- estén presentes shell, tabla, menús y modales;
- título y descripción inline mantengan la misma familia visual del header;
- la escala del título inline siga 24/22/21/19/17 px en desktop y breakpoints;
- estén presentes pickers, Updates, editor rico, menciones, adjuntos y save-state;
- estén presentes Gantt, Files, lifecycle y Backup/Recovery;
- existan los breakpoints 1100/900/720/560;
- el sidebar se compacte sin desaparecer en los breakpoints estrechos;
- Favoritos/Recientes/Fases/Carpetas mantengan estados finales comunes;
- existan focus, pressed, disabled, drag/drop, resize, realtime, toast, connection-error y reduced-motion finales;
- las cinco capas visuales se carguen al final del cascade y en el orden correcto, con `v2-visual-parity-states.css` en último lugar.

`tests/popoverPositioning.test.js` comprueba que:

- el popover siga a su ancla en resize y scroll;
- se limite contra los bordes derecho/inferior del viewport y pueda voltearse sobre el ancla;
- mantenga un gutter mínimo;
- el listener de cierre exterior se limpie con `AbortController`;
- un clic interior no consuma prematuramente el seguimiento de clic exterior.

Ambas regresiones forman parte de `npm test`.

## Criterios técnicos

1. La capa visual no debe cambiar contratos API ni lógica de datos.
2. No debe alterar Monday ni introducir dependencias de escritura hacia Monday.
3. No debe romper la altura base de 38 px usada por el fallback de virtualización.
4. Los overrides se aplican al final del cascade para evitar refactors destructivos de decenas de hojas existentes.
5. Cada cambio visual estructural debe preservar focus visible y semántica accesible.
6. Producción no se modifica mientras la PR #6 permanezca Draft.

## Estado de paridad global

La paridad funcional principal permanece cerrada en código. La **base de paridad visual / look & feel del alcance auditado está implementada en código**: shell/tabla, jerarquía lateral, edición inline del header, pickers/Updates, editor rico/menciones/adjuntos, Gantt, Files, lifecycle, Backup/Recovery, responsive conservador, estados globales, drag/resize y comportamiento base de popovers.

El último HEAD funcional de esta tanda, `542560f2a9e3c1e1750b0d4f15c8978168090adf`, pasó las dos puertas de CI el 2026-08-26.

Esto todavía no equivale a “100% visual verificado”. El cierre depende de ejecutar la checklist comparativa en navegador real y corregir las diferencias que esa observación revele. Hasta entonces New Monday permanece visualmente en fase de QA y la PR #6 continúa Draft.
