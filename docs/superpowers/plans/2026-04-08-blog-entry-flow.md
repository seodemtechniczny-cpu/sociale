# Blog Entry Flow Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Blog entry z harmonogramu generuje per-entry, wraca do harmonogramu po generacji, wynik jest widoczny inline i możliwy do pobrania jako HTML.

**Architecture:** Dodajemy `generatedBlogs: Record<string, BlogPost>` (per-entry, analogicznie do `generatedPosts` dla social) + `currentBlogEntryKey` (ephemeral, który entry inicjuje generację). `handleGenerate` dostaje fork: jeśli `briefOrigin === "plan"`, zapisuje do `generatedBlogs` i wraca do `"plan"` zamiast do `"results"`. Social flow i single-gen flow pozostają bez zmian.

**Tech Stack:** React 18, TypeScript — tylko `frontend/src/app/page.tsx`

**Pliki:** Wyłącznie `frontend/src/app/page.tsx`

---

## Zakres zmian

```
Nowe stany:         currentBlogEntryKey, generatedBlogs
Zmienione funkcje:  handleGenerate (1 blok warunkowy), resetAll (2 linie), blog entry onClick
Nowe UI:            inline blog preview per entry (tytuł, snippet, Kopiuj tytuł, Pobierz HTML, Regeneruj)
Persystencja:       PersistedState + generatedBlogs, SCHEMA_VERSION 1→2
CSV:                ocenić na końcu (Task 6) — nie wchodzi w minimalny zakres
```

---

### Task 1: Dodaj typ `BlogPost` i nowe stany

**Plik:** `frontend/src/app/page.tsx`

- [ ] **Krok 1.1: Dodaj interfejs `BlogPost` po interfejsie `SocialPost`**

Istniejący kod (ok. linia 28):
```typescript
interface SocialPost {
  platform: string;
  content: string;
}
```

Dodaj bezpośrednio po nim:
```typescript
interface BlogPost {
  title: string;
  content: string;
  meta_title: string;
  meta_description: string;
}
```

- [ ] **Krok 1.2: Zaktualizuj `GenerateResult.blog_post` żeby używał nowego typu**

Istniejący kod (ok. linia 34):
```typescript
interface GenerateResult {
  social_posts: SocialPost[];
  blog_post: {
    title: string;
    content: string;
    meta_title: string;
    meta_description: string;
  };
```

Zmień na:
```typescript
interface GenerateResult {
  social_posts: SocialPost[];
  blog_post: BlogPost;
```

- [ ] **Krok 1.3: Dodaj nowe stany wewnątrz komponentu `Home`**

Dodaj po deklaracji `generatedPosts` (ok. linia po `const [generatedPosts, setGeneratedPosts] = useState...`):
```typescript
const [generatedBlogs, setGeneratedBlogs] = useState<Record<string, BlogPost>>({});
const [currentBlogEntryKey, setCurrentBlogEntryKey] = useState<string | null>(null);
```

- [ ] **Krok 1.4: Sprawdź TypeScript**

```bash
cd "/Users/michalsmolinski/AUTOMATYZACJE/MVP Blog/Sociale/frontend"
node_modules/.bin/tsc --noEmit 2>&1; echo "EXIT:$?"
```

Oczekiwane: `EXIT:0`

---

### Task 2: Zaktualizuj blog entry click handler

**Plik:** `frontend/src/app/page.tsx`

Blog entry click jest w bloku `isBlog` wewnątrz map entries (ok. linia 1026–1046).

- [ ] **Krok 2.1: Zlokalizuj istniejący kod kliknięcia blog entry**

```bash
grep -n "setBriefOrigin.*plan" "/Users/michalsmolinski/AUTOMATYZACJE/MVP Blog/Sociale/frontend/src/app/page.tsx"
```

Zanotuj linię z `setBriefOrigin("plan")` w bloku `isBlog`.

- [ ] **Krok 2.2: Zastąp blok `isBlog` w handlerze onClick**

Istniejący kod w click handlerze:
```typescript
            if (isBlog) {
              const blogTitle = entryTitles[entryKey] || entry.title;
              const idx = analyzeResult.post_titles.findIndex(
                (t) => t === blogTitle
              );
              if (idx >= 0) {
                setSelectedTitle(idx);
              } else {
                setSelectedTitle(0);
                setAnalyzeResult({
                  ...analyzeResult,
                  post_titles: [
                    blogTitle,
                    ...analyzeResult.post_titles,
                  ],
                });
              }
              setBriefOrigin("plan");
              setStep("brief");
            } else if (!generated) {
```

