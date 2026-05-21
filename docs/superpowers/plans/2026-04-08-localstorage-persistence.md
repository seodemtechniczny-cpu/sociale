# localStorage Persistence — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persystować kluczowy stan pracy użytkownika w localStorage tak, żeby odświeżenie strony nie powodowało utraty analizy, planu, refinementów i wygenerowanych postów.

**Architecture:** Jeden `useEffect` z pustą tablicą zależności przywraca stan przy montowaniu komponentu. Drugi `useEffect` zapisuje stan przy każdej zmianie persystowanych zmiennych. `resetAll()` czyści storage. `Set<string>` serializowany jako `string[]`.

**Tech Stack:** React 18 `useState`, `useEffect`, `localStorage` API, TypeScript

**Tylko plik:** `frontend/src/app/page.tsx`

---

## Zakres persystowanego stanu

**Zapisujemy:**
- `step` — aktualny krok flow
- `url` — URL który użytkownik analizował
- `analyzeResult` — wynik analizy (teaser)
- `selectedTitle` — wybrany tytuł posta z teasera
- `briefOrigin` — skąd pochodzi brief ("teaser" | "plan")
- `goal`, `promote`, `style`, `avoid`, `note`, `hashtags` — pola briefu single-gen
- `planWeeks`, `planPostsPerWeek`, `planScope`, `planPlatforms`, `planPromote`, `planStyle`, `planAvoid`, `planNote` — ustawienia plannera
- `planResult` — wygenerowany plan
- `generatedPosts` — wygenerowane treści social per entry (najcenniejsze)
- `entryHashtags`, `entrySlots`, `entryTitles`, `entryDescriptions` — overrides per entry
- `selectedEntries` — zaznaczone wiersze (jako `string[]` w JSON)
- `generateResult` — wyniki single-gen flow (blog, SEO, visual brief, posty)

**Nie zapisujemy:**
- `loading`, `error` — transient
- `postLoadingKeys`, `slowLoadingKeys` — ephemeral loading state
- `singlePostErrors`, `batchProgress`, `slowTimers` — ephemeral
- `showExportForm`, `wpUrl`, `wpUser`, `wpAppPassword`, `exportLoading`, `exportMessage` — sensytywne / ephemeral

---

### Task 1: Dodaj stałe i typ `PersistedState`

**Plik:** `frontend/src/app/page.tsx`

Dodaj bezpośrednio po bloku `// --- Types ---`, przed `// --- Component ---`.

- [ ] **Krok 1.1: Dodaj stałe i interfejs `PersistedState`**

Wstaw po ostatnim istniejącym interfejsie (`PlanResult`), przed linią `type Step = ...`:

```typescript
// --- Persistence ---

const STORAGE_KEY = "sociale_v1";
const SCHEMA_VERSION = 1;

interface PersistedState {
  _v: number;
  step: Step;
  url: string;
  analyzeResult: AnalyzeResult | null;
  selectedTitle: number | null;
  briefOrigin: "teaser" | "plan";
  goal: string;
  promote: string;
  style: string;
  avoid: string;
  note: string;
  hashtags: string;
  planWeeks: number;
  planPostsPerWeek: number;
  planScope: "blog" | "social" | "both";
  planPlatforms: string[];
  planPromote: string;
  planStyle: string;
  planAvoid: string;
  planNote: string;
  planResult: PlanResult | null;
  generatedPosts: Record<string, { platform: string; content: string }>;
  entryHashtags: Record<string, string>;
  entrySlots: Record<string, string>;
  entryTitles: Record<string, string>;
  entryDescriptions: Record<string, string>;
  selectedEntries: string[];
  generateResult: GenerateResult | null;
}
```

- [ ] **Krok 1.2: Weryfikacja — sprawdź, czy TypeScript akceptuje nowe typy**

```bash
cd "/Users/michalsmolinski/AUTOMATYZACJE/MVP Blog/Sociale/frontend"
npx tsc --noEmit 2>&1 | head -20
```

Oczekiwane: brak błędów (nowe typy jeszcze nie są używane, więc TypeScript nie zgłosi problemu).

---

### Task 2: Restore effect — przywróć stan przy montowaniu

**Plik:** `frontend/src/app/page.tsx`

Dodaj `useEffect` wewnątrz komponentu `Home`, po bloku deklaracji wszystkich stanów (po linii `const [error, setError] = useState("")`), przed funkcją `resetAll()`.

- [ ] **Krok 2.1: Dodaj import `useEffect`**

Zmień linię:
```typescript
import { useState, useRef } from "react";
```
na:
```typescript
import { useState, useRef, useEffect } from "react";
```

