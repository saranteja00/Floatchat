param([ValidateSet('all', 'api', 'web')][string]$Service = 'all')
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$python = Join-Path $projectRoot '.venv\Scripts\python.exe'
$node = (Get-Command node -ErrorAction Stop).Source
$vite = Join-Path $projectRoot 'frontend\node_modules\vite\bin\vite.js'
if ($Service -eq 'api') {
    Set-Location $projectRoot
    & $python -m uvicorn backend.main:app --host 127.0.0.1 --port 8017
    exit $LASTEXITCODE
}
if ($Service -eq 'web') {
    Set-Location (Join-Path $projectRoot 'frontend')
    & $node $vite --host 127.0.0.1
    exit $LASTEXITCODE
}
$logs = Join-Path $projectRoot 'artifacts'
New-Item -ItemType Directory -Force -Path $logs | Out-Null
foreach ($port in @(8017, 5177)) {
    $probe = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $port)
    try { $probe.Start() } catch { throw "Port $port is already in use. Stop the previous FloatChat session or use a different port." } finally { $probe.Stop() }
}
$apiProcess = Start-Process -FilePath $python -ArgumentList '-m uvicorn backend.main:app --host 127.0.0.1 --port 8017' -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $logs 'api.log') -RedirectStandardError (Join-Path $logs 'api-error.log')
$webProcess = Start-Process -FilePath $node -ArgumentList ('"' + $vite + '" --host 127.0.0.1') -WorkingDirectory (Join-Path $projectRoot 'frontend') -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $logs 'web.log') -RedirectStandardError (Join-Path $logs 'web-error.log')
Write-Output "FloatChat: http://127.0.0.1:5177"
Write-Output "API: http://127.0.0.1:8017/docs"
Write-Output "Process IDs: API=$($apiProcess.Id), web=$($webProcess.Id). Stop these processes when finished."
