# Backup antes de cada cambio

Cada vez que se planee un cambio en el proyecto, se debe ejecutar el script de backup automático **antes de modificar cualquier archivo**.

## Cómo crear un backup

Ejecutar desde PowerShell:

```powershell
C:\Users\Joel\Desktop\crm consultas\dashboard_node\backups\create-backup.ps1
```

O desde Node:

```js
require('child_process').execSync('powershell -File "C:\\Users\\Joel\\Desktop\\crm consultas\\dashboard_node\\backups\\create-backup.ps1"');
```

## Qué archivos se respaldan

- `server.js`
- `public/index.html`
- `.env` (si existe)
- `db.js` (si existe)
- `package.json` (si existe)

## Dónde se guardan

`dashboard_node/backups/backup_YYYYMMDD_HHmmss/`

Cada backup es una carpeta con timestamp. Para restaurar, copiar los archivos de vuelta al proyecto.

## Restaurar un backup

```powershell
Copy-Item "backups/backup_20260603_120000/server.js" "server.js"
Copy-Item "backups/backup_20260603_120000/index.html" "public/index.html"
```