Zmień na:
```typescript
            if (isBlog) {
              const blogGenerated = generatedBlogs[entryKey];
              if (!blogGenerated) {
                // Pierwsze generowanie — przejdź do briefu
                const blogTitle = entryTitles[entryKey] || entry.title;
                const idx = analyzeResult.post_titles.findIndex(
                  (t) => t === blogTitle
                );
                if (idx >= 0) {
                  setSelectedTitle(idx);
                } else {
                  setSelectedTitle(0);
                  setAnalyzeResult({
                    ...analyzeResult,
                    post_titles: [
                      blogTitle,
                      ...analyzeResult.post_titles,
                    ],
                  });
                }
                setCurrentBlogEntryKey(entryKey);
                setNote(entryDescriptions[entryKey] || entry.description);
                setBriefOrigin("plan");
                setStep("brief");
              }
              // Jeśli blog już wygenerowany — kliknięcie karty nic nie robi
              // (używaj przycisku Regeneruj w inline preview)
            } else if (!generated) {
```

- [ ] **Krok 2.3: Sprawdź TypeScript**

```bash
cd "/Users/michalsmolinski/AUTOMATYZACJE/MVP Blog/Sociale/frontend"
node_modules/.bin/tsc --noEmit 2>&1; echo "EXIT:$?"
```

Oczekiwane: `EXIT:0`

---

### Task 3: Zaktualizuj `handleGenerate` — fork plan vs teaser

**Plik:** `frontend/src/app/page.tsx`

- [ ] **Krok 3.1: Zlokalizuj sukces w handleGenerate**

Istniejący kod (ok. linia 342–344):
```typescript
      const data: GenerateResult = await res.json();
      setGenerateResult(data);
      setStep("results");
```

- [ ] **Krok 3.2: Zastąp routing po udanej generacji**

Zmień te 3 linie na:
```typescript
      const data: GenerateResult = await res.json();
      setGenerateResult(data);
      if (briefOrigin === "plan" && currentBlogEntryKey) {
        // Generacja z harmonogramu — zapisz per entry i wróć do planu
        setGeneratedBlogs((prev) => ({ ...prev, [currentBlogEntryKey]: data.blog_post }));
        setCurrentBlogEntryKey(null);
        setStep("plan");
      } else {
        // Single-gen flow z teasera — standard
        setStep("results");
      }
```

- [ ] **Krok 3.3: Sprawdź TypeScript**

```bash
cd "/Users/michalsmolinski/AUTOMATYZACJE/MVP Blog/Sociale/frontend"
node_modules/.bin/tsc --noEmit 2>&1; echo "EXIT:$?"
```

Oczekiwane: `EXIT:0`

---

### Task 4: Dodaj inline blog preview per entry w harmonogramie

**Plik:** `frontend/src/app/page.tsx`

Preview pojawia się po wygenerowaniu, bezpośrednio po div z kartą entry. Wzorowany na istniejącym bloku `{generated && (...)}` dla social (ok. linia 1165).

- [ ] **Krok 4.1: Zlokalizuj blok `{generated && (` dla social**

```bash
grep -n "generated && (" "/Users/michalsmolinski/AUTOMATYZACJE/MVP Blog/Sociale/frontend/src/app/page.tsx"
```

Zanotuj linię. Blog preview dodamy BEZPOŚREDNIO PO `</div>` zamykającym kartę entry (linia ok. 1164 — po całym bloku z kartą, ale wewnątrz `return (...)`).

- [ ] **Krok 4.2: Znajdź dokładne miejsce wstawienia**

Istniejący kod po karcie entry i po bloku social generated (ok. linia 1197-1200):
```typescript
                        )}
                      </div>
                    );
                  })}
```

Wstaw PRZED `</div>` zamykającym render entry (tzn. przed `);` kończącym `return` wewnątrz mapy), po bloku `{generated && (...)}`:

Znajdź kod:
```typescript
                        {generated && (
                          <div className="mt-2 ml-4 p-4 rounded-lg border border-accent/20 bg-accent/5">
```

i dodaj analogiczny blok dla bloga PO zamknięciu bloku `{generated && (...)}`:

```typescript
                        {generatedBlogs[entryKey] && (
                          <div className="mt-2 ml-4 p-4 rounded-lg border border-accent/20 bg-accent/5">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xs font-medium text-accent">
                                Wygenerowany wpis blogowy
                              </span>
                              <div className="flex gap-3">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    navigator.clipboard.writeText(generatedBlogs[entryKey].title);
                                  }}
                                  className="text-xs text-muted hover:text-foreground transition cursor-pointer"
                                >
                                  Kopiuj tytuł
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const blog = generatedBlogs[entryKey];
                                    const slug = (entryTitles[entryKey] || entry.title)
                                      .toLowerCase()
                                      .replace(/[^a-z0-9ąćęłńóśźż]+/gi, "-")
                                      .slice(0, 50);
                                    const blob = new Blob([blog.content], { type: "text/html;charset=utf-8" });
                                    const dlUrl = URL.createObjectURL(blob);
                                    const a = document.createElement("a");
                                    a.href = dlUrl;
                                    a.download = `blog-${slug}.html`;
                                    a.click();
                                    URL.revokeObjectURL(dlUrl);
                                  }}
                                  className="text-xs text-muted hover:text-foreground transition cursor-pointer"
                                >
                                  Pobierz HTML
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const blogTitle = entryTitles[entryKey] || entry.title;
                                    const idx = analyzeResult.post_titles.findIndex(
                                      (t) => t === blogTitle
                                    );
                                    if (idx >= 0) {
                                      setSelectedTitle(idx);
                                    } else {
                                      setSelectedTitle(0);
                                      setAnalyzeResult({
                                        ...analyzeResult,
                                        post_titles: [blogTitle, ...analyzeResult.post_titles],
                                      });
                                    }
                                    setCurrentBlogEntryKey(entryKey);
                                    setNote(entryDescriptions[entryKey] || entry.description);
                                    setBriefOrigin("plan");
                                    setStep("brief");
                                  }}
                                  className="text-xs text-muted hover:text-foreground transition cursor-pointer"
                                >
                                  Regeneruj
                                </button>
                              </div>
                            </div>
                            <p className="text-foreground text-sm font-medium mb-1">
                              {generatedBlogs[entryKey].title}
                            </p>
                            <p className="text-muted text-xs leading-relaxed line-clamp-3">
                              {generatedBlogs[entryKey].content.replace(/<[^>]+>/g, "").slice(0, 250)}…
                            </p>
                          </div>
                        )}
```

- [ ] **Krok 4.3: Zaktualizuj wskazówkę tekstową dla blog entry**

Istniejący kod (ok. linia 1117-1120):
```typescript
                          {isBlog && (
                            <p className="text-accent text-xs mt-2 font-medium">
                              Kliknij, aby wygenerować wpis blogowy &rarr;
                            </p>
                          )}
```

Zmień na (ukryj wskazówkę jeśli już wygenerowany):
```typescript
                          {isBlog && !generatedBlogs[entryKey] && (
                            <p className="text-accent text-xs mt-2 font-medium">
                              Kliknij, aby wygenerować wpis blogowy &rarr;
                            </p>
                          )}
                          {isBlog && generatedBlogs[entryKey] && (
                            <p className="text-accent text-xs mt-2 font-medium">
                              ✓ Wpis wygenerowany
                            </p>
                          )}
```

- [ ] **Krok 4.4: Sprawdź TypeScript**

```bash
cd "/Users/michalsmolinski/AUTOMATYZACJE/MVP Blog/Sociale/frontend"
node_modules/.bin/tsc --noEmit 2>&1; echo "EXIT:$?"
```

Oczekiwane: `EXIT:0`

---

### Task 5: resetAll + PersistedState + SCHEMA_VERSION bump

**Plik:** `frontend/src/app/page.tsx`

- [ ] **Krok 5.1: Dodaj reset generatedBlogs i currentBlogEntryKey w resetAll()**

Zlokalizuj `setGeneratedPosts({});` w resetAll i dodaj po nim:
```typescript
    setGeneratedBlogs({});
    setCurrentBlogEntryKey(null);
```

- [ ] **Krok 5.2: Dodaj generatedBlogs do PersistedState**

Znajdź w interfejsie `PersistedState`:
```typescript
  selectedEntries: string[];
  generateResult: GenerateResult | null;
}
```

