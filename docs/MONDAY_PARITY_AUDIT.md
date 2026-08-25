# New Monday — Auditoría de paridad con Monday

Fecha: 2026-08-24

## Regla inmutable

**Monday se estudia y se lee, pero no se modifica nunca.**

Monday es exclusivamente:
- referencia funcional y visual;
- origen de la migración inicial;
- fuente de comprobación durante la auditoría.

New Monday nunca debe escribir, renombrar, mover, crear, borrar, archivar ni actualizar ningún dato en Monday. Cualquier integración de importación con Monday debe ser estrictamente de solo lectura.

## Objetivo de New Monday

New Monday debe reproducir la forma de trabajar de Monday, no limitarse a copiar datos. La paridad incluye estructura, interacciones, lógica de columnas, vistas, subelementos, dependencias, duplicación, edición, ordenación, movimiento y recuperación.

## Inventario real de la cuenta de Monday

Auditoría paginada de solo lectura mediante GraphQL QUERY:

- 103 tableros accesibles en total.
- 55 tableros visibles/operativos.
- 48 tableros internos `Subelementos de ...`.
- Los tableros internos de subelementos son una implementación de Monday y **no deben aparecer como fases independientes** en New Monday.
- Los subelementos deben mostrarse anidados bajo su elemento padre.

La cuenta contiene además workspaces técnicos con nombres `_DESARROLLO`, `_EDITING`, `_EDITING ASSISTANCE`, `_POST`, `_PRE&PROD` y `_SHOOTING`. Se marcan como candidatos a plantillas/infraestructura y no deben tratarse automáticamente como películas hasta clasificarlos.

## Tipos de columna encontrados en datos reales

La auditoría ha identificado estos tipos que New Monday debe soportar dinámicamente:

1. `name`
2. `text`
3. `numbers`
4. `date`
5. `people`
6. `status`
7. `timeline`
8. `formula`
9. `dependency`
10. `world_clock`
11. `subtasks`
12. `file`
13. `board_relation`
14. `mirror`
15. `dropdown`
16. `link`
17. `email`

Esto invalida una tabla de columnas fija. Cada tablero debe conservar su propio esquema de columnas, orden, títulos, tipos, configuración y valores.

## Evidencia funcional observada en GY_POST

### Duplicación de elemento

La actividad real muestra:
- `Editing` fue renombrado a `1º Editing`.
- se duplicó el elemento;
- Monday creó `1º Editing (copy)` con `is_duplicate: true`;
- la copia heredó valores como Estado, Solape Weeks y Cronograma;
- después la copia se renombró a `2º Editing`.

Conclusión: New Monday debe duplicar un elemento como una copia real de sus valores, no crear simplemente una fila vacía con el mismo nombre.

### Renombrado de grupo

La actividad real muestra que al cambiar el nombre de un grupo:
- se conserva el mismo `group_id`;
- se conserva el color del grupo;
- cambia únicamente el nombre.

Conclusión: el grupo debe ser una entidad estable con ID, nombre, color y orden. No puede depender de guardar el nombre del grupo como texto dentro de cada item.

### Dependencias estrictas

`GY_POST` usa una columna Dependencia configurada con `dependency_mode: strict`.

La actividad demuestra cascadas de cambios de Cronograma: varios elementos dependientes reciben nuevas fechas con el mismo `changed_at` después de desplazar una tarea anterior.

Conclusión: New Monday debe implementar un grafo de dependencias. Cambiar fechas desde la tabla o arrastrar/redimensionar una barra del Gantt debe recalcular y desplazar automáticamente las tareas dependientes según el modo configurado.

### Fórmula

La fórmula real de `GY_POST` se calcula a partir del Cronograma y Solape Weeks. Por tanto, Fórmula es un valor calculado, no un número editable manualmente.

### Relaciones y espejo

`GY_EDITING ASSISTANCE` contiene:
- columna `board_relation` hacia `GY_SHOOTING`;
- columna `mirror` que muestra `Frame I.O` desde el tablero relacionado.

Conclusión: New Monday debe conservar relaciones entre tableros y calcular/mostrar valores espejo.

### Esquemas específicos por fase

Ejemplos reales:
- `GY_SHOOTING`: múltiples columnas Estado independientes (`Raid A`, `Raid B`, `Raid C`, `Frame I.O`, `Shared Drive`) y `Fecha`.
- `MQFR_VFX`: Dropdown (`FPS`, `Lens`), Archivo (`Still`), Enlace, varios Estados y metadatos VFX.
- `EREBUS_LOWRES FILES MEDIA METADATA`: tabla de 125 items con más de 20 columnas técnicas.