- [ ] **Krok 2.2: Dodaj restore effect po deklaracjach stanu**

Wstaw bezpośrednio przed `function resetAll()`:

```typescript
// --- Restore from localStorage on mount ---
useEffect(() => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const saved: PersistedState = JSON.parse(raw);
    if (saved._v !== SCHEMA_VERSION) {
      localStorage.removeItem(STORAGE_KEY);
      return;
    }
    setStep(saved.step);
    setUrl(saved.url);
    setAnalyzeResult(saved.analyzeResult);
    setSelectedTitle(saved.selectedTitle);
    setBriefOrigin(saved.briefOrigin);
    setGoal(saved.goal);
    setPromote(saved.promote);
    setStyle(saved.style);
    setAvoid(saved.avoid);
    setNote(saved.note);
    setHashtags(saved.hashtags);
    setPlanWeeks(saved.planWeeks);
    setPlanPostsPerWeek(saved.planPostsPerWeek);
    setPlanScope(saved.planScope);
    setPlanPlatforms(saved.planPlatforms);
    setPlanPromote(saved.planPromote);
    setPlanStyle(saved.planStyle);
    setPlanAvoid(saved.planAvoid);
    setPlanNote(saved.planNote);
    setPlanResult(saved.planResult);
    setGeneratedPosts(saved.generatedPosts);
    setEntryHashtags(saved.entryHashtags);
    setEntrySlots(saved.entrySlots);
    setEntryTitles(saved.entryTitles);
    setEntryDescriptions(saved.entryDescriptions);
    setSelectedEntries(new Set(saved.selectedEntries));
    setGenerateResult(saved.generateResult);
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
}, []);
```

- [ ] **Krok 2.3: Weryfikacja TypeScript**

```bash
cd "/Users/michalsmolinski/AUTOMATYZACJE/MVP Blog/Sociale/frontend"
npx tsc --noEmit 2>&1 | head -30
```

Oczekiwane: brak błędów. Jeśli TypeScript zgłosi błąd o `saved.step` (typ `string` zamiast `Step`), popraw rzutowanie: `saved.step as Step`.

---

### Task 3: Save effect — zapisuj stan przy każdej zmianie

**Plik:** `frontend/src/app/page.tsx`

Dodaj drugi `useEffect` bezpośrednio po restore effect (przed `function resetAll()`).

- [ ] **Krok 3.1: Dodaj save effect**

```typescript
// --- Save to localStorage on state change ---
useEffect(() => {
  try {
    const state: PersistedState = {
      _v: SCHEMA_VERSION,
      step,
      url,
      analyzeResult,
      selectedTitle,
      briefOrigin,
      goal,
      promote,
      style,
      avoid,
      note,
      hashtags,
      planWeeks,
      planPostsPerWeek,
      planScope,
      planPlatforms,
      planPromote,
      planStyle,
      planAvoid,
      planNote,
      planResult,
      generatedPosts,
      entryHashtags,
      entrySlots,
      entryTitles,
      entryDescriptions,
      selectedEntries: Array.from(selectedEntries),
      generateResult,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // localStorage may be full or unavailable (private mode); silently ignore
  }
}, [
  step, url, analyzeResult, selectedTitle, briefOrigin,
  goal, promote, style, avoid, note, hashtags,
  planWeeks, planPostsPerWeek, planScope, planPlatforms,
  planPromote, planStyle, planAvoid, planNote, planResult,
  generatedPosts, entryHashtags, entrySlots, entryTitles,
  entryDescriptions, selectedEntries, generateResult,
]);
```

- [ ] **Krok 3.2: Weryfikacja TypeScript**

```bash
cd "/Users/michalsmolinski/AUTOMATYZACJE/MVP Blog/Sociale/frontend"
npx tsc --noEmit 2>&1 | head -30
```

Oczekiwane: brak błędów.

---

### Task 4: Zaktualizuj `resetAll()` — clear localStorage

**Plik:** `frontend/src/app/page.tsx`

- [ ] **Krok 4.1: Dodaj `localStorage.removeItem` na początku `resetAll()`**

Istniejący kod `resetAll()` zaczyna się od:
```typescript
function resetAll() {
  setStep("landing");
```

Zmień na:
```typescript
function resetAll() {
  localStorage.removeItem(STORAGE_KEY);
  setStep("landing");
```

- [ ] **Krok 4.2: Weryfikacja TypeScript**

```bash
cd "/Users/michalsmolinski/AUTOMATYZACJE/MVP Blog/Sociale/frontend"
npx tsc --noEmit 2>&1 | head -20
```

