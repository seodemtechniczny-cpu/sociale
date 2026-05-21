"""
Visual Brief Builder — intermediate creative layer for "Nowa grafika".

Takes the final generated post text (or fallback to title/description)
and two user-controlled parameters to produce a structured visual brief
that the prompt builder turns into a COMPACT art-direction-style prompt.

Design goal: each brief field maps to one prompt line — no redundancy.
"""

import re
from typing import Optional


# ---------------------------------------------------------------------------
# Parameter definitions — each produces ONE compact directive
# ---------------------------------------------------------------------------

CONTENT_ADHERENCE = {
    "loose": {
        "label": "Luźno inspirowane",
        "literalness": 0.3,
        # Used directly in hero/scene — no separate instruction block needed
    },
    "close": {
        "label": "Mocno związane z treścią",
        "literalness": 0.7,
    },
    "literal": {
        "label": "Bardzo dosłowne",
        "literalness": 1.0,
    },
}

VISUAL_CREATIVITY = {
    "realistic": {
        "label": "Bardziej realistycznie",
        "style_push": "photorealistic DSLR photography",
        "light": "natural daylight or clean studio flash, no gels, no color grading",
        "camera": "50mm–85mm lens, eye-level or slight low angle",
    },
    "balanced": {
        "label": "Balans realizm + kreatywność",
        "style_push": "polished commercial photography",
        "light": "key + fill + subtle rim, warm color temperature, controlled highlights",
        "camera": "intentional shallow DoF, rule-of-thirds, slight drama in angle",
    },
    "creative": {
        "label": "Bardziej kreatywnie / reklamowo",
        "style_push": "concept-ad art direction, cinematic editorial",
        "light": "dramatic chiaroscuro or neon accents, bold color grading (teal/orange, split tone)",
        "camera": "unexpected angle (extreme low, bird's eye, Dutch tilt), bold crop",
    },
}


# ---------------------------------------------------------------------------
# Anti-flat rules — compact, mode-aware
# ---------------------------------------------------------------------------

ANTI_FLAT_RULES = (
    "QUALITY HARD RULES — "
    "NEVER: clipart, icons-only, flat symbols, infographic look, stock clichés "
    "(handshake, lightbulb, puzzle). "
    "ALWAYS: real materials and textures, 3-layer depth (foreground/mid/background), "
    "advertising-quality scene, visual storytelling through environment and light."
)


# ---------------------------------------------------------------------------
# Visual cue extraction (lightweight keyword scan)
# ---------------------------------------------------------------------------

def _extract_visual_cues(post_content: str, post_title: str) -> dict:
    text = f"{post_title} {post_content}".lower()
    words = set(text.split())

    food_kw = {"jedzenie", "kawa", "kuchnia", "posiłek", "przepis", "smak",
               "restauracja", "menu", "danie", "napój", "food", "coffee",
               "meal", "taste", "drink", "recipe"}
    tech_kw = {"technologia", "software", "aplikacja", "ai", "digital",
               "online", "komputer", "system", "automatyzacja", "narzędzie",
               "app", "tech", "tool", "platform"}
    product_kw = {"produkt", "oferta", "zakup", "cena", "zamów",
                  "product", "offer", "buy", "price", "order", "sklep", "shop"}

    return {
        "has_food": bool(words & food_kw),
        "has_tech": bool(words & tech_kw),
        "has_product_mention": bool(words & product_kw),
    }


# ---------------------------------------------------------------------------
# Visual brief builder — each field = one prompt line
# ---------------------------------------------------------------------------

def build_visual_brief(
    *,
    post_title: str,
    post_description: str = "",
    post_content: str = "",
    industry: str = "",
    product: Optional[dict] = None,
    content_adherence: str = "close",
    visual_creativity: str = "balanced",
) -> dict:
    """Build a compact visual brief for 'Nowa grafika'.

    Returns dict with:
      - hero: one-line hero subject directive
      - scene: one-line scene/environment
      - light: one-line lighting directive
      - camera: one-line camera/composition
      - style_push: style modifier
      - anti_flat: quality rules
      - source: "post_content" | "title_fallback"
    """
    adherence_cfg = CONTENT_ADHERENCE.get(content_adherence, CONTENT_ADHERENCE["close"])
    creativity_cfg = VISUAL_CREATIVITY.get(visual_creativity, VISUAL_CREATIVITY["balanced"])
    literalness = adherence_cfg["literalness"]

    has_post = bool(post_content and len(post_content.strip()) > 30)
    source_text = post_content.strip() if has_post else f"{post_title}. {post_description}".strip()
    source = "post_content" if has_post else "title_fallback"
    cues = _extract_visual_cues(source_text, post_title)

    # --- HERO (one line, varies structurally by adherence) ---
    if literalness <= 0.3:
        if product and product.get("title"):
            hero = f"Atmospheric mood evoking the world of {product['title']} — do NOT show product directly"
        else:
            hero = f"Visual metaphor inspired by '{post_title}' — mood and emotion over specifics"
    elif literalness >= 1.0:
        if product and product.get("title"):
            hero = f"Show {product['title']} clearly, filling 50-70% of frame"
        elif cues["has_food"]:
            hero = f"Show the specific food/dish from '{post_title}' — concrete, no metaphor"
        else:
            hero = f"Direct depiction of '{post_title}' — exactly what the title describes"
    else:
        if product and product.get("title"):
            hero = f"{product['title']} in a premium commercial setting"
        elif cues["has_food"]:
            hero = f"Appetizing food scene: '{post_title}'"
        else:
            hero = f"Commercial visual of '{post_title}'"

    # --- SCENE (one line, uses post content when available) ---
    if has_post:
        excerpt = source_text[:150].replace("\n", " ")
        if literalness <= 0.3:
            scene = f'Evoke the emotional atmosphere of: "{excerpt}..." — mood, not illustration'
        elif literalness >= 1.0:
            scene = f'Illustrate the scenario from: "{excerpt}..." — show specific objects and setting'
        else:
            scene = f'Commercial scene communicating: "{excerpt}..."'
    else:
        scene = f"Scene around: {post_title}. Context: {(post_description or industry)[:100]}"

    # --- LIGHT (from creativity config) ---
    light = creativity_cfg["light"]

    # --- CAMERA (from creativity config, modified by adherence) ---
    base_camera = creativity_cfg["camera"]
    if literalness >= 1.0:
        camera = f"tight framing, subject 50-70% of frame. {base_camera}"
    elif literalness <= 0.3:
        camera = f"wide environmental framing, negative space as compositional element. {base_camera}"
    else:
        camera = f"balanced framing, clear focal point 40-60% of frame. {base_camera}"

    return {
        "hero": hero,
        "scene": scene,
        "light": light,
        "camera": camera,
        "style_push": creativity_cfg["style_push"],
        "anti_flat": ANTI_FLAT_RULES,
        "source": source,
    }