Zmień na:
```typescript
  selectedEntries: string[];
  generateResult: GenerateResult | null;
  generatedBlogs: Record<string, BlogPost>;
}
```

- [ ] **Krok 5.3: Bump SCHEMA_VERSION**

Zmień:
```typescript
const SCHEMA_VERSION = 1;
```

na:
```typescript
const SCHEMA_VERSION = 2;
```

- [ ] **Krok 5.4: Dodaj generatedBlogs do restore effect**

W restore effect, po `setGenerateResult(saved.generateResult);` dodaj:
```typescript
      setGeneratedBlogs(saved.generatedBlogs ?? {});
```

(`?? {}` jako zabezpieczenie gdyby stary format nie miał tego pola — choć clear-on-mismatch to obsłuży, to defensywnie nie zaszkodzi)

- [ ] **Krok 5.5: Dodaj generatedBlogs do save effect**

W obiekcie `state` w save effect, po `generateResult,` dodaj:
```typescript
        generatedBlogs,
```

Dodaj też `generatedBlogs` do tablicy zależności useEffect (po `generateResult,`):
```typescript
  }, [
    step, url, analyzeResult, selectedTitle, briefOrigin,
    goal, promote, style, avoid, note, hashtags,
    planWeeks, planPostsPerWeek, planScope, planPlatforms,
    planPromote, planStyle, planAvoid, planNote, planResult,
    generatedPosts, entryHashtags, entrySlots, entryTitles,
    entryDescriptions, selectedEntries, generateResult, generatedBlogs,
  ]);
```

- [ ] **Krok 5.6: Sprawdź TypeScript**

```bash
cd "/Users/michalsmolinski/AUTOMATYZACJE/MVP Blog/Sociale/frontend"
node_modules/.bin/tsc --noEmit 2>&1; echo "EXIT:$?"
```

Oczekiwane: `EXIT:0`

---

### Task 6: Oceń rozszerzenie plan CSV

**Decyzja do podjęcia w tym tasku** (nie zaślepka — faktyczna ocena na podstawie kodu):

Plan CSV (przycisk "Pobierz plan CSV") zawiera kolumny:
`Tydzień;Dzień;Platforma;Typ;Tytuł;Opis;Wygenerowany post`

Opcje dla blog entries:
- **A) Bez zmian** — blog entries w CSV mają pustą kolumnę "Wygenerowany post". Eksport per-entry przez "Pobierz HTML" wystarczy.
- **B) Dodaj kolumnę "Wpis wygenerowany"** — proste `"tak"/"nie"` dla blog entries w istniejącej kolumnie zamiast treści HTML. Daje sygnał że blog istnieje bez zaśmiecania CSV.
- **C) Nowa kolumna "Tytuł bloga"** — tylko tytuł wygenerowanego bloga (bez HTML). Czytelne w Excelu.

**Rekomendacja po ocenie:** Opcja **C** — dodać tytuł bloga jako osobną kolumnę (tylko dla blog entries). Pełne HTML nie wchodzi do CSV (zbyt duże, nieczytelne w Excelu). Eksport treści to "Pobierz HTML" per entry.

- [ ] **Krok 6.1: Zaktualizuj nagłówek CSV i logikę wierszy**

Zlokalizuj w "Pobierz plan (CSV)" onclick:
```typescript
                const header = hasAnyGenerated
                  ? "Tydzień;Dzień;Platforma;Typ;Tytuł;Opis;Wygenerowany post"
                  : "Tydzień;Dzień;Platforma;Typ;Tytuł;Opis";
```

Zmień na (zawsze dodajemy kolumnę "Tytuł bloga", bez względu na `hasAnyGenerated`):
```typescript
                const hasAnyBlogGenerated = Object.keys(generatedBlogs).length > 0;
                const header = [
                  "Tydzień", "Dzień", "Platforma", "Typ", "Tytuł", "Opis",
                  ...(hasAnyGenerated ? ["Wygenerowany post"] : []),
                  ...(hasAnyBlogGenerated ? ["Tytuł bloga"] : []),
                ].join(";");
```

Zlokalizuj budowanie wiersza w `rows`:
```typescript
                  const base = [e.week, slot, e.platform, e.content_type, `"${title.replace(/"/g, '""')}"`, `"${desc.replace(/"/g, '""')}"`];
                  if (hasAnyGenerated) {
                    base.push(gen ? `"${gen.content.replace(/"/g, '""')}"` : "");
                  }
                  return base.join(";");
