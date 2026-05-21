import json
import re

import requests
from bs4 import BeautifulSoup

from app.core.logging import logger

MAX_PARAGRAPHS = 8
MAX_TEXT_CHARS = 2000

# Fragmenty nawigacyjne / koszykowe — pomijamy
JUNK_PATTERNS = [
    "koszyk", "do kasy", "suma:", "zaloguj", "moje konto",
    "regulamin", "polityka prywatności", "cookie", "newsletter",
    "copyright", "wszelkie prawa", "all rights reserved",
    "menu", "nawigacja", "wyszukaj", "szukaj", "search",
]

HEX_RE = re.compile(r"#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b")

# Kolory zbyt generyczne — pomijamy
GENERIC_COLORS = {
    "#000", "#000000", "#fff", "#ffffff", "#333", "#333333",
    "#666", "#666666", "#999", "#999999", "#ccc", "#cccccc",
    "#eee", "#eeeeee", "#f5f5f5", "#fafafa", "#ddd", "#dddddd",
}
MAX_BRAND_COLORS = 4

# Browser-like headers to avoid bot-detection walls
_BROWSER_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/122.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "pl-PL,pl;q=0.9,en-US;q=0.8,en;q=0.7",
    # NOTE: do NOT include 'br' (brotli) — requests library cannot decompress it,
    # causing response.text to return raw compressed bytes instead of HTML.
    "Accept-Encoding": "gzip, deflate",
    "Cache-Control": "no-cache",
}


def _extract_brand_colors(soup: BeautifulSoup, base_url: str = "") -> list:
    """Wyciąga kolory hex z theme-color, inline styles, bloków <style> i pierwszego zewnętrznego CSS."""
    found = []

    # 1. <meta name="theme-color">
    theme = soup.find("meta", attrs={"name": "theme-color"})
    if theme and theme.get("content"):
        found.extend(HEX_RE.findall(theme["content"]))

    # 2. Inline style na kluczowych tagach
    for tag in soup.find_all(["body", "header", "nav", "a", "footer"], limit=30):
        style = tag.get("style", "")
        if style:
            found.extend(HEX_RE.findall(style))

    # 3. Bloki <style> — pierwsze 3000 znaków każdego
    for style_tag in soup.find_all("style", limit=5):
        css_text = (style_tag.string or "")[:3000]
        found.extend(HEX_RE.findall(css_text))

    # 4. Pierwszy zewnętrzny CSS — pobierz pierwsze 5000 znaków
    if not found and base_url:
        for link in soup.find_all("link", rel="stylesheet", limit=3):
            href = link.get("href", "")
            if not href:
                continue
            if href.startswith("//"):
                href = "https:" + href
            elif href.startswith("/"):
                href = base_url.rstrip("/") + href
            elif not href.startswith("http"):
                continue
            try:
                css_resp = requests.get(href, timeout=5, headers={"User-Agent": "Sociale-MVP/1.0"})
                css_text = css_resp.text[:5000]
                found.extend(HEX_RE.findall(css_text))
                if found:
                    break
            except requests.RequestException:
                continue

    # Normalizuj, deduplikuj, filtruj generyczne
    seen = set()
    colors = []
    for c in found:
        normalized = c.lower()
        # Rozwiń 3-znakowe do 6-znakowych
        if len(normalized) == 4:
            normalized = "#" + normalized[1] * 2 + normalized[2] * 2 + normalized[3] * 2
        if normalized in GENERIC_COLORS or normalized in seen:
            continue
        seen.add(normalized)
        colors.append(normalized)
        if len(colors) >= MAX_BRAND_COLORS:
            break

    return colors


