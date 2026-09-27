param([string]$Model = 'openai/gpt-oss-20b')
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$pythonPath = Join-Path $projectRoot '.venv\Scripts\python.exe'
if (!(Test-Path -LiteralPath $pythonPath)) { throw 'Create the project Python environment first.' }

# Stop any process listening on port 8017 before prompting for key
$listeners = @(Get-NetTCPConnection -LocalPort 8017 -State Listen -ErrorAction SilentlyContinue)
foreach ($listener in $listeners) {
    try {
        Stop-Process -Id $listener.OwningProcess -Force -ErrorAction SilentlyContinue
    } catch {}
}
if ($listeners.Count) {
    Start-Sleep -Seconds 1
}

$keyInput = Read-Host 'Paste your NVIDIA API key (hidden; kept only for this session)' -AsSecureString
$keyPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($keyInput)
$previousKey = $env:NVIDIA_API_KEY
$previousProvider = $env:FLOATCHAT_AI_PROVIDER
$previousModel = $env:NVIDIA_MODEL
try {
    $env:NVIDIA_API_KEY = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($keyPointer).Trim()
    if (!$env:NVIDIA_API_KEY) { throw 'No key entered.' }
    $env:FLOATCHAT_AI_PROVIDER = 'nvidia'
    $env:NVIDIA_MODEL = $Model
    Push-Location $projectRoot
    try {
        Write-Host "NVIDIA selected ($Model). Keep this terminal open; refresh FloatChat after startup. Ctrl+C stops the API."
        & $pythonPath -m uvicorn backend.main:app --host 127.0.0.1 --port 8017 --reload --reload-dir backend
    } finally { Pop-Location }
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($keyPointer)
    $keyInput.Dispose()
    $env:NVIDIA_API_KEY = $previousKey
    $env:FLOATCHAT_AI_PROVIDER = $previousProvider
    $env:NVIDIA_MODEL = $previousModel
}
