param()
$projectDir = "C:\Users\Joel\Desktop\crm consultas\dashboard_node"
$backupDir = Join-Path $projectDir "backups"
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$backupPath = Join-Path $backupDir "backup_$timestamp"

New-Item -ItemType Directory -Path $backupPath -Force | Out-Null

Copy-Item (Join-Path $projectDir "server.js") (Join-Path $backupPath "server.js")
Copy-Item (Join-Path $projectDir "public\index.html") (Join-Path $backupPath "index.html")
Copy-Item (Join-Path $projectDir ".env") (Join-Path $backupPath ".env") -ErrorAction SilentlyContinue
Copy-Item (Join-Path $projectDir "db.js") (Join-Path $backupPath "db.js") -ErrorAction SilentlyContinue
Copy-Item (Join-Path $projectDir "package.json") (Join-Path $backupPath "package.json") -ErrorAction SilentlyContinue

Write-Host "BACKUP_CREADO:$backupPath"
