from openai import OpenAI, NotFoundError

from app.core.config import settings
from app.core.logging import logger
from app.models.schemas import GenerateResponse, PlanResponse, SinglePostResponse

ECOMMERCE_SIGNALS = [
    "sklep", "koszyk", "cena", "produkt", "zamów", "kup", "dostawa",
    "wysyłka", "shop", "cart", "price", "order", "buy", "shipping",
    "e-commerce", "ecommerce", "oferta", "promocja", "rabat",
    "dodaj do koszyka", "add to cart", "sprzedaż", "kategorie produktów",
    "woocommerce", "shopify",
]

GENERIC_HEADINGS = {
    "polecane produkty", "polecane", "bestsellery", "nowości", "new",
    "featured", "menu", "kontakt", "contact", "newsletter", "footer",
    "header", "sidebar", "kategorie", "categories",
}

# ---------------------------------------------------------------------------
# Offer profile signals — detects nuances beyond ecommerce/usługi
# ---------------------------------------------------------------------------

OFFER_PROFILE_SIGNALS = {
    "premium": [
        "premium", "luxury", "luksus", "ekskluzywn", "prestiż", "prestige",
        "high-end", "vip", "limitat", "limited edition", "unikat",
    ],
    "import": [
        "import", "sprowadz", "z japonii", "z usa", "ze stanów", "z niemiec",
        "z zagranicy", "z korei", "z europy", "z chin", "from japan", "from usa",
        "importowa", "importowan",
    ],
    "used_inventory": [
        "używan", "second hand", "poleasingow", "z przebiegiem", "km",
        "gotow", "od ręki", "na placu", "w ofercie", "egzemplarz",
        "sprawdzon", "oględzin", "historia pojazdu", "bezwypadkow",
    ],
    "brokerage_service": [
        "pośredni", "pośrednik", "broker", "sourcing", "wyszuka",
        "znajdziemy", "sprowadzi", "na zamówienie", "zlec",
        "organizacja transportu", "odprawa celna", "homologacja",
        "rejestracja", "przegląd", "serwis", "konserwacja",
    ],
    "gastro": [
        "restauracja", "bistro", "kawiarnia", "menu", "kuchnia",
        "szef kuchni", "danie", "dania", "rezerwacja", "catering",
        "food", "gastro", "bar", "pizzeria", "sushi",
    ],
    "beauty_wellness": [
        "salon kosmetyczn", "salon beauty", "salon fryzjer", "spa", "gabinet",
        "zabieg", "kosmetyk", "masaż", "fryzjer", "barber", "manicure",
        "pedicure", "beauty", "wellness", "pielęgnacja", "estetyczn",
    ],
    "tech_digital": [
        "software", "saas", "aplikacja", "platforma", "system",
        "ai", "automatyzacja", "integracja", "api", "cloud",
        "digital", "online tool", "narzędzie online",
    ],
    "education": [
        "kurs", "szkolenie", "webinar", "coaching", "mentor",
        "edukacja", "nauczanie", "certyfikat", "akademia",
        "e-learning", "wiedza", "kompetencj",
    ],
}


def _detect_offer_profile(scraped: dict) -> dict:
    """Detect nuanced business/offer profile from scraped page content.

    Returns a dict with:
      - signals: dict of profile_key -> hit count
      - top_profiles: list of top 1-3 profile keys (most hits)
      - profile_summary: human-readable 1-liner for prompt injection
    """
    blob = " ".join([
        scraped.get("title", ""),
        scraped.get("description", ""),
        " ".join(scraped.get("h1", [])),
        " ".join(scraped.get("h2", [])),
        scraped.get("text", ""),
    ]).lower()

    signals = {}
    for profile_key, keywords in OFFER_PROFILE_SIGNALS.items():
        hits = sum(1 for kw in keywords if kw in blob)
        if hits > 0:
            signals[profile_key] = hits

    # Sort by hit count, take top 3
    top = sorted(signals.items(), key=lambda x: -x[1])[:3]
    top_profiles = [k for k, _ in top]

    # Build human-readable summary
    profile_labels = {
        "premium": "oferta premium/luksusowa",
        "import": "import/sprowadzanie z zagranicy",
        "used_inventory": "gotowe egzemplarze / używane / sprawdzone",
        "brokerage_service": "usługa pośrednictwa / serwis / logistyka",
        "gastro": "gastronomia / restauracja",
        "beauty_wellness": "beauty / wellness / salon",
        "tech_digital": "technologia / software / digital",
        "education": "edukacja / szkolenia / kursy",
    }

    if top_profiles:
        labels = [profile_labels.get(p, p) for p in top_profiles]
        profile_summary = "Profil oferty: " + ", ".join(labels) + "."
    else:
        profile_summary = ""

    return {
        "signals": signals,
        "top_profiles": top_profiles,
        "profile_summary": profile_summary,
    }


