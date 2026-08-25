# New Monday · auditoría viva de paridad con Monday

Fecha: 2026-08-25

Regla absoluta: Monday se consulta en solo lectura. Toda interacción nueva se implementa únicamente en New Monday.

## Patrón de referencia inmediato

Tablero Monday: `MQFR_POST` (`5097801091`).

Esquema real observado: Name, Person, Status, Cronograma, Fórmula, Dependencia Strict (varias dependencias permitidas), Reloj mundial, Solape Weeks y Subitems. Vistas: Gantt + un `FeatureBoardView` interno llamado `Crear la Vista Vibe` (`monday-vibe-app`).

## Corregido / implementado en PR #5

- [x] Cabecera de grupo más próxima a Monday.
- [x] Renombrado inline de grupos.
- [x] Paleta de 18 colores de grupo.
- [x] Duplicar grupo con elementos y subitems.
- [x] Crear grupo desde menú y final del tablero.
- [x] Cronograma compacto tipo batería; editor emergente Inicio/Fin; hitos.
- [x] Evitar `ƒ null` en Fórmula.
- [x] Ocultar la columna técnica `name` cuando duplica la columna principal Elemento.
- [x] `+` al final de las cabeceras para crear columnas.
- [x] Personas: celda compacta + selector emergente.
- [x] Vistas: ocultar `FeatureBoardView`/Vibe internos; mostrar solo vistas operativas.
- [x] Vistas: eliminar Cronograma local duplicado y utilidades de la tira de vistas.
- [x] Vistas: `+` real para crear Tabla, Gantt, Progreso o Gráfico.
- [x] Utilidades New Monday (Equipo, Actividad, Archivo, Papelera) movidas a menú separado.
- [x] Dependencias: selector múltiple compatible con `allowMultipleItems:true` y modo Strict.
- [x] Subitems: la celda permite abrir y crear subitems sin salir de la tabla.

## Diferencias todavía visibles / funcionales

### Prioridad alta

- [ ] Redimensionar ancho de columnas arrastrando, como en Monday, y conservar el ancho.
- [ ] Menú de columna más fiel: ordenar, filtrar, descripción/info, ocultar, duplicar, borrar/configurar según permisos.
- [ ] Fecha: sustituir `<input type=date>` permanente por celda compacta + selector emergente.
- [ ] Dropdown: sustituir `<select>` nativo por chips y selector múltiple.
- [ ] Estado: editor de etiquetas/colores más parecido a Monday y menú contextual desde la celda.
- [ ] Dependencias: representación visual de múltiples vínculos y mensajes de conflicto/ciclo más claros.
- [ ] Subitems: edición completa de sus celdas en línea y creación de múltiples subitems consecutivos.
- [ ] Gantt: escala semanal/mensual, encabezados de meses/semanas, zoom, mejor tratamiento de hitos y dependencias visuales.
- [ ] Vistas: menú `⋯/▾` por vista para renombrar, duplicar, borrar y ordenar directamente desde la pestaña.
- [ ] Barra de vistas: comportamiento responsive/overflow más próximo a Monday cuando hay muchas vistas reales.

### Prioridad media

- [ ] Resúmenes al pie de grupo/columna (conteos, sumas, estado/progreso cuando aplique).
- [ ] Columna Archivo: carga real de archivos a New Monday, no solo visualización de metadatos importados.
- [ ] Reloj mundial: selector de zona horaria/city picker en vez de `prompt()`.
- [ ] Enlace/Email: presentación compacta y editor emergente en vez de input permanente.
- [ ] Board Relation: picker con búsqueda, selección múltiple cuando esté habilitada y mejores chips.
- [ ] Mirror: presentación según el tipo de la columna reflejada (estado/persona/etc.), no solo texto plano.
- [ ] Item updates: panel lateral/indicador de actualizaciones más cercano al flujo de Monday.
- [ ] Menú de elemento: completar acciones y jerarquía visual de Monday.
- [ ] Creación de elemento directamente desde la fila “Agregar elemento”, sin modal obligatorio.
- [ ] Renombrado del tablero inline y menú de tablero.
- [ ] Sidebar/workspace: jerarquía, favoritos, búsqueda y menús más próximos a Monday.

### Paridad de interacción y accesibilidad

- [ ] Selección de filas/celdas y hover más fieles visualmente.
- [ ] Menús contextuales cerrándose/recolocándose correctamente en scroll horizontal/vertical.
- [ ] Navegación teclado en selectores emergentes.
- [ ] Estados de carga/guardado por celda en vez de toast global para cada cambio.
- [ ] Undo/redo local para ediciones recientes.

## Criterio de cierre

Una diferencia se marca como cerrada solo cuando:
1. funciona sobre datos reales importados;
2. no escribe nada en Monday;
3. pasa tests/sintaxis/audit de dependencias;
4. no degrada backup Excel ni recuperación;
5. se valida visualmente antes de fusionar a `main`.
