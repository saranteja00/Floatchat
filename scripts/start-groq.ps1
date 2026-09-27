param([string]$Model = 'openai/gpt-oss-20b')
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$pythonPath = Join-Path $projectRoot '.venv\Scripts\python.exe'
if (!(Test-Path -LiteralPath $pythonPath)) { throw 'Create the project Python environment first.' }
$keyInput = Read-Host 'Paste your Groq API key (hidden; kept only for this session)' -AsSecureString
$keyPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($keyInput)
$previousKey = $env:GROQ_API_KEY
$previousProvider = $env:FLOATCHAT_AI_PROVIDER
$previousModel = $env:GROQ_MODEL
try {
    $env:GROQ_API_KEY = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($keyPointer).Trim()
    if (!$env:GROQ_API_KEY) { throw 'No key entered.' }
    $env:FLOATCHAT_AI_PROVIDER = 'groq'
    $env:GROQ_MODEL = $Model
    $listener = Get-NetTCPConnection -LocalPort 8017 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($listener) {
        $processInfo = Get-CimInstance Win32_Process -Filter "ProcessId=$($listener.OwningProcess)"
        $expectedPython = Join-Path $projectRoot '.venv\Scripts\python.exe'
        # Some venv installations report the base Python executable; require the project path in the command too.
        if ($processInfo.CommandLine -notlike '*uvicorn backend.main:app*' -or ($processInfo.ExecutablePath -ne $expectedPython -and $processInfo.CommandLine -notlike "*$projectRoot*")) {
            throw 'Port 8017 belongs to a process this launcher cannot verify. Stop your FloatChat API terminal first.'
        }
        Stop-Process -Id $listener.OwningProcess
    }
    Push-Location $projectRoot
    try {
        Write-Host 'Groq selected. Keep this terminal open; refresh FloatChat after startup. Ctrl+C stops the API.'
        & $pythonPath -m uvicorn backend.main:app --host 127.0.0.1 --port 8017 --reload --reload-dir backend
    } finally { Pop-Location }
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($keyPointer)
    $keyInput.Dispose()
    $env:GROQ_API_KEY = $previousKey
    $env:FLOATCHAT_AI_PROVIDER = $previousProvider
    $env:GROQ_MODEL = $previousModel
}
