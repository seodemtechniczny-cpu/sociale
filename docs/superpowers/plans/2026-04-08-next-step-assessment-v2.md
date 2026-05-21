# Sociale MVP — Ocena następnego etapu (v2, po localStorage)

> **Typ dokumentu:** Strategiczna ocena kierunku, nie plan implementacyjny.
> **Data:** 2026-04-08
> **Status:** Do zatwierdzenia przed wdrożeniem

---

## 1. Aktualny stan

MVP Sociale jest **funkcjonalnie kompletny i odporny na reload.**

Pełny flow działa E2E i persystuje przez odświeżenie:
```
URL → analiza → planner → refinement per entry → batch generation → final CSV
                                                                   ↕ localStorage
```

Produkt jest w stanie, w którym można pokazać go pierwszemu klientowi i pracować z nim roboczo
bez ryzyka utraty pracy przez przypadkowe odświeżenie.

---

## 2. Co jest domknięte

| Etap | Status |
|------|--------|
| Scraper + teaser | ✅ |
| Single-gen flow (brief → blog, SEO, posty, visual brief) | ✅ |
| Planner flow (scope, platformy, weeks, brief) | ✅ |
| First execution path (single social z planu, preview, regeneruj, kopiuj) | ✅ |
| Content refinement (tytuł/opis/dzień/hashtagi per entry) | ✅ |
| Content production — batch select, batch gen, final CSV | ✅ |
| Quality / polish — parseApiError, slow loading, retry, batch retry | ✅ |
| **localStorage persistence** — restore/save/reset, SCHEMA_VERSION, confirm() | ✅ |
| WordPress draft export | ⚠️ zaimplementowany, externally blocked (brak test credentials) |

---

## 3. Porównanie 3 kierunków

### Kierunek A — Visual layer (minimal: graphic_mode + visual_direction per entry)

**Co to jest:**
Dwa nowe pola per entry w planie (tylko UI, bez AI per entry, bez generacji obrazów):

- `graphic_mode` — dropdown z 5 opcjami:
  - `Brak grafiki` (no_graphic_needed)
  - `Nowa grafika` (new_graphic)
  - `Zdjęcie z tekstem` (existing_photo_text_overlay)
  - `Czyste zdjęcie` (existing_photo_clean)
  - `Karuzela` (carousel_mix)
- `visual_direction` — opcjonalne pole tekstowe (co pokazać, jaki nastrój, jaki motyw)

Oba pola trafiają do final CSV jako dwie nowe kolumny. Żadnych AI-calls per entry. Żadnej generacji obrazów. Żadnego uploadu assetów.

**Zmiany techniczne:**
- Frontend only: 2 nowe stany `Record<string, string>` (entryGraphicMode, entryVisualDirection)
- Bump `SCHEMA_VERSION` z 1 → 2 (bezpieczne — clear-on-mismatch obsłużone)
- CSV: 2 nowe kolumny ("Tryb graficzny", "Wskazówka graficzna")
- Backend: zero zmian

**Dlaczego to ma sens:**
- Klient dostaje kompletny brief: nie tylko co napisać, ale co pokazać na grafice
- Single-gen flow już produkuje `visual_brief` — to jest doprowadzenie tej idei do planera
- Zakres jest precyzyjny: 2 stany + 2 elementy UI per entry + 2 kolumny w CSV
- Ryzyko scope creep: niske — mamy konkretną granicę "bez AI per entry"

**Argumenty przeciw:**
- Klient może wpisać visual direction ręcznie w notatce — to nie jest bloker
- Nie rozwiązuje realnego problemu produkcyjnego (produkt już działa)
- Małe ryzyko: UI per entry staje się coraz gęstsze (refinement już ma 4 pola)

**Ocena:** Dobry następny krok. Kompletuje output produktu.

---

### Kierunek B — WordPress export — domknięcie realnego testu

**Co to jest:**
Test i ewentualne poprawki istniejącego WP export flow z realnym kontem WordPress.

**Stan obecny:**
- Router `export.py` istnieje i jest zamontowany
- UI form (WP URL, user, application password) istnieje w `results` step
- Kod nigdy nie był uruchomiony na realnym koncie

**Co wymaga odblokowania:**
- Realne konto WordPress (wordpress.com lub lokalne WP)
- Application password wygenerowane w WP Admin → Profil → Hasła aplikacji
- To jest **zewnętrzny bloker** — nie możemy go sami usunąć bez credentials

**Co moglibyśmy zrobić bez credentials:**
- Dodać walidację URL (czy to prawdziwy WP endpoint)
- Dodać lepsze komunikaty błędów
- Dodać "Connection test" przed exportem

**Problem z tym podejściem:**
Gold-plating nieprzetestowanego flow. Ryzykujemy budowanie obsługi błędów dla scenariuszy, które mogą nie być problemami. Właściwa kolejność: test → fix co się psuje.

**Argumenty za:**
- Domknięcie istniejącego, wiszącego blokera
- WP export jest realną wartością dla klientów z WordPress

