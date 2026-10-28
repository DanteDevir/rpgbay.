$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')
if (!(Test-Path '.env')) { Copy-Item '.env.example' '.env' }
Get-Content '.env' | ForEach-Object { if ($_ -match '^([A-Za-z_][A-Za-z0-9_]*)=(.*)$') { [Environment]::SetEnvironmentVariable($Matches[1], $Matches[2], 'Process') } }
if (!(Test-Path 'node_modules')) { npm ci; if ($LASTEXITCODE) { exit $LASTEXITCODE } }
docker compose -f compose.dev.yaml up -d --wait
if ($LASTEXITCODE) { exit $LASTEXITCODE }
npm run db:migrate
if ($LASTEXITCODE) { exit $LASTEXITCODE }
npm run db:seed
if ($LASTEXITCODE) { exit $LASTEXITCODE }
Write-Host 'Em outro terminal com as mesmas variáveis: npm run start:api'
npm run dev