Oczekiwane: brak błędów.

---

### Task 5: Przycisk "Zacznij od nowa" z potwierdzeniem

**Plik:** `frontend/src/app/page.tsx`

Przycisk `resetAll()` już istnieje w UI. Chcemy dodać potwierdzenie, żeby użytkownik nie skasował przypadkowo całej pracy.

- [ ] **Krok 5.1: Znajdź istniejący przycisk resetAll w UI**

```bash
cd "/Users/michalsmolinski/AUTOMATYZACJE/MVP Blog/Sociale/frontend"
grep -n "resetAll" src/app/page.tsx
```

Zanotuj numer linii wywołania `resetAll()` w JSX (nie deklaracji funkcji).

- [ ] **Krok 5.2: Dodaj confirm() do wywołania przycisku**

Znajdź wywołanie `onClick={resetAll}` lub `onClick={() => resetAll()}` w JSX i zmień na:

```typescript
onClick={() => {
  if (window.confirm("Zresetować sesję? Cały plan, refinementy i wygenerowane posty zostaną usunięte.")) {
    resetAll();
  }
}}
```

- [ ] **Krok 5.3: Weryfikacja TypeScript**

```bash
cd "/Users/michalsmolinski/AUTOMATYZACJE/MVP Blog/Sociale/frontend"
npx tsc --noEmit 2>&1 | head -20
```

Oczekiwane: brak błędów.

---

### Task 6: Test manualny E2E

- [ ] **Krok 6.1: Uruchom dev server**

```bash
cd "/Users/michalsmolinski/AUTOMATYZACJE/MVP Blog/Sociale/frontend"
npm run dev
```

- [ ] **Krok 6.2: Przetestuj restore po reloadzie**

Kroki testowe:
1. Otwórz `http://localhost:3000`
2. Wpisz URL i wykonaj analizę → przejdź do kroku "teaser"
3. Odśwież stronę (F5)
4. Oczekiwane: strona wraca do kroku "teaser" z wynikami analizy, nie do "landing"

- [ ] **Krok 6.3: Przetestuj restore po wygenerowaniu planu**

Kroki testowe:
1. Wejdź do planu, wygeneruj plan
2. Zrób refinement jednego wpisu (zmień tytuł)
3. Wygeneruj post dla jednego wpisu
4. Odśwież stronę
5. Oczekiwane: plan jest przywrócony, refinementy są zachowane, wygenerowany post jest widoczny

- [ ] **Krok 6.4: Przetestuj clear-on-mismatch (opcjonalny)**

W DevTools → Application → localStorage: zmień `_v` na `99`. Odśwież.
Oczekiwane: strona startuje od "landing" (stary storage zignorowany i usunięty).

- [ ] **Krok 6.5: Przetestuj "Zacznij od nowa"**

1. Będąc na dowolnym kroku poza "landing"
2. Kliknij "Zacznij od nowa"
3. Potwierdź w dialogu
4. Oczekiwane: powrót do "landing", localStorage wyczyszczony
5. Odśwież stronę → oczekiwane: "landing" (nie przywraca starego stanu)

- [ ] **Krok 6.6: Build produkcyjny**

```bash
cd "/Users/michalsmolinski/AUTOMATYZACJE/MVP Blog/Sociale/frontend"
npm run build 2>&1 | tail -10
```

Oczekiwane: `✓ Compiled successfully` bez błędów TypeScript.

---

## Uwagi implementacyjne

**Dlaczego `useEffect([])` zamiast lazy `useState` initializer:**
Next.js App Router SSR renderuje komponent na serwerze, gdzie `localStorage` nie istnieje. `useEffect` uruchamia się tylko po stronie klienta (po hydratacji), co jest bezpieczne. Lazy `useState(() => localStorage.getItem(...))` rzuciłby `ReferenceError` podczas SSR.

**Dlaczego brak debounce:**
Przy danych rzędu kilkudziesięciu KB i zapisach lokalnych debounce to mikro-optymalizacja, która dodaje złożoność (`useRef` dla timera). Nie wchodzi w minimalny zakres.

**`try/catch` wokół setItem:**
`localStorage` jest niedostępny w trybie prywatnym (Safari) i może rzucić `QuotaExceededError` gdy pełny. Milczące ignorowanie jest właściwym zachowaniem — aplikacja działa, po prostu bez persystencji.

**Migracja przy dodaniu nowych pól (np. visual layer):**
Zmień `SCHEMA_VERSION` z `1` na `2`. Stary storage (z `_v: 1`) zostanie automatycznie wyczyszczony przez restore effect.