def _detect_business_type(scraped: dict) -> str:
    """Szukamy słów ecommerce w metadanych + raw_text strony."""
    blob = " ".join([
        scraped.get("title", ""),
        scraped.get("description", ""),
        " ".join(scraped.get("h1", [])),
        " ".join(scraped.get("h2", [])),
        scraped.get("text", ""),
        scraped.get("raw_text", ""),
    ]).lower()

    hits = sum(1 for word in ECOMMERCE_SIGNALS if word in blob)
    logger.debug(f"[TEASER] Ecommerce signal hits: {hits}")
    return "ecommerce" if hits >= 2 else "usługi"


def _build_summary(scraped: dict, business_type: str) -> str:
    """Buduje summary z title + meta description + początek tekstu."""
    parts = []

    title = scraped.get("title", "").strip()
    if title:
        parts.append(title.rstrip(".") + ".")

    desc = scraped.get("description", "").strip()
    if desc:
        parts.append(desc.rstrip(".") + ".")

    # Dodaj treść z paragrafów tylko jeśli wyglądają na prawdziwy content
    # (nie nawigacja/menu) — heurystyka: zdanie >40 znaków, >=6 słów, bez sklejonych wyrazów
    text = scraped.get("text", "").strip()
    if text and len(text) > 150:
        sentences = text.replace("…", ".").split(".")
        for s in sentences[:10]:
            s = s.strip()
            words = s.split()
            if len(s) > 40 and len(words) >= 6:
                parts.append(s.rstrip(".") + ".")
                if len(parts) >= 4:
                    break

    if not parts:
        type_label = "sklep internetowy" if business_type == "ecommerce" else "firma usługowa"
        return f"Strona wygląda na {type_label}. Nie udało się wyciągnąć szczegółowego opisu."

    summary = " ".join(parts)
    # Limit do ~300 znaków
    if len(summary) > 300:
        summary = summary[:297].rsplit(" ", 1)[0] + "…"
    return summary


def _generate_titles(scraped: dict, business_type: str) -> list:
    """Generuje 5 tytułów na bazie matryc szablonowych + danych ze strony."""
    title = scraped.get("title", "Twoja firma")
    h2_list = scraped.get("h2", [])
    h1_list = scraped.get("h1", [])

    # Wyciągnij nazwę firmy z title — bierzemy segment po separatorze
    # bo zwykle format to "Opis — Brand" lub "Opis | Brand"
    brand = title
    for sep in [" – ", " — ", " - ", " | "]:
        if sep in brand:
            parts = brand.split(sep)
            # Brand to zwykle najkrótszy segment
            brand = min(parts, key=len).strip()
            break

    if not brand or len(brand) < 2:
        brand = title

    # Zbierz tematy z nagłówków — pomijamy generyczne
    topics = []
    for h in (h1_list + h2_list):
        cleaned = h.strip()
        if not cleaned or len(cleaned) <= 3:
            continue
        if cleaned.lower() in GENERIC_HEADINGS:
            continue
        if cleaned.lower() == brand.lower():
            continue
        topics.append(cleaned)

    # Fallback: jeśli brak sensownych nagłówków, wyciągnij temat z title
    if not topics:
        # Bierzemy część title która nie jest brandem
        title_topic = title
        for sep in [" – ", " — ", " - ", " | "]:
            if sep in title_topic:
                parts = [p.strip() for p in title_topic.split(sep)]
                # Bierzemy najdłuższy segment (opis, nie brand)
                title_topic = max(parts, key=len)
                break
        if title_topic and title_topic != brand:
            topics.append(title_topic)

    # Szablony
    titles = []

    if business_type == "ecommerce":
        templates = [
            "Jak wybrać najlepszy {topic}? Praktyczny przewodnik",
            "5 rzeczy, które warto wiedzieć przed zakupem w {brand}",
            "Dlaczego klienci wybierają {brand}? Sprawdź opinie i ofertę",
            "Trendy 2026: co warto kupić w kategorii {topic}",
            "Poradnik zakupowy: {topic} — na co zwrócić uwagę",
        ]
    else:
        templates = [
            "Jak {brand} pomaga swoim klientom? Przegląd usług",
            "5 powodów, dla których warto skorzystać z {topic}",
            "Czym wyróżnia się {brand} na tle konkurencji?",
            "Kompleksowy przewodnik po usługach: {topic}",
            "Jak wybrać najlepszego dostawcę w zakresie {topic}?",
        ]

    for i, tpl in enumerate(templates):
        topic = topics[i % len(topics)] if topics else "oferowanych rozwiązań"
        filled = tpl.format(brand=brand, topic=topic)
        titles.append(filled)

    return titles[:5]


