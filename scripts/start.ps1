param([switch]$Install, [switch]$SeedDemo)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot
$pythonExe = Join-Path $projectRoot '.venv\Scripts\python.exe'
if ($Install) {
    if (-not (Test-Path -LiteralPath $pythonExe)) { python -m venv .venv }
    & $pythonExe -m pip install -r requirements.txt
    if ($LASTEXITCODE -ne 0) { throw 'Python installation failed' }
    Push-Location apps/web
    try { npm.cmd ci; if ($LASTEXITCODE -ne 0) { throw 'Frontend installation failed' } }
    finally { Pop-Location }
}
if (-not (Test-Path -LiteralPath $pythonExe)) { throw 'Run scripts/start.ps1 -Install first' }
$env:PYTHONPATH = Join-Path $projectRoot 'services'
New-Item -ItemType Directory -Path (Join-Path $projectRoot 'data') -Force | Out-Null
if ($SeedDemo) {
    & $pythonExe -m genesis.worker --seed-demo
    if ($LASTEXITCODE -ne 0) { throw 'Fixture seeding failed' }
}
$recordPath = Join-Path $projectRoot 'data\dev-processes.json'
if (Test-Path -LiteralPath $recordPath) { throw 'Process record exists. Stop this project with scripts/stop.ps1 before starting it again.' }
$apiProcess = Start-Process -FilePath $pythonExe -ArgumentList @('-m','uvicorn','genesis.api:app','--host','127.0.0.1','--port','8000','--no-access-log') -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput 'data/api.log' -RedirectStandardError 'data/api-error.log'
$workerProcess = Start-Process -FilePath $pythonExe -ArgumentList @('-m','genesis.worker') -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput 'data/worker.log' -RedirectStandardError 'data/worker-error.log'
$nodeExe = (Get-Command node -ErrorAction Stop).Source
$webProcess = Start-Process -FilePath $nodeExe -ArgumentList @('node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5173','--strictPort') -WorkingDirectory (Join-Path $projectRoot 'apps/web') -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $projectRoot 'data/web.log') -RedirectStandardError (Join-Path $projectRoot 'data/web-error.log')
@{ root=$projectRoot; api=$apiProcess.Id; worker=$workerProcess.Id; web=$webProcess.Id } | ConvertTo-Json | Set-Content -LiteralPath $recordPath
Write-Output 'Genesis: http://127.0.0.1:5173 | API: http://127.0.0.1:8000/docs'
