# Uruchamia backend (FastAPI/uvicorn) i frontend (Next.js) w jednym terminalu na Windows.
# Ctrl+C zatrzymuje oba procesy.
#
# Pierwsze uruchomienie wymaga zezwolenia na skrypty PowerShell:
#   Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned

$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot

$BackendPort  = if ($env:BACKEND_PORT)  { $env:BACKEND_PORT }  else { "8002" }
$FrontendPort = if ($env:FRONTEND_PORT) { $env:FRONTEND_PORT } else { "3000" }

# --- Sanity checks ---

if (-not (Test-Path "backend\venv")) {
    Write-Host "BŁĄD: backend\venv nie istnieje." -ForegroundColor Red
    Write-Host "  Uruchom: cd backend; python -m venv venv; .\venv\Scripts\Activate.ps1; pip install -r requirements.txt"
    exit 1
}

if (-not (Test-Path "frontend\node_modules")) {
    Write-Host "BŁĄD: frontend\node_modules nie istnieje." -ForegroundColor Red
    Write-Host "  Uruchom: cd frontend; npm install"
    exit 1
}

function Test-PortInUse($Port) {
    $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    return $null -ne $conn
}

if (Test-PortInUse $BackendPort) {
    Write-Host "BŁĄD: port $BackendPort zajęty. Ustaw `$env:BACKEND_PORT='inny-port' przed uruchomieniem." -ForegroundColor Red
    exit 1
}
if (Test-PortInUse $FrontendPort) {
    Write-Host "BŁĄD: port $FrontendPort zajęty. Ustaw `$env:FRONTEND_PORT='inny-port' przed uruchomieniem." -ForegroundColor Red
    exit 1
}

Write-Host "Sociale dev → backend :$BackendPort, frontend :$FrontendPort (Ctrl+C aby zatrzymać)" -ForegroundColor Green

# --- Start processes ---

$beScript = @"
Set-Location '$PSScriptRoot\backend'
& '.\venv\Scripts\Activate.ps1'
uvicorn app.main:app --reload --port $BackendPort 2>&1 | ForEach-Object { Write-Host "[BE] `$_" -ForegroundColor Cyan }
"@

$feScript = @"
Set-Location '$PSScriptRoot\frontend'
`$env:NEXT_PUBLIC_API_URL = 'http://localhost:$BackendPort'
npm run dev 2>&1 | ForEach-Object { Write-Host "[FE] `$_" -ForegroundColor Magenta }
"@

$beJob = Start-Job -Name "sociale-backend"  -ScriptBlock ([scriptblock]::Create($beScript))
$feJob = Start-Job -Name "sociale-frontend" -ScriptBlock ([scriptblock]::Create($feScript))

# --- Cleanup on Ctrl+C / exit ---

$cleanup = {
    Write-Host "`nZatrzymuję serwery..." -ForegroundColor Yellow
    Get-Job -Name "sociale-*" -ErrorAction SilentlyContinue | ForEach-Object {
        Stop-Job  $_ -ErrorAction SilentlyContinue
        Remove-Job $_ -Force -ErrorAction SilentlyContinue
    }
    # Make sure ports are freed (kill child python/node processes)
    Get-NetTCPConnection -LocalPort $BackendPort, $FrontendPort -State Listen -ErrorAction SilentlyContinue |
        ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
}
Register-EngineEvent PowerShell.Exiting -Action $cleanup | Out-Null

try {
    while ($true) {
        Get-Job -Name "sociale-*" | Receive-Job
        if ((Get-Job -Name "sociale-backend").State  -ne "Running" -and
            (Get-Job -Name "sociale-frontend").State -ne "Running") { break }
        Start-Sleep -Milliseconds 500
    }
}
finally {
    & $cleanup
}