async def generate_teaser(scraped_data: dict) -> dict:
    """Heurystyka: wykrywa typ biznesu, buduje summary i tytuły z danych strony."""
    # Detect blocked / empty scrape — don't make confident assumptions
    is_blocked = scraped_data.get("_blocked", False)
    is_empty = not any([
        scraped_data.get("title"),
        scraped_data.get("description"),
        scraped_data.get("h1"),
        scraped_data.get("text"),
    ])

    if is_blocked or is_empty:
        logger.warning("[TEASER] Scraped data is empty or blocked — returning cautious fallback")
        return {
            "business_type": "nieznany",
            "summary": (
                "Nie udało się odczytać treści strony — strona może wymagać logowania, "
                "JavaScript lub blokuje automatyczne pobieranie. "
                "Uzupełnij opis firmy ręcznie lub spróbuj ponownie z innym adresem."
            ),
            "post_titles": [
                "Kim jesteśmy i co oferujemy? Poznaj naszą firmę",
                "5 powodów, dla których warto skorzystać z naszych usług",
                "Co wyróżnia nas na rynku? Szczery przegląd oferty",
                "Jak możemy pomóc Twojemu biznesowi? Przegląd rozwiązań",
                "Nasza historia i misja — dlaczego robimy to, co robimy",
            ],
        }

    business_type = _detect_business_type(scraped_data)
    offer_profile = _detect_offer_profile(scraped_data)
    summary = _build_summary(scraped_data, business_type)

    # Enrich summary with offer profile if detected
    if offer_profile["profile_summary"]:
        summary = summary.rstrip(".… ") + ". " + offer_profile["profile_summary"]
        # Re-trim if too long
        if len(summary) > 450:
            summary = summary[:447].rsplit(" ", 1)[0] + "…"

    titles = _generate_titles(scraped_data, business_type)

    logger.info(f"[TEASER] Detected business type: {business_type}")
    logger.info(f"[TEASER] Offer profile: {offer_profile['top_profiles']} (signals: {offer_profile['signals']})")
    logger.info(f"[TEASER] Summary: {summary!r}")
    logger.info(f"[TEASER] Generated titles:")
    for i, t in enumerate(titles, 1):
        logger.info(f"[TEASER]   {i}. {t}")

    return {
        "business_type": business_type,
        "summary": summary,
        "post_titles": titles,
    }


