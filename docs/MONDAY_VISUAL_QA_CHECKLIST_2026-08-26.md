# New Monday · checklist de QA visual comparativa · 2026-08-26

Regla absoluta: **Monday se usa únicamente como referencia visual en solo lectura. Toda modificación se realiza exclusivamente en New Monday.**

## Objetivo

Esta checklist define el cierre de la paridad visual dentro del alcance operativo auditado. El código visual puede considerarse estructuralmente completo antes de esta revisión, pero **New Monday no se marcará como visualmente cerrado hasta revisar estos estados en navegador real**.

La comparación busca coherencia de lenguaje visual, densidad, jerarquía y respuesta de interacción. No exige copiar recursos gráficos propietarios ni módulos que no formen parte del alcance de New Monday.

## 1. Shell y navegación

- [ ] Sidebar: ancho, densidad, contraste y jerarquía visual coherentes.
- [ ] Brand y workspace switcher alineados y sin saltos de altura.
- [ ] Buscar tablero: hover, focus y placeholder visibles.
- [ ] Tableros normales, favoritos, recientes y carpetas: active/hover/focus claramente diferenciados.
- [ ] Carpetas contraídas/expandidas sin cambios de alineación inesperados.
- [ ] `Shift+F10` para mover tablero mantiene foco visual al volver.
- [ ] Herramientas Backup/Recovery integradas visualmente en el sidebar oscuro.

## 2. Board header y vistas

- [ ] Icono, título, favorito y descripción tienen jerarquía similar y compacta.
- [ ] Renombrado inline no cambia bruscamente altura o ancho.
- [ ] Búsqueda global y botón Nuevo elemento comparten altura visual.
- [ ] Tabs de vistas: active/hover/focus consistentes.
- [ ] Menú `Más` mantiene la vista activa visible en ancho reducido.
- [ ] Menú contextual de una vista aparece alineado con su ancla.
- [ ] Cambio entre tabla/Gantt/Files/Activity no produce saltos visuales del shell.

## 3. Tabla principal

- [ ] Cabeceras y filas mantienen densidad objetivo de 38 px base.
- [ ] Separadores verticales/horizontales son sutiles y consistentes.
- [ ] Columna Elemento y columnas fijadas conservan sticky sin diferencias de fondo.
- [ ] Hover de fila no oculta colores/status/chips.
- [ ] Selección de fila/celda es visible sin dominar el contenido.
- [ ] Focus visible se distingue de hover y selección.
- [ ] Add item row tiene presencia discreta y clara.
- [ ] Menús de grupo/columna/item no cortan el contenido ni quedan fuera de viewport.
- [ ] Resize/reorder de columnas no deja artefactos visuales.
- [ ] Resúmenes de grupo mantienen alineación con sus columnas.

## 4. Grupos y subitems

- [ ] Color de grupo se percibe como acento, no como bloque pesado.
- [ ] Nombre, contador, flecha y menú de grupo alineados.
- [ ] Grupo contraído conserva resumen legible.
- [ ] Subitems expandidos se distinguen sin parecer otra tabla independiente.
- [ ] Expandir/contraer subitems no produce salto de scroll apreciable.
- [ ] Virtualización conserva altura/posición al sacar un item expandido del DOM.

## 5. Tipos de columna y pickers

- [ ] Status: pill, menú y editor de labels coherentes.
- [ ] People: avatares, overflow, picker y búsqueda coherentes.
- [ ] Date/Timeline: display compacto y editor claramente conectado a la celda.
- [ ] Dropdown: chips, overflow y picker consistentes.
- [ ] Dependency: chips, búsqueda, selección múltiple y jerarquía de item/grupo legibles.
- [ ] Relation/Mirror: chips y picker multi-board legibles y compactos.
- [ ] World Clock: ciudad, hora, estado laboral y picker alineados.
- [ ] Files: chips/acciones no fuerzan altura anómala de fila.
- [ ] Email/Link: lectura y edición no parecen inputs permanentes cuando están cerrados.

## 6. Menús, popovers y modales

- [ ] Todos comparten radios, borde, sombra y padding.
- [ ] Menús adoptan foco inicial correctamente sin parpadeo visual.
- [ ] `↑/↓`, Inicio/Fin y Escape se reflejan con foco visible.
- [ ] Modal abre con foco dentro y fondo visualmente subordinado.
- [ ] `Tab`/`Shift+Tab` no muestran foco detrás del modal.
- [ ] Al cerrar modal/menu el foco vuelve al ancla visible.
- [ ] Menús próximos al borde se reposicionan sin cortar opciones.

## 7. Updates

- [ ] Drawer entra sin desplazar el board de forma inesperada.
- [ ] Header y tabs del drawer mantienen densidad coherente.
- [ ] Composer: toolbar + textarea se leen como una sola unidad.
- [ ] Botones de formato tienen hover/focus claros.
- [ ] Menciones tienen contraste suficiente y no rompen línea de forma extraña.
- [ ] Picker de menciones se integra con el resto de pickers.
- [ ] Adjuntos pendientes y publicados usan el mismo lenguaje de chips/cards.
- [ ] Update cards y replies tienen jerarquía clara sin exceso de cajas.
- [ ] Respuestas largas, enlaces, código, citas y listas no desbordan.
- [ ] Drawer a 720 px y menos ocupa ancho completo sin cortes.