Conclusión: New Monday debe ser un motor de tableros dinámicos, no una interfaz especial para GY_POST.

## Situación actual de New Monday antes de v2

### Modelo actual de Board
- workspace es un string;
- no existe entidad Workspace;
- no guarda grupos, columnas ni vistas como estructuras configurables.

### Modelo actual de Item
- campos fijos: person, status, startDate, endDate, dependency, formula, notes, etc.;
- group es un string;
- subitems tienen un esquema fijo y limitado;
- no existe `columnValues` dinámico.

### Frontend actual
- columnas fijas en la tabla;
- estados fijos;
- Fórmula editable manualmente;
- dependencia guardada por nombre;
- Gantt mueve únicamente el item editado;
- vistas limitadas a Tabla/Gantt/Equipo;
- sin menú completo de item/grupo/columna/tablero;
- sin mover/reordenar por drag & drop;
- sin duplicación completa;
- sin archivo/papelera/restauración;
- sin columnas dinámicas;
- sin board relation/mirror/file/dropdown/link/email;
- sin navegación real por workspace/película.

## Arquitectura objetivo v2

### Workspace
Entidad persistente para película/área/plantilla con:
- ID interno;
- `mondayId` de origen;
- nombre;
- descripción;
- orden;
- clasificación (`film`, `operations`, `template`, `technical`);
- archivado.

### Board
Entidad persistente con:
- ID interno;
- `mondayId` de origen;
- workspace real;
- nombre/icono/orden;
- grupos con ID estable, nombre, color y orden;
- columnas dinámicas con ID, título, tipo, settings y orden;
- vistas con ID, nombre, tipo, filtros, sort y settings;
- flags de tablero técnico/interno;
- archivado.

### Item
Entidad persistente con:
- ID interno;
- `mondayId` de origen;
- board;
- `groupId`;
- nombre;
- orden;
- `columnValues` dinámico;
- padre/subitem;
- archivado/papelera;
- metadatos de origen.

## Matriz de paridad prioritaria

### P0 — motor de datos
- [ ] Workspace real
- [ ] Board schema dinámico
- [ ] Grupos como entidades estables
- [ ] Columnas dinámicas
- [ ] Valores dinámicos por item
- [ ] Subitems anidados
- [ ] Fórmulas calculadas
- [ ] Dependencias estrictas en cascada
- [ ] Board relation + Mirror

### P1 — interacción Monday
- [ ] edición de celda por tipo
- [ ] renombrar item/grupo/columna/tablero
- [ ] duplicar item/grupo/columna/tablero
- [ ] drag & drop de items y grupos
- [ ] mover item entre grupos
- [ ] selección múltiple y acciones en lote
- [ ] archivar/papelera/restaurar
- [ ] ocultar/reordenar/fijar columnas
- [ ] ordenar y multi-ordenar
- [ ] filtros y búsqueda
- [ ] vistas guardadas como pestañas
- [ ] navegación por teclado y copiar/pegar

### P2 — tipos de columna reales
- [ ] Name
- [ ] Text
- [ ] Numbers
- [ ] Date
- [ ] People
- [ ] Status con labels propios por columna
- [ ] Timeline
- [ ] Formula
- [ ] Dependency
- [ ] World Clock
- [ ] Subtasks
- [ ] File
- [ ] Board Relation
- [ ] Mirror
- [ ] Dropdown
- [ ] Link
- [ ] Email

### P3 — colaboración
- [ ] Updates/comentarios
- [ ] respuestas
- [ ] actividad/historial
- [ ] archivos adjuntos

### P4 — continuidad operativa
- [ ] exportación Excel de emergencia
- [ ] historial de snapshots
- [ ] importación/restauración desde Excel
- [ ] detección de conflictos al recuperar cambios

## Política de importación desde Monday

1. Solo GraphQL `query` y endpoints de lectura.
2. Nunca ejecutar `mutation` contra Monday.
3. Guardar IDs de origen para trazabilidad, no para sincronización bidireccional.
4. Ejecutar la primera importación en modo staging.
5. Comparar conteos y estructuras antes de promover los datos.
6. Monday nunca recibe cambios procedentes de New Monday.

## Estrategia de desarrollo

Todo el desarrollo v2 se realiza en la rama `agent/monday-engine-v2`.

`main` y producción permanecen estables hasta que cada bloque esté validado. Ninguna mejora v2 se desplegará automáticamente durante la auditoría.