# New Monday — release checkpoint PR #6

Fecha: 2026-08-26

Este archivo documenta el corte pre-publicación de la PR #6. No modifica lógica de aplicación, datos, configuración de producción ni integración con Monday.

## Alcance del corte

- Realtime dirigido, batching, reconexión y protección frente a mutaciones locales.
- Relation/Mirror realtime entre tableros.
- Virtualización, teclado y accesibilidad para tableros grandes.
- Paridad visual Monday-like por capas, responsive y estados de interacción.
- Ordering de items, grupos y columnas protegido frente a navegación durante peticiones.
- Reconciliación A→B para mutaciones eco-seguras relacionadas mediante Relation/Mirror.
- Cambios tardíos de nombre, descripción y workspace ya no pueden robar la navegación activa.

## Seguridad

- Monday permanece estrictamente en solo lectura.
- No se ejecuta seed destructivo.
- No se realizan escrituras directas en MongoDB de producción desde esta rama.
- La PR permanece Draft hasta completar la validación del corte.

## Backup pre-publicación

- Rama Git de restauración: `backup/pre-publish-2026-08-26-post-publish-qa`.
- Carpeta Drive: `BACKUP_NEW_MONDAY_2026-08-26_PRE_PUBLICACION_PR6`.
- La rama de backup se actualizará al SHA de este commit documental antes del merge.

## Publicación

Publicar únicamente después de que `New Monday v2 validation` y `New Monday group and timeline parity validation` terminen correctamente sobre este corte.