## 8. Guardado y estados de sistema

- [ ] `Guardando…` es discreto y no tapa el contenido de la celda.
- [ ] `✓` desaparece/permanece el tiempo esperado sin generar salto.
- [ ] `!` de error destaca suficientemente.
- [ ] Estado En vivo / Reconectando / Sin conexión encaja en el header.
- [ ] Loading, empty y connection error usan jerarquía visual coherente.
- [ ] Reduced motion elimina animaciones prescindibles sin romper layout.

## 9. Gantt

- [ ] Controles, zoom y configuración tienen geometría común al resto del producto.
- [ ] Left pane y calendario se perciben como una sola vista.
- [ ] Header temporal, fines de semana y cambio de mes son legibles pero sutiles.
- [ ] Barras, milestones y dependencias se distinguen con claridad.
- [ ] Hover de fila conecta visualmente label y track.
- [ ] Línea Hoy destaca sin competir con las barras.
- [ ] Zoom Día/Semana/Mes no rompe alineación.
- [ ] Agrupación Grupo/Estado/Persona/Sin agrupación mantiene densidad.
- [ ] Dependencias largas y múltiples no producen líneas ilegibles o recortadas.
- [ ] Drag/resize muestra feedback visual estable.

## 10. Files Gallery

- [ ] Grid y List comparten la misma jerarquía de información.
- [ ] Nombres largos eliden correctamente.
- [ ] Imágenes, PDF, enlaces y archivos sin preview mantienen cards coherentes.
- [ ] Hover/open action es claro sin exceso de sombra.
- [ ] Preview no cambia abruptamente el lenguaje visual.
- [ ] Estado vacío se integra con otras vistas vacías.
- [ ] Storage/orphan review conserva jerarquía y alertas claras.

## 11. Activity / Archive / Trash

- [ ] Headers, conteos y descripciones tienen jerarquía consistente.
- [ ] Activity mantiene ritmo vertical legible con muchos eventos.
- [ ] Archive/Trash cards no parecen más pesadas que una fila normal.
- [ ] Restaurar/Desarchivar es visible sin convertirse en CTA dominante.
- [ ] Empty state mantiene lenguaje visual común.

## 12. Backup / Recovery

- [ ] Herramientas del sidebar se ven integradas en navegación.
- [ ] Modal, encabezado y acciones son consistentes con otros modales.
- [ ] Warning y policy son distinguibles sin saturación.
- [ ] Summary cards mantienen densidad compacta.
- [ ] Conflictos largos no desbordan.
- [ ] Campo de confirmación tiene focus/error claros.
- [ ] Responsive del modal funciona a 700 px y menos.

## 13. Tableros grandes / virtualización

- [ ] >260 items: scroll visualmente estable.
- [ ] No hay saltos perceptibles al cambiar ventana virtual.
- [ ] Alturas medidas con subitems expandidos mantienen continuidad.
- [ ] Sticky headers/pinned columns no parpadean al virtualizar.
- [ ] Selección y focus sobreviven a filas que salen/entran del DOM.
- [ ] Copiar/pegar y Shift-rango muestran feedback consistente al cruzar ventana.

## 14. Realtime en dos sesiones

- [ ] Cambio en sesión A aparece en B sin flash/reconstrucción innecesaria del shell.
- [ ] Sesión A no se repinta redundantemente en mutaciones eco-seguras.
- [ ] Reordenado/duplicado actualiza correctamente ambas sesiones.
- [ ] Editar simultáneamente no roba foco ni tapa un editor activo.
- [ ] Reconexión conserva scroll/vista y muestra estado de conexión correcto.

## 15. Responsive

Revisar al menos:

- [ ] Desktop ancho ≥1440 px.
- [ ] Desktop estándar 1280 px.
- [ ] Desktop estrecho 1024 px.
- [ ] Tablet 900/768 px.
- [ ] Mobile 720/520 px para drawers/modales/pickers soportados.

En cada ancho:

- [ ] No hay scroll horizontal del shell salvo donde sea intencional (tabla/Gantt).
- [ ] Tabs usan overflow correctamente.
- [ ] Pickers permanecen dentro del viewport.
- [ ] Modales/drawers no pierden botones de acción.
- [ ] Sidebar y contenido no se superponen.

## Criterio de cierre

La paridad visual se considera cerrada solo cuando:

1. No quedan diferencias visuales de severidad alta en el alcance auditado.
2. Diferencias medias restantes están documentadas y aceptadas o corregidas.
3. Focus/teclado/accesibilidad no han retrocedido por el polish visual.
4. Virtualización y realtime conservan estabilidad visual.
5. Los dos workflows de CI permanecen verdes en el commit final.
6. La PR #6 recibe un corte final de revisión antes de salir de Draft.