SYSTEM_PROMPT = """Jesteś doświadczonym copywriterem i strategiem marketingowym.
Na podstawie briefu klienta tworzysz kompletny pakiet treści marketingowych w języku polskim.

POSTY SOCIAL MEDIA — 3 sztuki, każdy inny w tonie i formacie:
- LinkedIn: profesjonalny, merytoryczny insight lub statystyka branżowa. Bez emoji. CTA subtelne (np. „Sprawdź", „Napisz w komentarzu").
  HASHTAGI: 1–3 hashtagów. Branżowe, profesjonalne. Umieść na końcu posta, oddzielone pustą linią.
- Facebook: konwersacyjny, angażujący. Zadaj pytanie odbiorcom. Emoji OK ale oszczędnie. CTA naturalne (np. „A jak to wygląda u Was?").
  HASHTAGI: 0–3 hashtagów. Opcjonalne, tylko jeśli pasują naturalnie. Jeśli są, umieść na końcu posta.
- Instagram: zwięzły, visual-first. Tekst pod grafikę. Zakończ CTA do bio/linku.
  HASHTAGI: 5–10 hashtagów na końcu posta, oddzielone pustą linią. Mix: 2–3 popularne ogólne + 3–5 niszowych branżowych + 1–2 związane z tematem posta.
Każdy post musi być wyraźnie inny — nie rób trzech wersji tego samego tekstu.

ZASADY HASHTAGÓW (wszystkie platformy):
- Hashtagi muszą być dopasowane do: branży klienta, tematu posta, celu treści i stylu komunikacji.
- Jeśli klient podał własne hashtagi — uwzględnij je, dodaj swoje dopasowane, usuń duplikaty.
- Nie powtarzaj tych samych hashtagów w każdym poście — różnicuj.
- Hashtagi pisz po polsku, chyba że angielski termin jest bardziej naturalny w branży (np. #ecommerce, #marketing).
- Nie używaj hashtagów-spamu ani generycznych typu #post #content #foto.

WPIS BLOGOWY — pole blog_post.content MUSI być poprawnym HTML:
- Minimum 3 sekcje, każda zaczynająca się od <h2>.
- Każda sekcja zawiera 2–4 akapity w <p>.
- Opcjonalnie użyj list <ul><li> tam, gdzie pasują (porady, cechy, kroki).
- ZAKAZ gołego tekstu poza tagami HTML. Każde zdanie musi być wewnątrz <p>, <li> lub <h2>.
- Długość: 800–1200 słów. Merytoryczny, angażujący, z konkretnymi poradami.
- NIE dodawaj <h1> — tytuł jest w osobnym polu.

SEO PACK:
- meta_title: max 60 znaków, zawiera główne słowo kluczowe.
- meta_description: max 155 znaków, zachęcający, z CTA.
- keywords: 5–8 trafnych słów/fraz kluczowych.

VISUAL BRIEF:
- Opis sugerowanej grafiki/zdjęcia dopasowanej do wpisu.
- Paleta 4 kolorów w formacie HEX.

OGÓLNE:
- Jeśli klient podał czego unikać — bezwzględnie tego unikaj.
- Pisz po polsku, profesjonalnie, bez lania wody."""


RETRY_SUFFIX = """

UWAGA: Poprzednia odpowiedź miała zbyt słabo sformatowany wpis blogowy.
Tym razem blog_post.content MUSI zawierać:
- minimum 3 nagłówki <h2>
- minimum 5 akapitów <p>
- minimum 500 znaków
Każde zdanie musi być wewnątrz tagu HTML (<h2>, <p>, <li>). Bez gołego tekstu."""


MIN_H2_COUNT = 2
MIN_P_COUNT = 3
MIN_CONTENT_LENGTH = 500


def _build_user_prompt(brief: dict) -> str:
    lines = [
        f"URL strony: {brief.get('url', 'brak')}",
        f"Typ biznesu: {brief.get('business_type', 'brak')}",
        f"Podsumowanie strony: {brief.get('summary', 'brak')}",
        f"Wybrany temat: {brief.get('selected_title', 'brak')}",
        f"Cel treści: {brief.get('goal', 'brak')}",
        f"Co promować: {brief.get('promote', '') or 'nie podano'}",
        f"Styl komunikacji: {brief.get('style', 'prosty')}",
        f"Czego unikać: {brief.get('avoid', '') or 'nie podano'}",
        f"Dodatkowa notatka: {brief.get('note', '') or 'brak'}",
    ]
    hashtags = brief.get("hashtags", "")
    if hashtags:
        lines.append(f"Hashtagi klienta (uwzględnij + dodaj własne dopasowane, usuń duplikaty): {hashtags}")
    brand_colors = brief.get("brand_colors", [])
    if brand_colors:
        lines.append(f"Kolory marki klienta: {', '.join(brand_colors)} — paleta visual brief powinna nawiązywać do tych kolorów")
    return "\n".join(lines)


def _blog_quality_ok(result: GenerateResponse) -> bool:
    """Sprawdza czy blog ma wystarczającą strukturę HTML i długość."""
    content = result.blog_post.content
    h2_count = content.count("<h2>")
    p_count = content.count("<p>")
    length = len(content)

    logger.info(f"[GENERATE] Blog quality: {h2_count} x <h2>, {p_count} x <p>, {length} chars")

    if h2_count < MIN_H2_COUNT:
        logger.warning(f"[GENERATE] Za mało <h2>: {h2_count} < {MIN_H2_COUNT}")
        return False
    if p_count < MIN_P_COUNT:
        logger.warning(f"[GENERATE] Za mało <p>: {p_count} < {MIN_P_COUNT}")
        return False
    if length < MIN_CONTENT_LENGTH:
        logger.warning(f"[GENERATE] Za krótki content: {length} < {MIN_CONTENT_LENGTH}")
        return False
    return True