async def scrape_url(url: str) -> dict:
    """Pobiera HTML i wyciąga title, meta description, nagłówki, tekst."""
    logger.info(f"[SCRAPER] Input URL: {url}")

    try:
        resp = requests.get(
            url,
            timeout=10,
            headers=_BROWSER_HEADERS,
            allow_redirects=True,
        )
        resp.raise_for_status()
    except requests.RequestException as e:
        logger.warning(f"[SCRAPER] Nie udało się pobrać strony: {e}")
        return {
            "title": "",
            "description": "",
            "h1": [],
            "h2": [],
            "text": "",
            "brand_colors": [],
            "_blocked": True,
        }

    body_len = len(resp.text)
    logger.info(f"[SCRAPER] status={resp.status_code} final_url={resp.url} body_len={body_len}")

    # Detect JS-wall — body too small to contain real content
    if body_len < 2000:
        logger.warning(
            f"[SCRAPER] BLOCKED — body too small ({body_len} bytes). "
            "Site likely uses JS-based rendering or cookie consent wall."
        )
        return {
            "title": "",
            "description": "",
            "h1": [],
            "h2": [],
            "text": "",
            "brand_colors": [],
            "_blocked": True,
        }

    soup = BeautifulSoup(resp.text, "html.parser")

    # Title
    title = ""
    if soup.title and soup.title.string:
        title = soup.title.string.strip()

    # Meta description
    description = ""
    meta_tag = soup.find("meta", attrs={"name": "description"})
    if meta_tag and meta_tag.get("content"):
        description = meta_tag["content"].strip()

    # Headings
    h1_list = [tag.get_text(strip=True) for tag in soup.find_all("h1") if tag.get_text(strip=True)]
    h2_list = [tag.get_text(strip=True) for tag in soup.find_all("h2") if tag.get_text(strip=True)]

    def _is_junk(text: str) -> bool:
        lower = text.lower()
        if any(pat in lower for pat in JUNK_PATTERNS):
            return True
        words = text.split()
        if len(words) < 4:
            return True
        # Sklejone wyrazy (np. "WyjazdyCzęści" — wielka litera w środku słowa)
        glued = sum(1 for w in words if any(c.isupper() for c in w[1:]))
        if glued > len(words) * 0.3:
            return True
        return False

    # Tekst — szukamy w <p>, ale jeśli nic nie znajdziemy, fallback na <li>, <span>, <div>
    paragraphs = []
    total_chars = 0
    for p in soup.find_all("p"):
        text = p.get_text(strip=True)
        if len(text) < 30 or _is_junk(text):
            continue
        if total_chars + len(text) > MAX_TEXT_CHARS:
            break
        paragraphs.append(text)
        total_chars += len(text)
        if len(paragraphs) >= MAX_PARAGRAPHS:
            break

    # Fallback: jeśli <p> dało mało, zbierz z <li> i krótszych bloków
    if total_chars < 200:
        for tag in soup.find_all(["li", "span", "div"]):
            text = tag.get_text(strip=True)
            if len(text) < 30 or len(text) > 500:
                continue
            if _is_junk(text):
                continue
            if text in " ".join(paragraphs):
                continue
            if total_chars + len(text) > MAX_TEXT_CHARS:
                break
            paragraphs.append(text)
            total_chars += len(text)
            if len(paragraphs) >= MAX_PARAGRAPHS:
                break

    combined_text = " ".join(paragraphs)

    # Surowy tekst strony (do detekcji ecommerce) — obcięty do 5000 znaków
    raw_text = soup.get_text(separator=" ", strip=True)[:5000]

    # Brand colors — base_url do ewentualnego pobrania zewnętrznego CSS
    base_url = url.rstrip("/").rsplit("/", 1)[0] if "/" in url else url
    brand_colors = _extract_brand_colors(soup, base_url=url)

    logger.info(f"[SCRAPER] Brand colors ({len(brand_colors)}): {brand_colors}")
    logger.info(f"[SCRAPER] Title: {title!r}")
    logger.info(f"[SCRAPER] Meta description: {description!r}")
    logger.info(f"[SCRAPER] H1 ({len(h1_list)}): {h1_list}")
    logger.info(f"[SCRAPER] H2 ({len(h2_list)}): {h2_list}")
    logger.info(f"[SCRAPER] Text length: {len(combined_text)} chars from {len(paragraphs)} paragraphs")

    return {
        "title": title,
        "description": description,
        "h1": h1_list,
        "h2": h2_list,
        "text": combined_text,
        "raw_text": raw_text,
        "brand_colors": brand_colors,
    }


# ---------------------------------------------------------------------------
# Product / service scraper
# ---------------------------------------------------------------------------

_SCHEMA_TYPE_MAP = {
    "product": "product",
    "service": "service",
    "offer": "offer",
    "IndividualProduct": "product",
    "ProductGroup": "product",
}

