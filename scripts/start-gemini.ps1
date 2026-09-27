
param([string]$Model = 'gemini-3.8-flash')
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$pythonPath = Join-Path $projectRoot '.venv\Scripts\python.exe'
if (!(Test-Path -LiteralPath $pythonPath)) { throw 'Create the project Python environment first.' }
# Check the port before requesting a secret. Windows venv Python may spawn a
# base-runtime child, so verify both that child and its direct venv parent.
$listeners = @(Get-NetTCPConnection -LocalPort 8017 -State Listen -ErrorAction SilentlyContinue)
$verifiedProcesses = @()
foreach ($listener in $listeners) {
    $processInfo = Get-CimInstance Win32_Process -Filter "ProcessId=$($listener.OwningProcess)"
    $parentInfo = if ($processInfo) { Get-CimInstance Win32_Process -Filter "ProcessId=$($processInfo.ParentProcessId)" }
    $isApi = $processInfo -and $processInfo.CommandLine -match '\buvicorn\s+backend\.main:app(?:\s|$)'
    $isProjectProcess = $isApi -and ($processInfo.ExecutablePath -eq $pythonPath -or $processInfo.CommandLine -like "*$pythonPath*")
    $isProjectParent = $isApi -and $parentInfo -and $parentInfo.CommandLine -match '\buvicorn\s+backend\.main:app(?:\s|$)' -and ($parentInfo.ExecutablePath -eq $pythonPath -or $parentInfo.CommandLine -like "*$pythonPath*")
    if (!$isProjectProcess -and !$isProjectParent) {
        throw "Port 8017 is occupied by process $($listener.OwningProcess), which cannot be verified as this project's API. Stop the existing API terminal with Ctrl+C, then retry. No key has been requested."
    }
    if ($isProjectParent) { $verifiedProcesses += $parentInfo }
    $verifiedProcesses += $processInfo
}
foreach ($verifiedProcess in ($verifiedProcesses | Sort-Object ProcessId -Unique)) {
    # Recheck creation time to avoid stopping a reused process ID.
    $currentProcess = Get-CimInstance Win32_Process -Filter "ProcessId=$($verifiedProcess.ProcessId)"
    if ($currentProcess -and $currentProcess.CreationDate -eq $verifiedProcess.CreationDate) {
        Stop-Process -Id $verifiedProcess.ProcessId -ErrorAction Stop
    }
}
if ($listeners.Count) {
    $deadline = (Get-Date).AddSeconds(5)
    do {
        $stillListening = Get-NetTCPConnection -LocalPort 8017 -State Listen -ErrorAction SilentlyContinue
        if (!$stillListening) { break }
        Start-Sleep -Milliseconds 200
    } while ((Get-Date) -lt $deadline)
    if ($stillListening) { throw 'Port 8017 is still busy. Stop the existing API terminal with Ctrl+C, then retry.' }
}
$keyInput = Read-Host 'Paste your Gemini API key (hidden; kept only for this session)' -AsSecureString
$keyPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($keyInput)
$previousKey = $env:GEMINI_API_KEY
$previousProvider = $env:FLOATCHAT_AI_PROVIDER
$previousModel = $env:GEMINI_MODEL
try {
    $env:GEMINI_API_KEY = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($keyPointer).Trim()
    if (!$env:GEMINI_API_KEY) { throw 'No key entered.' }
    if ($env:GEMINI_API_KEY -match '[^\x21-\x7E]') {
        throw 'The key contains invisible or unsupported characters. Retry using the terminal paste menu.'
    }
    if ($env:GEMINI_API_KEY -match '[\s"'']' -or $env:GEMINI_API_KEY -match '^GEMINI_API_KEY=') {
        throw 'Paste only the key value, without quotes, spaces, or GEMINI_API_KEY=.'
    }
    if ($env:GEMINI_API_KEY.StartsWith('gsk_')) { throw 'That is a Groq key. Use your Google AI Studio Gemini key.' }
    $env:FLOATCHAT_AI_PROVIDER = 'gemini'
    $env:GEMINI_MODEL = $Model
    Push-Location $projectRoot
    try {
        Write-Host 'Gemini selected. Keep this terminal open; refresh FloatChat after startup. Ctrl+C stops the API.'
        & $pythonPath -m uvicorn backend.main:app --host 127.0.0.1 --port 8017 --reload --reload-dir backend
    } finally { Pop-Location }
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($keyPointer)
    $keyInput.Dispose()
    $env:GEMINI_API_KEY = $previousKey
    $env:FLOATCHAT_AI_PROVIDER = $previousProvider
    $env:GEMINI_MODEL = $previousModel
}