def _call_openai(model: str, brief: dict, system_suffix: str = "") -> GenerateResponse:
    client = OpenAI(api_key=settings.openai_api_key)
    user_prompt = _build_user_prompt(brief)
    system = SYSTEM_PROMPT + system_suffix

    logger.info(f"[GENERATE] Calling OpenAI model: {model}")
    logger.info(f"[GENERATE] User prompt:\n{user_prompt}")

    response = client.beta.chat.completions.parse(
        model=model,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user_prompt},
        ],
        response_format=GenerateResponse,
        max_completion_tokens=4096,
    )

    message = response.choices[0].message

    if message.refusal:
        raise ValueError(f"Model odmówił generowania: {message.refusal}")

    if message.parsed is None:
        raise ValueError("Model zwrócił pustą odpowiedź.")

    return message.parsed


def _generate_with_model(model: str, brief: dict) -> GenerateResponse:
    """Wywołuje model z walidacją jakości bloga. Maks 1 retry."""
    result = _call_openai(model, brief)

    if _blog_quality_ok(result):
        return result

    logger.info(f"[GENERATE] Blog nie przeszedł walidacji, retry z wzmocnionym promptem")
    result = _call_openai(model, brief, system_suffix=RETRY_SUFFIX)

    if not _blog_quality_ok(result):
        logger.warning(f"[GENERATE] Blog po retry nadal słaby — akceptuję mimo to")

    return result


async def generate_content(brief_data: dict) -> dict:
    """Wywołuje OpenAI Structured Outputs. Fallback: primary model → gpt-4o-mini."""
    primary = settings.openai_model
    fallback = "gpt-4o-mini"

    # Próba 1: primary model
    try:
        result = _generate_with_model(primary, brief_data)
        logger.info(f"[GENERATE] Sukces z modelem {primary}")
        return result.model_dump()
    except NotFoundError:
        logger.warning(f"[GENERATE] Model {primary} niedostępny, fallback do {fallback}")
    except Exception as e:
        logger.warning(f"[GENERATE] Błąd z {primary}: {e}, fallback do {fallback}")

    # Próba 2: fallback model
    try:
        result = _generate_with_model(fallback, brief_data)
        logger.info(f"[GENERATE] Sukces z modelem fallback {fallback}")
        return result.model_dump()
    except Exception as e:
        logger.error(f"[GENERATE] Fallback {fallback} też nie zadziałał: {e}")
        raise RuntimeError(f"Nie udało się wygenerować treści: {e}")


# --- Plan (content calendar) ---

PLAN_SYSTEM_BASE = """Jesteś strategiem content marketingu.
Na podstawie danych o firmie klienta tworzysz harmonogram treści w języku polskim.

Zasady:
- Zaplanuj treści na podaną liczbę tygodni.
- Każdy tydzień powinien mieć podaną liczbę wpisów.
- Każdy wpis ma mieć unikalny, konkretny temat powiązany z branżą klienta.
- Tematy muszą się różnić — nie powtarzaj wariantów tego samego tematu.
- description: 1–2 zdania opisujące o czym będzie treść i jaki jest jej cel.
- slot: dzień tygodnia kiedy opublikować (np. "Poniedziałek", "Środa", "Piątek").
- content_type: "wpis blogowy" lub "post social".
- summary: 2–3 zdania podsumowujące strategię i logikę harmonogramu.
- Pisz po polsku, profesjonalnie."""


def _build_plan_system_prompt(scope: str, platforms: list) -> str:
    """Buduje system prompt z dynamicznymi zasadami kanałów."""
    channel_rules = ""
    if scope == "blog":
        channel_rules = """
- Generuj WYŁĄCZNIE wpisy blogowe. Pole platform = "blog", content_type = "wpis blogowy".
- NIE generuj żadnych postów social media."""
    elif scope == "social":
        plat_str = ", ".join(platforms) if platforms else "LinkedIn, Facebook, Instagram"
        channel_rules = f"""
- Generuj WYŁĄCZNIE posty social media na platformy: {plat_str}.
- NIE generuj żadnych wpisów blogowych.
- Pole platform musi być jedną z: {plat_str}. content_type = "post social".
- Równomiernie rozkładaj posty między platformami."""
    else:  # both
        plat_str = ", ".join(platforms) if platforms else "LinkedIn, Facebook, Instagram"
        channel_rules = f"""
- Mieszaj blog i social media. Dozwolone platformy social: {plat_str}.
- Minimum 1 wpis blogowy na tydzień (platform = "blog", content_type = "wpis blogowy").
- Reszta to posty social na platformy: {plat_str} (content_type = "post social").
- Równomiernie rozkładaj posty social między platformami."""

    return PLAN_SYSTEM_BASE + channel_rules