MAX_PRODUCT_IMAGES = 6
MAX_FEATURES = 8

# Separators that indicate store suffix / marketing suffix in og:title / <title>
_TITLE_SEPARATORS = re.compile(r"\s*[|–—]\s*|\s+-\s+(?=[A-ZŁŚĆŹŻ])")

# Polish copulas that indicate JSON-LD `name` contains a marketing description, not a product name
_JSONLD_COPULAS = re.compile(r"\s+(to|jest|czyli)\s+", re.IGNORECASE)


def _clean_product_title(raw: str) -> str:
    """Strip store name / marketing suffix from og:title or <title> fallback.

    JSON-LD `name` is passed through untouched — only call this for fallbacks.
    Strategy: split on separator patterns, take the first (longest meaningful) part.
    """
    if not raw:
        return raw
    parts = _TITLE_SEPARATORS.split(raw, maxsplit=1)
    title = parts[0].strip()
    # If stripping left us with almost nothing, fall back to full string
    return title if len(title) >= 10 else raw.strip()


def _clean_jsonld_name(name: str) -> str:
    """Clean JSON-LD `name` when it contains a marketing description instead of a product name.

    1. Copula match ( to / jest / czyli ) — cut before it (most reliable)
    2. Long name without copula (> 70 chars) — fall back to separator-based cleaning
    3. Short or clean name — pass through untouched
    """
    if not name:
        return name
    m = _JSONLD_COPULAS.search(name)
    if m:
        cleaned = name[:m.start()].strip()
        return cleaned if len(cleaned) >= 5 else name
    if len(name) > 70:
        return _clean_product_title(name)
    return name


def _parse_jsonld(soup: BeautifulSoup):
    """Extract first Product/Service/Offer JSON-LD block."""
    for script in soup.find_all("script", type="application/ld+json"):
        try:
            data = json.loads(script.string or "")
        except (json.JSONDecodeError, TypeError):
            continue
        # Handle @graph arrays
        items = data if isinstance(data, list) else data.get("@graph", [data])
        for item in items:
            t = (item.get("@type") or "").lower()
            if t in ("product", "service", "offer", "individualproduct", "productgroup"):
                return item
    return None


def _og(soup: BeautifulSoup, prop: str) -> str:
    tag = soup.find("meta", property=f"og:{prop}") or soup.find("meta", attrs={"name": f"og:{prop}"})
    return (tag.get("content") or "").strip() if tag else ""


def _extract_images(soup: BeautifulSoup, jsonld, url: str) -> list:
    """Gather product images from JSON-LD, OG, and gallery selectors."""
    images = []
    seen = set()

    def _add(src):
        if not src or src in seen:
            return
        # Normalise relative URLs
        if src.startswith("//"):
            src = "https:" + src
        elif src.startswith("/"):
            base = re.match(r"https?://[^/]+", url)
            src = (base.group() if base else "") + src
        if src.startswith("http") and src not in seen:
            seen.add(src)
            images.append(src)

    # 1. JSON-LD image(s)
    if jsonld:
        img = jsonld.get("image")
        if isinstance(img, str):
            _add(img)
        elif isinstance(img, list):
            for i in img:
                _add(i if isinstance(i, str) else (i.get("url") or i.get("contentUrl") or ""))
        elif isinstance(img, dict):
            _add(img.get("url") or img.get("contentUrl") or "")

    # 2. OG image
    _add(_og(soup, "image"))

    # 3. Common gallery selectors
    for selector in [
        "[data-gallery] img", ".product-gallery img", ".product-images img",
        ".woocommerce-product-gallery img", "[class*='gallery'] img",
        "[class*='product'] img", "[itemprop='image']",
    ]:
        for el in soup.select(selector):
            # Prefer high-res attributes over src (which may be a lazy-load placeholder)
            _add(el.get("data-zoom-image") or el.get("data-large") or el.get("data-src")
                 or el.get("data-lazy-src") or el.get("src") or "")
            if len(images) >= MAX_PRODUCT_IMAGES:
                return images[:MAX_PRODUCT_IMAGES]

    # 4. Gallery links (a[href] wrapping thumbnails often point to full image)
    for selector in [".product-gallery a", ".product-images a", "[data-gallery] a"]:
        for a_tag in soup.select(selector):
            href = a_tag.get("href", "")
            if href and any(ext in href.lower() for ext in (".jpg", ".jpeg", ".png", ".webp")):
                _add(href)
                if len(images) >= MAX_PRODUCT_IMAGES:
                    return images[:MAX_PRODUCT_IMAGES]

    return images[:MAX_PRODUCT_IMAGES]


