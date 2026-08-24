# New Monday — baseline de origen para STAGING

Fecha: 2026-08-24

## Política

**Monday se consulta exclusivamente en modo lectura. No se ha ejecutado ninguna mutación.**

Este documento fija la línea base del origen que deberá reproducir la primera importación STAGING. Si los conteos o estructuras de STAGING no coinciden con esta línea base, la promoción debe quedar bloqueada.

## Conteos del origen

Consulta paginada de todos los tableros accesibles y lectura de items/subitems:

- Workspaces devueltos directamente por `workspaces`: **11**
- Workspaces adicionales detectados únicamente a través de referencias `board.workspace`: **6**
- Jerarquía total de workspaces que New Monday debe preservar: **17**
- Tableros accesibles totales: **103**
- Tableros visibles/operativos: **55**
- Tableros internos `Subelementos de ...`: **48**
- Items de primer nivel en tableros visibles: **1230**
- Subitems: **413**

Los seis workspaces adicionales son `_DESARROLLO`, `_POST`, `_EDITING`, `_EDITING ASSISTANCE`, `_SHOOTING` y `_PRE&PROD`. Monday no los devuelve en la consulta normal de workspaces, pero sí aparecen como workspace real de tableros accesibles. Por ello New Monday debe reconstruirlos como workspaces técnicos para no dejar esos tableros huérfanos.

Los 48 tableros internos de subelementos no deben mostrarse como fases independientes en New Monday; sus datos se reconstruyen como subitems anidados.

## Tipos de columna del origen

Frecuencia encontrada en los 55 tableros visibles:

| Tipo | Columnas |
| --- | ---: |
| name | 55 |
| text | 85 |
| numbers | 7 |
| date | 9 |
| people | 51 |
| status | 90 |
| timeline | 33 |
| formula | 19 |
| dependency | 23 |
| world_clock | 26 |
| subtasks | 48 |
| file | 15 |
| board_relation | 9 |
| mirror | 9 |
| dropdown | 2 |
| link | 1 |
| email | 3 |

**Tipos encontrados sin soporte en el motor v2 actual: 0.**

## Dependencias

- Columnas Dependency: **23**
- `dependency_mode: strict`: **19**
- Sin modo explícito (`null`): **4**
- `flexible`: **0**

Consecuencia: el motor `strict` cubre el comportamiento operativo observado actualmente. Las cuatro dependencias sin modo explícito deben conservar la relación sin aplicar cascada automática. No es necesario implementar `flexible` para la primera migración porque no aparece en los tableros actuales auditados.

## Fórmulas

- Columnas Formula: **19**
- Patrones de texto distintos: **2**
- Ambos son la misma lógica con IDs de columnas diferentes: `MAX(ROUNDDOWN(WORKDAYS(Timeline End, Timeline Start) / 5, 0) - Solape, 0)`.

Consecuencia: el motor local de fórmula existente cubre todas las fórmulas encontradas en la cuenta auditada.

## Relaciones y Mirror

- Columnas `board_relation`: **9**
- Columnas `mirror`: **9**
- Las nueve relaciones auditadas son de un solo elemento (`allowMultipleItems: false`).
- Los nueve Mirrors usan `relation_column` + `displayed_linked_columns` y reflejan una columna del tablero conectado.

El módulo relacional v2 conserva ese formato de settings y además admite relaciones locales simples o múltiples dentro de New Monday.

## Tableros de carga alta que deben probarse expresamente

- `🌋 EREBUS_LOWRES FILES MEDIA METADATA`: 125 items.
- `MEOTLE_SHOOTING`: 119 items + 102 subitems.
- `MQFR_SHOOTING`: 92 items + 116 subitems.
- `MEOTLE_EDITING ASSISTANCE`: 102 items.
- `SOFIA_EDITING ASSISTANCE`: 75 items.
- `MQFR_EDITING ASSISTANCE`: 75 items.

Estos tableros se usarán como casos de estrés para comprobar paginación, orden y conservación de valores.

## Criterio de aceptación de la primera STAGING real

La auditoría debe dar simultáneamente:

1. 17 workspaces preservados: 11 directos + 6 técnicos descubiertos por referencias de tablero.
2. 103 tableros totales.
3. 55 tableros visibles.
4. 48 tableros internos de subitems.
5. 1230 items de primer nivel.
6. 413 subitems.
7. 0 tipos de columna desconocidos.
8. Fingerprint de esquema correcto por tablero.
9. Fingerprint de datos correcto por cada tablero visible.
10. Ningún tablero con `workspaceRef` huérfano después de la promoción de prueba.
11. 0 escrituras en Monday.
12. 0 cambios en `main` o en la producción de New Monday durante la prueba.

Si cualquiera de estos puntos falla, STAGING no se promociona.
