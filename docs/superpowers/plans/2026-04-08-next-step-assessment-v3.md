# Sociale MVP — Ocena następnego etapu (v3, po blog entry flow fix)

> **Typ dokumentu:** Strategiczna ocena kierunku, nie plan implementacyjny.
> **Data:** 2026-04-08
> **Status:** Do zatwierdzenia przed wdrożeniem

---

## 1. Aktualny stan

MVP Sociale jest **funkcjonalnie kompletny dla obu typów treści** (social + blog) i odporny na reload.

```
URL → analiza → planner → refinement → social post per entry (inline)
                                      → blog per entry (brief → wraca do planu → inline preview + HTML)
                                      → final CSV + Pobierz HTML per blog
```

Produkt nadaje się do demo i pierwszego klienta. Nie ma broken flow.

---

## 2. Co jest domknięte

| Etap | Status |
|------|--------|
| Scraper + teaser | ✅ |
| Single-gen flow | ✅ |
| Planner flow | ✅ |
| First execution path | ✅ |
| Content refinement per entry | ✅ |
| Batch generation + final CSV | ✅ |
| Quality / polish | ✅ |
| localStorage persistence (SCHEMA_VERSION 2) | ✅ |
| **Blog entry flow fix** — per-entry, inline preview, Pobierz HTML, powrót do planu | ✅ |
| WordPress draft export | ⚠️ zaimplementowany, externally blocked |

---

## 3. Porównanie A/B/C

### A — Visual layer (minimal: graphic_mode + visual_direction per entry)

**Co to jest:**
Dwa opcjonalne pola per social entry w harmonogramie:
- `graphic_mode` — dropdown: Brak grafiki / Nowa grafika / Zdjęcie z tekstem / Czyste zdjęcie / Karuzela
- `visual_direction` — pole tekstowe: krótka wskazówka co pokazać, jaki nastrój, jaki motyw

Oba trafiają do final CSV jako nowe kolumny. Zero AI per entry. Zero generacji obrazów. Zero uploadu.

**Tylko dla social entries (nie blog)** — blog ma już `visual_brief` w wynikach single-gen flow.

**Zmiany techniczne:**
- 2 nowe stany: `entryGraphicMode`, `entryVisualDirection` (Record<string, string>)
- Dropdown + text input per social entry w sekcji refinement
- SCHEMA_VERSION 2 → 3
- CSV: 2 nowe kolumny ("Tryb graficzny" | "Wskazówka graficzna")
- Backend: zero zmian

**Argumenty za:**
- Naturalne domknięcie output brief — klient dostaje kompletny plan: tekst + wskazówka graficzna
- Infrastruktura per-entry jest gotowa (generatedPosts, generatedBlogs, entryTitles…) — dodajemy kolejne dwa Record bez nowego patternu
- SCHEMA_VERSION bump jest czysty i przewidywalny
- Zakres minimalny: ~60-80 linii

**Argumenty przeciw:**
- UI per entry staje się gęste (daySlot + title + desc + hashtags + teraz graphic_mode + visual_direction = 6 pól)
- Klient może wpisać visual direction ręcznie w notatce — to nie jest bloker
- Incremental value, nie naprawia broken flow

**Ocena:** **Rekomendowany kierunek.** Kompletuje brief output na najbardziej naturalnym kolejnym kroku.

---

### B — WordPress export — realny test

**Stan:** Dokładnie taki sam jak w poprzedniej ocenie.

- Flow jest zaimplementowany (router + UI)
- Bloker jest zewnętrzny: brak test credentials (WP konto + application password)
- Walidacja "w ciemno" jest anti-pattern — nie wiemy co się psuje bez testu

**Argumenty za:** Domknięcie wiszącego etapu.

**Argumenty przeciw:**
- Nie możemy go domknąć bez credentials
- Dodawanie walidacji dla nieznanych błędów = gold-plating

**Ocena:** Nie teraz. Czeka na credentials. Gdy się pojawią → test → fix co faktycznie się psuje.

---

### C — Drobny UX cleanup po blog flow

**Realne luki po blog flow:**
1. W brief step (gdy wejście z blog entry) nie ma wskazania "generujesz dla: Tydzień X, Poniedziałek, [tytuł]" — użytkownik musi pamiętać dla którego entry otworzył brief
2. Pola brief (goal, style, promote…) zachowują wartości z poprzedniej sesji gdy Regeneruj przełącza do briefu — może być zaskakujące przy regeneracji drugiego bloga
3. Minor: loading state w brief (przycisk "Generuje treść...") nie rozróżnia "generuję bloga dla harmonogramu" od "generuję pełny zestaw" — w obu przypadkach wygląda tak samo, choć pierwsze wraca do planu

**Argumenty za:**
- Punkt 1 (brak kontekstu w brief step) to realny UX gap — użytkownik może zgubić się przy wielu blog entries
- Małe zmiany, niskie ryzyko

**Argumenty przeciw:**
- Żaden z tych punktów nie jest blokerem
- Produkt działa — to polish
- Lepiej zrobić po visual layer niż przed, żeby nie otwierać pliku wielokrotnie

