$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$recordPath = Join-Path $projectRoot 'data\dev-processes.json'
if (-not (Test-Path -LiteralPath $recordPath)) { Write-Output 'No Genesis process record'; exit 0 }
$record = Get-Content -LiteralPath $recordPath -Raw | ConvertFrom-Json
if ($record.root -ne $projectRoot) { throw 'Process record belongs to another workspace' }
foreach ($name in @('api','worker','web')) {
    $processId = [int]$record.$name
    $process = Get-CimInstance Win32_Process -Filter "ProcessId=$processId" -ErrorAction SilentlyContinue
    if ($process) {
        $expected = switch ($name) { 'api' { 'genesis.api:app' } 'worker' { 'genesis.worker' } 'web' { 'node_modules/vite/bin/vite.js' } }
        if ($process.CommandLine -notlike "*$expected*") { throw "PID $processId no longer matches the recorded Genesis process" }
        Stop-Process -Id $processId -ErrorAction Stop
    }
}
Remove-Item -LiteralPath $recordPath
Write-Output 'Genesis processes stopped'
