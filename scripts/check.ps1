$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot
& '.\.venv\Scripts\python.exe' -m pytest
if ($LASTEXITCODE -ne 0) { throw 'Python tests failed' }
& '.\.venv\Scripts\python.exe' -m ruff check services tests scripts
if ($LASTEXITCODE -ne 0) { throw 'Python lint failed' }
Push-Location apps/web
try {
    npm.cmd test
    if ($LASTEXITCODE -ne 0) { throw 'Frontend tests failed' }
    npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed' }
} finally { Pop-Location }
git diff --check
if ($LASTEXITCODE -ne 0) { throw 'Whitespace check failed' }
