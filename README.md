# Sociale MVP

Komercyjne MVP SaaS do generowania treści marketingowych z URL strony klienta.

Stack: FastAPI + Next.js. Wymaga klucza OpenAI API.

---

## Codzienne uruchomienie

**macOS / Linux:**
```bash
./run.sh
```

**Windows (PowerShell):**
```powershell
.\run.ps1
```

Oba skrypty uruchamiają backend (uvicorn) + frontend (Next.js) w jednym terminalu z prefiksami `[BE]` i `[FE]`. Ctrl+C zatrzymuje oba.

- Backend: http://localhost:8002
- Frontend (dashboard): **http://localhost:3000**
- API docs (Swagger): http://localhost:8002/docs

Override portów:
```bash
# macOS / Linux
BACKEND_PORT=9000 FRONTEND_PORT=3001 ./run.sh

# Windows PowerShell
$env:BACKEND_PORT="9000"; $env:FRONTEND_PORT="3001"; .\run.ps1
```

---

## Pierwsza instalacja

### Wymagania
- Python 3.9+ (`python --version`)
- Node.js 20+ (`node --version`)
- Klucz OpenAI z dostępem do `gpt-image-*` i `gpt-5.x` ([platform.openai.com](https://platform.openai.com))

### macOS / Linux

```bash
git clone https://github.com/seodemtechniczny-cpu/sociale.git
cd sociale

# Backend
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env  # uzupełnij OPENAI_API_KEY
cd ..

# Frontend
cd frontend
npm install
cd ..

# Uruchom
./run.sh
```

### Windows (PowerShell)

```powershell
# Pierwsze uruchomienie: zezwolenie na skrypty (jednorazowo)
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned

git clone https://github.com/seodemtechniczny-cpu/sociale.git
cd sociale

# Backend
cd backend
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env  # potem otwórz i uzupełnij OPENAI_API_KEY w Notepad
cd ..

# Frontend
cd frontend
npm install
cd ..

# Uruchom
.\run.ps1
```

---

## Konfiguracja `.env`

W `backend/.env` musi być:
```
OPENAI_API_KEY=sk-...   # wymagane
OPENAI_MODEL=gpt-5.4-mini   # opcjonalne, default
```

`.env` jest w `.gitignore` — Twój klucz nigdy nie trafi do repo.

---

## Funkcje

- Analiza URL klienta (scraping + heurystyki)
- Planner treści (blog/social, platformy, tygodnie)
- Generacja per-entry: social posty i blog HTML
- Generacja grafik AI z wyborem modelu (`gpt-image-2`, `gpt-image-1.5`, `gpt-image-1`, `gpt-image-1-mini`)
- Edycja źródłowych obrazów (popraw kolory, oczyść tło, wersja reklamowa)
- Export CSV planu i postów
- Export do WordPressa (draft)
- Persystencja sesji w localStorage