def _build_plan_prompt(data: dict) -> str:
    scope = data.get("scope", "both")
    platforms = data.get("platforms", [])
    scope_label = {"blog": "tylko blog", "social": "tylko social media", "both": "blog + social media"}.get(scope, scope)

    lines = [
        f"URL strony: {data.get('url', 'brak')}",
        f"Typ biznesu: {data.get('business_type', 'brak')}",
        f"Podsumowanie strony: {data.get('summary', 'brak')}",
        f"Liczba tygodni: {data.get('weeks', 2)}",
        f"Treści na tydzień: {data.get('posts_per_week', 3)}",
        f"Zakres: {scope_label}",
    ]
    if scope in ("social", "both") and platforms:
        lines.append(f"Platformy social: {', '.join(platforms)}")
    lines.append(f"Cel treści: {data.get('goal', 'sprzedaż')}")
    lines.append(f"Styl komunikacji: {data.get('style', 'prosty')}")

    promote = data.get("promote", "")
    if promote:
        lines.append(f"Co promować: {promote}")
    avoid = data.get("avoid", "")
    if avoid:
        lines.append(f"Czego unikać: {avoid}")
    note = data.get("note", "")
    if note:
        lines.append(f"Dodatkowa notatka: {note}")

    brand_colors = data.get("brand_colors", [])
    if brand_colors:
        lines.append(f"Kolory marki: {', '.join(brand_colors)}")
    return "\n".join(lines)


def _call_openai_plan(model: str, data: dict) -> PlanResponse:
    client = OpenAI(api_key=settings.openai_api_key)
    user_prompt = _build_plan_prompt(data)
    scope = data.get("scope", "both")
    platforms = data.get("platforms", [])
    system_prompt = _build_plan_system_prompt(scope, platforms)

    logger.info(f"[PLAN] Calling OpenAI model: {model}, scope={scope}, platforms={platforms}")
    logger.info(f"[PLAN] User prompt:\n{user_prompt}")

    response = client.beta.chat.completions.parse(
        model=model,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        response_format=PlanResponse,
        max_completion_tokens=4096,
    )

    message = response.choices[0].message

    if message.refusal:
        raise ValueError(f"Model odmówił generowania planu: {message.refusal}")
    if message.parsed is None:
        raise ValueError("Model zwrócił pustą odpowiedź.")

    return message.parsed


async def generate_plan(plan_data: dict) -> dict:
    """Generuje harmonogram treści. Fallback: primary → gpt-4o-mini."""
    primary = settings.openai_model
    fallback = "gpt-4o-mini"

    try:
        result = _call_openai_plan(primary, plan_data)
        logger.info(f"[PLAN] Sukces z modelem {primary}, {len(result.entries)} wpisów")
        return result.model_dump()
    except NotFoundError:
        logger.warning(f"[PLAN] Model {primary} niedostępny, fallback do {fallback}")
    except Exception as e:
        logger.warning(f"[PLAN] Błąd z {primary}: {e}, fallback do {fallback}")

    try:
        result = _call_openai_plan(fallback, plan_data)
        logger.info(f"[PLAN] Sukces z modelem fallback {fallback}, {len(result.entries)} wpisów")
        return result.model_dump()
    except Exception as e:
        logger.error(f"[PLAN] Fallback {fallback} też nie zadziałał: {e}")
        raise RuntimeError(f"Nie udało się wygenerować planu: {e}")


# --- Single social post from planner entry ---