**Ocena:** Nie teraz jako osobny etap. Wchodzi jako uzupełnienie przy visual layer lub po nim.

---

### Fallback scraper quality (nieproszony kierunek D)

**Problem:** Przy timeout scrape (np. BMW, duże strony) fallback działa technicznie, ale teaser generuje słabsze, zbyt ogólne tematy.

**Dlaczego nie teraz:**
- To jest poprawa jakości, nie naprawa broken flow
- Wymaga zmian w backendzie (prompty, heurystyki, fallback logic) — większy zakres niż wygląda
- Core flow działa poprawnie dla scrapowalnych stron
- Przed wdrożeniem potrzeba diagnozy: czy problem to brak danych scrape, czy słaby prompt fallback?

**Ocena:** Zapisany do polish backlog. Wraca przy dedykowanym etapie "jakość teasera / scraper improvements".

---

## 4. Rekomendowany następny krok

**Kierunek A — Visual layer (minimal)**

---

## 5. Minimalny zakres

```
SCOPE: Visual layer — graphic_mode + visual_direction per social entry
PLIKI: frontend/src/app/page.tsx (wyłącznie)
BACKEND: bez zmian
ZALEŻNOŚCI: bez nowych pakietów

Nowe stany:
  entryGraphicMode:     Record<string, string>
  entryVisualDirection: Record<string, string>

Opcje graphic_mode (5):
  "— wybierz —" (domyślne, puste)
  "Brak grafiki"
  "Nowa grafika"
  "Zdjęcie z tekstem"
  "Czyste zdjęcie"
  "Karuzela"

UI per social entry (nie blog):
  - Dropdown "Tryb graficzny" pod sekcją hashtagi
  - Pole tekstowe "Wskazówka graficzna" (placeholder: "np. kawa w biurze, ciepłe kolory")

CSV final (istniejący przycisk "Pobierz plan CSV"):
  - 2 nowe kolumny: "Tryb graficzny" | "Wskazówka graficzna"
  - Puste jeśli nie wypełnione
  - Tylko jeśli jakiekolwiek entry ma wypełniony tryb (analogicznie do hasAnyGenerated)

Persystencja:
  - Dodać do PersistedState: entryGraphicMode, entryVisualDirection
  - SCHEMA_VERSION: 2 → 3
  - Restore effect + save effect + resetAll()
```

**Nie wchodzi w scope:**
- AI-generowany visual_direction (osobny etap, osobny koszt API)
- Upload assetów / podgląd grafiki
- Blog entries — mają visual_brief w single-gen flow, nie potrzebują graphic_mode
- Batch visual direction (auto-fill dla wszystkich entries naraz)

---

## 6. Ryzyko

| Ryzyko | Praw. | Wpływ | Mitygacja |
|--------|-------|-------|-----------|
| UI per entry przeładowane (6 pól) | średnie | niski | Pola opcjonalne, zajmują 1 wiersz dropdown + 1 input — do oceny po wdrożeniu |
| SCHEMA_VERSION bump kasuje sesje | pewne | niski | Clear-on-mismatch już obsługuje |
| Scope creep → AI per entry | niskie | wysoki | Twarda granica w scope: "bez AI per entry" |
| Dropdown "— wybierz —" nie trafia do CSV | brak | brak | Jeśli puste → pusta kolumna w CSV |

---

## 7. Czego świadomie nie robimy teraz

| Element | Powód |
|---------|-------|
| AI-generowany visual_direction per entry | Osobny prompt per entry = koszty + latency + nowy błąd |
| Upload assetów | Much later — storage, backend, UI |
| Generacja grafik AI | Much later |
| WP export test | Externally blocked |
| Backend persistence | Bez auth nie wiadomo "czyje" dane |
| Auth + billing | Much later |
| Social publish | Much later |
| Fallback scraper quality | Polish backlog — poprawa jakości, nie broken flow |
| UX cleanup blog brief (brak kontekstu entry) | Po visual layer, jako uzupełnienie |

---

## 8. Krótka rekomendacja

**Wdrażać: Kierunek A — visual layer (minimal)**

**Dlaczego teraz:**
Core loop jest kompletny (social + blog, per-entry, persystencja, CSV, HTML export). Naturalnym następnym krokiem jest domknięcie outputu — klient dostaje nie tylko tekst, ale też wskazówkę graficzną per entry. To kompletuje brief w jednym CSV.

**Dlaczego nie B:**
Externally blocked. Bez credentials nie domkniemy.

**Dlaczego nie C:**
UX cleanup to polish, nie naprawa. Wchodzi przy okazji następnego etapu.

**Dlaczego nie fallback scraper:**
Jakościowy backlog, nie broken flow. Wymaga diagnozy przed wdrożeniem.

**Minimalny sensowny zakres:**
2 stany, 2 elementy UI per social entry, 2 kolumny w CSV, SCHEMA_VERSION 2→3. Tylko frontend, zero backendu, zero pakietów. ~60-80 linii.
