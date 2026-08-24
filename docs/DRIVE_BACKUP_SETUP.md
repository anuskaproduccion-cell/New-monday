# New Monday — respaldo automático en Google Drive

## Objetivo

Mantener en la carpeta `NEW MONDAY` de Google Drive:

- `NEW_MONDAY_BACKUP.xlsx`: copia operativa más reciente.
- `NEW_MONDAY_BACKUP_YYYY-MM-DD.xlsx`: snapshot diario, una vez por día.

El contenido se genera exclusivamente desde la base de datos de New Monday. Monday original no recibe ninguna escritura.

## Seguridad

La sincronización utiliza una cuenta de servicio de Google independiente. La carpeta `NEW MONDAY` se comparte únicamente con el correo de esa cuenta de servicio. Las credenciales JSON no se guardan en GitHub ni en Drive: deben almacenarse como variables secretas de Render.

Variables necesarias:

- `GOOGLE_DRIVE_FOLDER_ID`: ID de la carpeta `NEW MONDAY`.
- `GOOGLE_SERVICE_ACCOUNT_JSON`: JSON completo de la cuenta de servicio (también se admite en base64).
- `MONGODB_URI`: conexión de New Monday ya existente en Render.

## Ejecución

El comando del repositorio es:

```bash
npm run sync:drive-backup
```

El comando hace lo siguiente:

1. conecta a MongoDB de New Monday;
2. genera el Excel operativo con IDs técnicos y línea base de recuperación;
3. crea o reemplaza `NEW_MONDAY_BACKUP.xlsx` en la carpeta configurada;
4. crea el snapshot del día si todavía no existe;
5. desconecta de MongoDB;
6. registra `mondayWriteOperations: 0`.

## Programación recomendada en Render

Crear un Cron Job separado del servicio web y ejecutar el comando de sincronización. El cron debe usar las mismas variables de MongoDB y las credenciales de Drive, pero no necesita `MONDAY_API_TOKEN` porque el respaldo parte de New Monday, no de Monday.

Frecuencia recomendada inicial: una vez cada hora mientras la herramienta esté en uso. El archivo actual se reemplaza; el snapshot histórico se crea solo una vez por fecha.

## Requisito antes de activar

Antes de crear el Cron Job hay que probar manualmente el comando contra una base de prueba y comprobar en Drive que:

- el archivo actual aparece en la carpeta correcta;
- el snapshot aparece una sola vez;
- el Excel abre correctamente;
- el preview de recuperación reconoce el archivo generado;
- no se modifica Monday original.
