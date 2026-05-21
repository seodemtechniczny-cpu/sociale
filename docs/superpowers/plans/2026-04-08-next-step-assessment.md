# Sociale MVP — Ocena następnego etapu

> **Typ dokumentu:** Strategiczna ocena kierunku, nie plan implementacyjny.
> **Data:** 2026-04-08
> **Status:** Do zatwierdzenia przed wdrożeniem

---

## 1. Aktualny stan

MVP Sociale jest **funkcjonalnie kompletny w zakresie core loop.**

Pełny flow działa E2E:
```
URL → analiza (teaser) → planner → refinement per entry → single/batch social generation → final CSV
```

Wszystkie warstwy są domknięte. Produkt nadaje się do demo i do pierwszego klienta.

---

## 2. Co jest domknięte

| Etap | Status |
|------|--------|
| Scraper + teaser (biznes, summary, tytuły, kolory) | ✅ domknięty |
| Single-gen flow (brief → 3 posty, blog HTML, SEO, visual brief) | ✅ domknięty |
| Planner flow (scope, platformy, weeks, posts/week, plan) | ✅ domknięty |
| First execution path (single social z planu, preview, regeneruj, kopiuj) | ✅ domknięty |
| Content refinement (tytuł/opis/dzień/hashtagi per entry) | ✅ domknięty |
| Content production — batch select, batch gen, final CSV | ✅ domknięty |
| Quality / polish — parseApiError, slow loading, retry per entry, batch retry | ✅ domknięty |
| WordPress draft export | ⚠️ zaimplementowany, czeka na test z realnym kontem |

---

## 3. Co jeszcze nie jest zrobione

Poniższe elementy są świadomie odłożone — nie są blockerami MVP.

| Element | Notatka |
|---------|---------|
| Persystencja stanu (localStorage / backend) | Stan ginie przy odświeżeniu strony |
| Visual / graphic layer (graphic_mode, visual_direction per entry) | CSV nie zawiera wskazówek graficznych |
| WP export — realny test z application password | Zewnętrznie zablokowany |
| Walidacja platform w odpowiedzi planera | Edge case, niskie prawdopodobieństwo |
| Mobile UX (teaser, plan display) | Niska pilność — target to prawdopodobnie desktop |
| Panel klienta / workspace | Later phase |
| Auth + billing | Later phase |
| Social publish (Meta API, LinkedIn API) | Later phase |
| Deduplikacja na podstawie historii postów | Later phase |
| Generacja grafik (AI → real images) | Later phase |
| Agency mode / multi-tenant | Much later |

---

## 4. Następny najlepszy krok — ocena 3 kierunków

### Kierunek A — Visual layer (minimal: pola planistyczne/briefowe)

**Co to jest:**
Dodanie dwóch pól per entry w planie:
- `graphic_mode` — dropdown: `no_graphic_needed / new_graphic / existing_photo_text_overlay / existing_photo_clean / carousel_mix`
- `visual_direction` — opcjonalne pole tekstowe: krótki hint co pokazać na grafice

Te pola trafiają do final CSV. Brak generacji obrazów, brak AI-call per entry, brak uploadu assetów.

**Argumenty za:**
- Klient dostaje kompletniejszy output (wie nie tylko co napisać, ale co pokazać)
- Single-gen flow już generuje `visual_brief` — to byłoby doprowadzenie tej idei do planera
- Zakres jest jasny i ograniczony

**Argumenty przeciw:**
- Nie rozwiązuje największego problemu UX: stan ginie przy odświeżeniu
- Klient może ręcznie ustalić graphic_mode bez wsparcia narzędzia
- Ryzyko scope creep: pokusa dodania AI-generowanego `visual_direction` per entry (= osobny prompt per entry = koszty, latency, nowy błąd)
- Wartość dla klienta jest incremental, nie fundamentalna

**Ocena:** Dobry krok, ale nie teraz. Wchodzi po persystencji.

---

### Kierunek B — Persystencja lekkiego stanu (localStorage)

**Co to jest:**
Zapis kluczowego stanu aplikacji do `localStorage` przy każdej zmianie, odczyt przy montowaniu komponentu.

Stan do persystowania:
- `analyzeResult` — wynik analizy (URL, business_type, summary, tytuły, kolory)
- `planResult` — wyniki planera (entries + summary)
- `entryTitles`, `entryDescriptions`, `entryHashtags`, `entrySlots` — overrides per entry
- `generatedPosts` — wygenerowane treści (najcenniejsze — generacja kosztuje czas i API)
- `selectedEntries` — zaznaczone wiersze
- `currentStep` — aktualny krok flow (teaser / plan / results)

Stan **nie** wymagający persystencji:
- `postLoadingKeys`, `slowLoadingKeys` — ephemeral (loading state)
- `batchProgress` — ephemeral (progress indicator)
- `error` — ephemeral

**Argumenty za:**
- Największy realny pain point: odświeżenie strony = utrata całej pracy (analiza, plan, refinementy, wygenerowane posty)
- Demo-killer: trudno pokazać produkt klientowi, jeśli każdy błąd przeglądarki zeruje sesję
- Czysto frontendowe: zero zmian w backendzie, zero nowych zależności
- Zakres jest precyzyjny: jeden `useEffect` do odczytu przy mount + jeden do zapisu przy każdej zmianie stanu
- Naturalne miejsce na `schema_version` field → czyste clear-on-mismatch przy zmianie shape

