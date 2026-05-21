# Uruchamia backend (FastAPI/uvicorn) i frontend (Next.js) w jednym terminalu na Windows.
# Ctrl+C zatrzymuje oba procesy. Po starcie automatycznie otwiera przegladarke.
#
# Pierwsze uruchomienie wymaga zezwolenia na skrypty PowerShell:
#   Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned

$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot

$BackendPort  = if ($env:BACKEND_PORT)  { $env:BACKEND_PORT }  else { "8002" }
$FrontendPort = if ($env:FRONTEND_PORT) { $env:FRONTEND_PORT } else { "3000" }

# --- Load backend/.env into PROCESS env vars (zeby Pydantic Settings je widzial niezaleznie od cwd) ---

$envFile = Join-Path $PSScriptRoot "backend\.env"
if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        if ($_ -match '^\s*#') { return }
        if ($_ -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+?)\s*$') {
            $name  = $matches[1]
            $value = $matches[2]
            if ($value -match '^"(.*)"$' -or $value -match "^'(.*)'$") {
                $value = $matches[1]
            }
            [System.Environment]::SetEnvironmentVariable($name, $value, 'Process')
        }
    }
    Write-Host "[INIT] Wczytano backend\.env do zmiennych srodowiskowych" -ForegroundColor DarkGray
}

# --- Sanity checks ---

$pythonExe = Join-Path $PSScriptRoot "backend\venv\Scripts\python.exe"
if (-not (Test-Path $pythonExe)) {
    Write-Host "BLAD: backend\venv\Scripts\python.exe nie istnieje." -ForegroundColor Red
    Write-Host "  Uruchom: cd backend; python -m venv venv; .\venv\Scripts\Activate.ps1; pip install -r requirements.txt"
    Read-Host "Enter aby zamknac"
    exit 1
}

if (-not (Test-Path "frontend\node_modules")) {
    Write-Host "BLAD: frontend\node_modules nie istnieje." -ForegroundColor Red
    Write-Host "  Uruchom: cd frontend; npm install"
    Read-Host "Enter aby zamknac"
    exit 1
}

& $pythonExe -c "import uvicorn" 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "BLAD: uvicorn nie jest zainstalowany w venv." -ForegroundColor Red
    Write-Host "  Uruchom: cd backend; .\venv\Scripts\Activate.ps1; pip install -r requirements.txt"
    Read-Host "Enter aby zamknac"
    exit 1
}

if (-not $env:OPENAI_API_KEY -or $env:OPENAI_API_KEY -eq "sk-your-key-here") {
    Write-Host "BLAD: OPENAI_API_KEY nie jest ustawiony lub jest placeholderem." -ForegroundColor Red
    Write-Host "  Otworz: notepad backend\.env"
    Write-Host "  Wpisz: OPENAI_API_KEY=sk-..."
    Read-Host "Enter aby zamknac"
    exit 1
}

function Test-PortInUse($Port) {
    $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    return $null -ne $conn
}

if (Test-PortInUse $BackendPort) {
    Write-Host "BLAD: port $BackendPort zajety. Ustaw `$env:BACKEND_PORT='8003' przed uruchomieniem." -ForegroundColor Red
    Read-Host "Enter aby zamknac"
    exit 1
}
if (Test-PortInUse $FrontendPort) {
    Write-Host "BLAD: port $FrontendPort zajety. Ustaw `$env:FRONTEND_PORT='3001' przed uruchomieniem." -ForegroundColor Red
    Read-Host "Enter aby zamknac"
    exit 1
}

Write-Host "Sociale dev -> backend :$BackendPort, frontend :$FrontendPort (Ctrl+C aby zatrzymac)" -ForegroundColor Green
Write-Host "Dashboard: http://localhost:$FrontendPort (otworzy sie automatycznie gdy bedzie gotowy)" -ForegroundColor Green
Write-Host ""

# --- Start processes ---

$beScript = [scriptblock]::Create(@"
Set-Location '$PSScriptRoot\backend'
& '$pythonExe' -m uvicorn app.main:app --reload --port $BackendPort 2>&1 | ForEach-Object {
    Write-Host "[BE] `$_" -ForegroundColor Cyan
}
"@)

$feScript = [scriptblock]::Create(@"
Set-Location '$PSScriptRoot\frontend'
`$env:NEXT_PUBLIC_API_URL = 'http://localhost:$BackendPort'
npm run dev 2>&1 | ForEach-Object {
    Write-Host "[FE] `$_" -ForegroundColor Magenta
}
"@)

$beJob = Start-Job -Name "sociale-backend"  -ScriptBlock $beScript
$feJob = Start-Job -Name "sociale-frontend" -ScriptBlock $feScript

# --- Main loop: stream output + auto-open browser when frontend ready ---

$cleanup = {
    Write-Host ""
    Write-Host "Zatrzymuje serwery..." -ForegroundColor Yellow
    Get-Job -Name "sociale-*" -ErrorAction SilentlyContinue | Receive-Job -ErrorAction SilentlyContinue
    Get-Job -Name "sociale-*" -ErrorAction SilentlyContinue | ForEach-Object {
        Stop-Job  $_ -ErrorAction SilentlyContinue
        Remove-Job $_ -Force -ErrorAction SilentlyContinue
    }
    Get-NetTCPConnection -LocalPort $BackendPort, $FrontendPort -State Listen -ErrorAction SilentlyContinue |
        ForEach-Object {
            Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue
        }
}

$browserOpened = $false
try {
    while ($true) {
        Get-Job -Name "sociale-*" -ErrorAction SilentlyContinue | Receive-Job

        if (-not $browserOpened) {
            try {
                $r = Invoke-WebRequest -Uri "http://localhost:$FrontendPort" -UseBasicParsing -TimeoutSec 1 -ErrorAction Stop
                if ($r.StatusCode -eq 200) {
                    Start-Process "http://localhost:$FrontendPort"
                    Write-Host ""
                    Write-Host "[INIT] Otwarto http://localhost:$FrontendPort w przegladarce" -ForegroundColor Green
                    Write-Host ""
                    $browserOpened = $true
                }
            } catch {}
        }

        $active = Get-Job -Name "sociale-*" -ErrorAction SilentlyContinue |
            Where-Object { $_.State -in 'NotStarted','Running' }
        if (-not $active) { break }
        Start-Sleep -Milliseconds 500
    }
}
finally {
    & $cleanup
}

Write-Host ""
Read-Host "Enter aby zamknac okno"