def _extract_features(soup: BeautifulSoup, jsonld) -> list:
    """Extract product features / bullet points."""
    features = []

    # JSON-LD description may be rich — skip, we use it as description
    # Look for structured attributes
    if jsonld:
        for prop in ("additionalProperty", "hasEnergyConsumptionDetails"):
            props = jsonld.get(prop, [])
            if isinstance(props, list):
                for p in props[:MAX_FEATURES]:
                    name = p.get("name", "")
                    value = p.get("value", "")
                    if name and value:
                        features.append(f"{name}: {value}")

    # HTML: look for bullet lists near product description
    for selector in [
        ".product-features li", ".product-attributes li",
        "[class*='feature'] li", "[class*='specification'] li",
        ".short-description li", "[itemprop='description'] li",
    ]:
        for li in soup.select(selector):
            text = li.get_text(strip=True)
            if 5 < len(text) < 200 and text not in features:
                features.append(text)
                if len(features) >= MAX_FEATURES:
                    return features

    # Fallback: first <ul> after h2 containing "cechy" / "specyfikacja" / "parametry"
    if not features:
        for h in soup.find_all(["h2", "h3"]):
            heading = h.get_text(strip=True).lower()
            if any(kw in heading for kw in ("cech", "specyf", "parametr", "właściw", "feature")):
                ul = h.find_next("ul")
                if ul:
                    for li in ul.find_all("li", limit=MAX_FEATURES):
                        text = li.get_text(strip=True)
                        if 5 < len(text) < 200:
                            features.append(text)
                break

    return features[:MAX_FEATURES]


def _detect_source_type(jsonld, soup: BeautifulSoup) -> str:
    """Detect whether URL is a product, service, offer, or unknown."""
    if jsonld:
        t = (jsonld.get("@type") or "").lower()
        for key, val in _SCHEMA_TYPE_MAP.items():
            if key.lower() in t:
                return val

    # Heuristic: price selectors suggest product/offer
    price_indicators = soup.select("[itemprop='price'], .price, [data-price], .product-price")
    if price_indicators:
        return "product"

    # Heuristic: service keywords in headings
    for h in soup.find_all(["h1", "h2"], limit=5):
        text = h.get_text(strip=True).lower()
        if any(kw in text for kw in ("usługa", "usługi", "service", "konsultacj", "doradztw")):
            return "service"

    return "unknown"


def _extract_price(jsonld, soup: BeautifulSoup):
    """Return (price_string, currency)."""
    # JSON-LD offers
    if jsonld:
        offers = jsonld.get("offers")
        if isinstance(offers, dict):
            offers = [offers]
        if isinstance(offers, list) and offers:
            offer = offers[0]
            price = offer.get("price") or offer.get("lowPrice")
            currency = offer.get("priceCurrency", "")
            if price:
                return f"{price} {currency}".strip(), currency or None

    # HTML itemprop
    price_el = soup.find(attrs={"itemprop": "price"})
    if price_el:
        price_text = price_el.get("content") or price_el.get_text(strip=True)
        curr_el = soup.find(attrs={"itemprop": "priceCurrency"})
        currency = curr_el.get("content", "") if curr_el else ""
        return f"{price_text} {currency}".strip() if price_text else None, currency or None

    # CSS selector fallback
    for sel in [".price", ".product-price", "[data-price]"]:
        el = soup.select_one(sel)
        if el:
            text = el.get_text(strip=True)
            if text and any(c.isdigit() for c in text):
                return text, None

    return None, None


_EMPTY_RESULT = {
    "url": "",  # filled in by caller
    "source_type": "unknown",
    "title": "",
    "description": "",
    "price": None,
    "currency": None,
    "features": [],
    "images": [],
    "brand": None,
    "category": None,
    "availability": None,
}