**Argumenty przeciw:**
- Bloker jest **zewnętrzny** — nie możemy go usunąć teraz
- Bez credentials nie możemy rzetelnie domknąć tego etapu
- Dodawanie walidacji "w ciemno" to anti-pattern

**Ocena:** Nie teraz. Czeka na credentials. Gdy pojawią się credentials → test → fix.

---

### Kierunek C — Dalszy polish / UX cleanup

**Co to jest:**
Drobne ulepszenia UX:
- Walidacja odpowiedzi planera (czy platformy matchują request)
- Lepszy mobile UX
- Animacje przejść
- Drobne poprawki layoutu

**Argumenty za:**
- Niskie ryzyko
- Poprawia wrażenia z użytkowania

**Argumenty przeciw:**
- Diminishing returns po etapie quality/polish
- Żadne z tych ulepszeń nie jest blokerem pierwszego klienta
- Mobile UX ma niski priorytet jeśli target to profesjonaliści na desktopie
- Czas lepiej zainwestować w kompletowanie outputu produktu (visual layer)

**Ocena:** Nie teraz. Wchodzi jako uzupełnienie przy okazji innego etapu.

---

## 4. Rekomendowany następny krok

**Kierunek A — Visual layer (minimal)**

---

## 5. Minimalny zakres

```
SCOPE: Visual layer — pola planistyczne/briefowe per entry
PLIKI: frontend/src/app/page.tsx (wyłącznie)
BACKEND: bez zmian
ZALEŻNOŚCI: bez nowych pakietów

Nowy stan (2 zmienne):
  entryGraphicMode:     Record<string, string>  // klucz → graphic_mode
  entryVisualDirection: Record<string, string>  // klucz → visual_direction hint

UI per entry (sekcja refinement):
  - Dropdown "Tryb graficzny" (5 opcji + domyślny "— wybierz —")
  - Pole tekstowe "Wskazówka graficzna" (placeholder: opcjonalne, np. "kawa w biurze, ciepłe kolory")
  - Tylko dla platform social (nie dla wpisów blogowych)

CSV final:
  - 2 nowe kolumny: Tryb graficzny | Wskazówka graficzna
  - Puste jeśli nie wypełnione

Persystencja:
  - SCHEMA_VERSION: 1 → 2
  - Dodać entryGraphicMode i entryVisualDirection do PersistedState
  - Dodać do save effect i restore effect

resetAll():
  - Dodać reset entryGraphicMode i entryVisualDirection
```

**Nie wchodzi w scope:**
- AI-generowany visual_direction per entry (osobny etap, osobny koszt)
- Upload assetów (zdjęć, logotypów)
- Generacja grafik
- Podgląd grafiki
- Wpisy blogowe (graphic_mode nie ma sensu dla bloga)

---

## 6. Ryzyko

| Ryzyko | Prawdopodobieństwo | Wpływ | Mitygacja |
|--------|-------------------|-------|-----------|
| UI per entry staje się przeładowane (już 4 pola) | średnie | niski | Grupowanie wizualne / collapse sekcji — ale dopiero jeśli okaże się problemem |
| Scope creep → AI per entry | niskie | wysoki | Twarda granica w scope: "bez AI, bez callów per entry" |
| SCHEMA_VERSION bump → utrata sesji użytkowników | pewne, ale akceptowane | niski | Clear-on-mismatch już obsługuje to elegancko |
| Pole visual_direction jest ignorowane przez klientów | możliwe | brak | Opcjonalne → brak problemu |

---

## 7. Czego świadomie nie robimy teraz

| Element | Powód |
|---------|-------|
| AI-generowany visual_direction per entry | Oddzielny prompt per entry = koszty API + latency + nowy błąd |
| Upload assetów (zdjęć, logotypów) | Much later — wymaga storage, backend, UI |
| Generacja grafik (AI → images) | Much later — osobny produkt prawie |
| WP export test | Czeka na zewnętrzne credentials |
| Backend persistence | Bez auth nie wiadomo "czyje" dane |
| Panel klienta / workspace | Wymaga auth |
| Auth + billing | Much later |
| Social publish | Much later |
| Mobile UX rewrite | Niski priorytet |

---

## 8. Krótka rekomendacja

**Wdrażać: Kierunek A — visual layer (minimal)**

**Dlaczego teraz:**
Produkt jest stabilny i odporny na reload. Kolejnym naturalnym krokiem jest kompletowanie outputu — klient dostaje nie tylko tekst, ale też wskazówki graficzne per wpis. To zamyka lukę między "mam plan postów" a "mam kompletny brief do realizacji".

**Dlaczego nie B:**
Zewnętrznie zablokowane. Nie możemy tego domknąć bez credentials.

**Dlaczego nie C:**
Diminishing returns. Produkt jest już dobry jakościowo po etapie quality/polish.

**Minimalny sensowny zakres:**
Dwa stany `Record<string, string>`, dwa elementy UI per entry (dropdown + text), dwie kolumny w CSV. Bump SCHEMA_VERSION. Tylko frontend, zero backendu, zero nowych pakietów. ~60-80 linii kodu.

**Po tym kroku:** WP export test (gdy credentials dostępne) → następny etap TBD.
