$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')
python scripts/package.py @args
if ($LASTEXITCODE) { exit $LASTEXITCODE }