```

Zmień na:
```typescript
                  const blogGen = generatedBlogs[key];
                  const base = [e.week, slot, e.platform, e.content_type, `"${title.replace(/"/g, '""')}"`, `"${desc.replace(/"/g, '""')}"`];
                  if (hasAnyGenerated) {
                    base.push(gen ? `"${gen.content.replace(/"/g, '""')}"` : "");
                  }
                  if (hasAnyBlogGenerated) {
                    base.push(blogGen ? `"${blogGen.title.replace(/"/g, '""')}"` : "");
                  }
                  return base.join(";");
```

- [ ] **Krok 6.2: Sprawdź TypeScript**

```bash
cd "/Users/michalsmolinski/AUTOMATYZACJE/MVP Blog/Sociale/frontend"
node_modules/.bin/tsc --noEmit 2>&1; echo "EXIT:$?"
```

Oczekiwane: `EXIT:0`

---

### Task 7: Build + manual E2E test

- [ ] **Krok 7.1: Build produkcyjny**

```bash
cd "/Users/michalsmolinski/AUTOMATYZACJE/MVP Blog/Sociale/frontend"
npm run build 2>&1 | tail -15
```

Oczekiwane: `✓ Compiled successfully`

- [ ] **Krok 7.2: Test blog entry flow**

Uruchom dev server: `npm run dev`

Scenariusz A — pierwsze generowanie:
1. Wejdź w plan z blog entry
2. Kliknij blog entry → powinien przejść do briefu z "Wróć do harmonogramu"
3. Kliknij Generuj
4. Oczekiwane: wraca do harmonogramu (nie do "results")
5. Oczekiwane: blog entry pokazuje "✓ Wpis wygenerowany" i inline preview (tytuł + snippet)
6. Oczekiwane: przyciski "Kopiuj tytuł", "Pobierz HTML", "Regeneruj" są widoczne

Scenariusz B — Pobierz HTML:
1. Kliknij "Pobierz HTML" przy wygenerowanym wpisie
2. Oczekiwane: pobranie pliku `.html` z nazwą opartą na tytule

Scenariusz C — Regeneruj:
1. Kliknij "Regeneruj" → wraca do briefu
2. Zmień brief i kliknij Generuj
3. Oczekiwane: inline preview aktualizuje się nową treścią, znowu wróciło do harmonogramu

Scenariusz D — kliknięcie karty po wygenerowaniu:
1. Kliknij kartę blog entry która MA już wygenerowany wpis
2. Oczekiwane: nic się nie dzieje (nie przechodzi do briefu)

Scenariusz E — social flow bez zmian:
1. Kliknij social entry → generuje post inline bez przechodzenia do briefu
2. Social i blog obok siebie w planie działają niezależnie

Scenariusz F — restore po reload:
1. Wygeneruj blog dla entry
2. Odśwież stronę
3. Oczekiwane: plan wraca, inline preview bloga jest zachowany

Scenariusz G — single-gen flow z teasera bez zmian:
1. Z kroku "teaser" wejdź w brief (przez "Przejdź dalej")
2. Wygeneruj
3. Oczekiwane: ląduje na "results" (bez zmian)

---

## Uwagi implementacyjne

**Dlaczego `currentBlogEntryKey` nie jest persystowany:**
Jest to ephemeral — opisuje trwającą sesję generacji. Po reloadzie brief jest pusty, więc nie ma co przywracać. Persystujemy `generatedBlogs` (wyniki), nie klucz aktywnej generacji.

**Dlaczego `setNote(entryDescriptions[entryKey] || entry.description)`:**
Pre-fill `note` w briefie z opisu entry daje LLM dodatkowy kontekst. Użytkownik może to zmienić w briefie. Akceptowalne nadpisanie — użytkownik wrócił do briefu z konkretnym entry.

**`?? {}` w restore dla generatedBlogs:**
Defensywne — `SCHEMA_VERSION` już obsłuży mismatch przez clear. Ale jeśli ktoś ma v2 storage bez tego pola z innego powodu, nie wybuchnie z TypeError.

**HTML w CSV — nie:**
Blog post content to 3-8KB HTML. W CSV z separatorem `;` Excel traktuje `<`, `>` jako znaki specjalne. Tytuł bloga w CSV jest czytelny, bezpieczny i wystarczający. Pełny eksport to "Pobierz HTML" per entry.