async def scrape_product_url(url: str) -> dict:
    """Scrape a product/service page and return structured data."""
    logger.info(f"[PRODUCT-SCRAPER] Input URL: {url}")

    try:
        resp = requests.get(
            url,
            timeout=12,
            headers=_BROWSER_HEADERS,
            allow_redirects=True,
        )
        resp.raise_for_status()
    except requests.RequestException as e:
        logger.warning(f"[PRODUCT-SCRAPER] Fetch failed: {e}")
        return {**_EMPTY_RESULT, "url": url}

    final_url = resp.url
    body_len = len(resp.text)
    logger.info(
        f"[PRODUCT-SCRAPER] status={resp.status_code} final_url={final_url} "
        f"body_len={body_len} content_type={resp.headers.get('content-type', '')!r}"
    )

    # Detect JS-wall / cookie-consent wall — site returned practically nothing
    if body_len < 2000:
        logger.warning(
            f"[PRODUCT-SCRAPER] BLOCKED — body too small ({body_len} bytes). "
            "Likely JS-wall, cookie consent, or bot detection. "
            "Cannot extract product data without headless browser."
        )
        return {**_EMPTY_RESULT, "url": url}

    soup = BeautifulSoup(resp.text, "html.parser")
    jsonld = _parse_jsonld(soup)

    # Diagnostic log: what signals are present
    has_title_tag = bool(soup.title and soup.title.string)
    has_og_title = bool(_og(soup, "title"))
    has_h1 = bool(soup.find("h1"))
    has_jsonld = jsonld is not None
    has_og_image = bool(_og(soup, "image"))
    has_images = len(soup.find_all("img")) > 0
    logger.info(
        f"[PRODUCT-SCRAPER] signals: title_tag={has_title_tag} og_title={has_og_title} "
        f"h1={has_h1} json_ld={has_jsonld} og_image={has_og_image} images={has_images}"
    )

    # Title: JSON-LD > OG > h1 > <title>
    # JSON-LD `name` is taken as-is (structured data, usually already clean).
    # All fallbacks go through _clean_product_title() to strip store suffixes.
    title = ""
    if jsonld:
        title = _clean_jsonld_name(jsonld.get("name", ""))
    if not title:
        title = _clean_jsonld_name(_og(soup, "title"))
    if not title:
        h1 = soup.find("h1")
        title = _clean_product_title(h1.get_text(strip=True)) if h1 else ""
    if not title and soup.title:
        title = _clean_product_title(soup.title.get_text(strip=True))

    # Description: JSON-LD > OG > meta description
    description = ""
    if jsonld:
        description = (jsonld.get("description") or "")[:500]
    if not description:
        description = _og(soup, "description")
    if not description:
        meta = soup.find("meta", attrs={"name": "description"})
        description = (meta.get("content") or "").strip()[:500] if meta else ""

    # Brand
    brand = None
    if jsonld:
        b = jsonld.get("brand")
        if isinstance(b, dict):
            brand = b.get("name")
        elif isinstance(b, str):
            brand = b

    # Category
    category = None
    if jsonld:
        cat = jsonld.get("category")
        if isinstance(cat, str):
            category = cat

    # Availability
    availability = None
    if jsonld:
        offers = jsonld.get("offers")
        if isinstance(offers, dict):
            offers = [offers]
        if isinstance(offers, list) and offers:
            avail = offers[0].get("availability", "")
            if "InStock" in avail:
                availability = "dostępny"
            elif "OutOfStock" in avail:
                availability = "niedostępny"
            elif "PreOrder" in avail:
                availability = "w przedsprzedaży"
            elif avail:
                availability = avail.rsplit("/", 1)[-1]

    price, currency = _extract_price(jsonld, soup)
    source_type = _detect_source_type(jsonld, soup)
    images = _extract_images(soup, jsonld, url)
    features = _extract_features(soup, jsonld)

    logger.info(
        f"[PRODUCT-SCRAPER] result: source_type={source_type} title={title!r} "
        f"desc_len={len(description)} price={price} images={len(images)} features={len(features)}"
    )
    if not title and not description:
        logger.warning("[PRODUCT-SCRAPER] Empty result — no title or description extracted despite sufficient body size")

    return {
        "url": url,
        "source_type": source_type,
        "title": title,
        "description": description,
        "price": price,
        "currency": currency,
        "features": features,
        "images": images,
        "brand": brand,
        "category": category,
        "availability": availability,
    }