SINGLE_POST_SYSTEM_PROMPT = """Jesteś doświadczonym copywriterem social media.
Tworzysz jeden konkretny post na podaną platformę w języku polskim.

Zasady per platforma:
- LinkedIn: profesjonalny, merytoryczny. Bez emoji. CTA subtelne. HASHTAGI: 1–3 branżowe na końcu posta, oddzielone pustą linią.
- Facebook: konwersacyjny, angażujący. Pytanie do odbiorców. Emoji oszczędnie. CTA naturalne. HASHTAGI: 0–3, opcjonalne, na końcu.
- Instagram: zwięzły, visual-first. CTA do bio/linku. HASHTAGI: 5–10 na końcu, oddzielone pustą linią. Mix popularnych i niszowych.

Ogólne:
- Hashtagi dopasowane do branży, tematu i celu treści.
- Jeśli klient podał własne hashtagi — uwzględnij je, dodaj swoje, usuń duplikaty.
- Jeśli klient podał czego unikać — bezwzględnie tego unikaj.
- Pisz po polsku, profesjonalnie, bez lania wody.
- Zwróć TYLKO content posta (z hashtagami), nic więcej."""


def _build_single_post_prompt(data: dict) -> str:
    lines = [
        f"Platforma: {data['platform']}",
        f"Temat posta: {data['title']}",
        f"Kontekst / opis: {data['description']}",
        f"Typ biznesu: {data.get('business_type', 'brak')}",
        f"Podsumowanie strony: {data.get('summary', 'brak')}",
        f"Cel treści: {data.get('goal', 'sprzedaż')}",
        f"Styl komunikacji: {data.get('style', 'prosty')}",
    ]
    promote = data.get("promote", "")
    if promote:
        lines.append(f"Co promować: {promote}")
    avoid = data.get("avoid", "")
    if avoid:
        lines.append(f"Czego unikać: {avoid}")
    hashtags = data.get("hashtags", "")
    if hashtags:
        lines.append(f"Hashtagi klienta (uwzględnij + dodaj własne, usuń duplikaty): {hashtags}")
    brand_colors = data.get("brand_colors", [])
    if brand_colors:
        lines.append(f"Kolory marki: {', '.join(brand_colors)}")
    product = data.get("product_context")
    if product and product.get("title"):
        lines.append(f"\n--- Kontekst produktu/usługi (na bazie URL: {product.get('url', '')}) ---")
        lines.append(f"Nazwa: {product['title']}")
        if product.get("description"):
            lines.append(f"Opis: {product['description']}")
        if product.get("price"):
            lines.append(f"Cena: {product['price']}")
        if product.get("features"):
            lines.append(f"Cechy: {'; '.join(product['features'][:6])}")
        if product.get("brand"):
            lines.append(f"Marka: {product['brand']}")
        if product.get("availability"):
            lines.append(f"Dostępność: {product['availability']}")
        lines.append("WAŻNE: Post powinien być o tym konkretnym produkcie/usłudze, nie ogólnikowy.")
    return "\n".join(lines)


def _call_openai_single_post(model: str, data: dict) -> SinglePostResponse:
    client = OpenAI(api_key=settings.openai_api_key)
    user_prompt = _build_single_post_prompt(data)

    logger.info(f"[SINGLE_POST] Calling OpenAI model: {model}, platform={data['platform']}")
    logger.info(f"[SINGLE_POST] User prompt:\n{user_prompt}")

    response = client.beta.chat.completions.parse(
        model=model,
        messages=[
            {"role": "system", "content": SINGLE_POST_SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
        response_format=SinglePostResponse,
        max_completion_tokens=2048,
    )

    message = response.choices[0].message

    if message.refusal:
        raise ValueError(f"Model odmówił generowania posta: {message.refusal}")
    if message.parsed is None:
        raise ValueError("Model zwrócił pustą odpowiedź.")

    return message.parsed


async def generate_single_post(data: dict) -> dict:
    """Generuje pojedynczy social post. Fallback: primary → gpt-4o-mini."""
    primary = settings.openai_model
    fallback = "gpt-4o-mini"

    try:
        result = _call_openai_single_post(primary, data)
        logger.info(f"[SINGLE_POST] Sukces z modelem {primary}")
        return result.model_dump()
    except NotFoundError:
        logger.warning(f"[SINGLE_POST] Model {primary} niedostępny, fallback do {fallback}")
    except Exception as e:
        logger.warning(f"[SINGLE_POST] Błąd z {primary}: {e}, fallback do {fallback}")

    try:
        result = _call_openai_single_post(fallback, data)
        logger.info(f"[SINGLE_POST] Sukces z modelem fallback {fallback}")
        return result.model_dump()
    except Exception as e:
        logger.error(f"[SINGLE_POST] Fallback {fallback} też nie zadziałał: {e}")
        raise RuntimeError(f"Nie udało się wygenerować posta: {e}")