**Argumenty przeciw:**
- localStorage jest per-browser, per-device — nie zastępuje prawdziwej persystencji
- Jeśli shape stanu się zmieni (np. dodamy visual layer), trzeba obsłużyć migrację lub clear
- Ryzyko: zapisywanie dużych wygenerowanych postów do localStorage (max ~5MB limit)

**Ryzyko mitygowalne:** localStorage limit jest praktycznie bezpieczny dla tego use case (kilkanaście postów × ~500 znaków = kilkadziesiąt KB). Schema version + clear-on-mismatch rozwiązuje problem migracji.

**Ocena:** **Rekomendowany kierunek.** Usuwa największy realny bloker adopcji.

---

### Kierunek C — Dalszy polish / stabilizacja / drobne UX

**Co to jest:**
Kontynuacja drobnych usprawnień UX:
- Walidacja odpowiedzi planera (czy platformy matchują request)
- Lepszy mobile UX (teaser z dwoma sekcjami, plan display na małym ekranie)
- Bardziej szczegółowe komunikaty błędów
- Animacje przejść między krokami

**Argumenty za:**
- Niskie ryzyko, łatwe do wycofania
- Nie wymaga planowania

**Argumenty przeciw:**
- Nie rozwiązuje żadnego fundamentalnego problemu
- Diminishing returns — jakość jest już dobra po etapie quality/polish
- Mobile UX jest niskiej pilności jeśli target to profesjonaliści na desktopie
- Czas lepiej zainwestować w coś, co realnie zwiększa wartość produktu

**Ocena:** Nie teraz. Wchodzi jako uzupełnienie przy okazji kolejnych etapów.

---

## 5. Minimalny zakres rekomendowanego kroku (B — localStorage)

```
SCOPE: localStorage persistence
PLIKI: frontend/src/app/page.tsx (wyłącznie)
BACKEND: bez zmian
ZALEŻNOŚCI: bez nowych pakietów

Zakres:
1. Stała STORAGE_KEY = "sociale_state_v1" + SCHEMA_VERSION = 1
2. Hook useEffect [mount] — odczyt z localStorage, parse JSON, weryfikacja schema_version, restore state
3. Hook useEffect [każda zmiana stanu] — serialize + localStorage.setItem (debounced 300ms)
4. Przycisk "Zacznij od nowa" / clear session — clearStorage + reset state
5. Obsługa błędów: try/catch wokół parse (corrupted storage → clear + fresh start)
```

**Nie wchodzi w scope:**
- Backend storage (database, Redis, S3)
- User accounts / session management
- Multi-device sync
- Visual layer fields (to osobny etap po localStorage)

---

## 6. Ryzyko

| Ryzyko | Prawdopodobieństwo | Wpływ | Mitygacja |
|--------|-------------------|-------|-----------|
| localStorage limit (~5MB) | niskie | średni | Monitoring rozmiaru; generowane posty to ~50KB max |
| Shape mismatch po zmianie stanu | pewne (przy visual layer) | niski | SCHEMA_VERSION + clear-on-mismatch |
| Corrupted JSON w storage | bardzo niskie | niski | try/catch + clear |
| Użytkownik traci dane przy clear | możliwe | średni | Potwierdzenie przed clear, wyraźny komunikat |

---

## 7. Czego świadomie nie robimy teraz

| Element | Powód |
|---------|-------|
| Visual layer (graphic_mode, visual_direction) | Po localStorage — wtedy shape stanu będzie stabilny |
| Backend persistence (database) | Overkill bez auth — nie wiadomo "czyje" dane |
| Panel klienta / workspace | Wymaga auth — later phase |
| Auth + billing | Much later — najpierw walidacja produktu |
| Social publish (Meta/LinkedIn API) | Much later |
| Generacja grafik AI | Much later — osobny produkt prawie |
| Mobile UX rewrite | Niski priorytet — target to desktop |
| WP export test | Zewnętrznie zablokowany — nie odkładamy, ale nie blokuje nas |

---

## 8. Krótka rekomendacja

**Wdrażać: localStorage persistence (Kierunek B)**

**Dlaczego teraz:**
Produkt jest demo-ready funkcjonalnie, ale fragile operacyjnie. Pierwsze spotkanie z klientem lub pierwsza dłuższa sesja pracy może skończyć się utratą całego planu przez przypadkowe odświeżenie strony. To jest najbardziej realna bariera przed "pierwszym klientem" — nie brak funkcji, tylko brak bezpieczeństwa danych.

**Dlaczego nie A (visual layer):**
Wartość jest incremental, a ryzyko scope creep wysokie. Klient może działać bez graphic_mode — może to wpisać ręcznie. Lepiej dodać visual layer gdy stan aplikacji jest już stabilnie persystowany.

**Dlaczego nie C (dalszy polish):**
Etap quality/polish jest domknięty. Dalsze szlifowanie bez fundamentu persystencji to budowanie na niestabilnym gruncie.

**Minimalny sensowny zakres:**
Jeden plik (`page.tsx`), brak nowych zależności, brak zmian w backendzie. Implementacja to ~50-80 linii kodu. Wyraźny przycisk "Zacznij od nowa" jako bezpieczna ścieżka wyjścia.

**Po tym kroku:** visual layer (graphic_mode per entry, do CSV) stanie się naturalnym następnym krokiem z bezpiecznym fundamentem.
