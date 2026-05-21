"""
AI Graphics Preparation Layer — prompt assembly logic.

Consumes graphics_config.py data and user inputs to produce
structured, debuggable prompts for image generation and editing.

No image API calls happen here — only prompt string assembly.
"""

import colorsys
import re
import unicodedata
from typing import List, Optional

from app.services.graphics_config import (
    EDIT_RULES,
    GENERATION_RULES,
    GRAPHIC_ROUTES,
    INDUSTRY_DEFAULT_ARCHETYPE,
    MODE_COMPOSITION,
    PLATFORM_ASPECT,
    STYLE_ARCHETYPES,
    STYLE_LABEL_OVERRIDE,
    SUBJECT_FOCUS_PRESETS,
    TEXT_DENSITY_RULES,
    _HUE_NAMES,
    _LIGHTNESS_QUALIFIERS,
    _SATURATION_QUALIFIERS,
)
from app.services.visual_brief import build_visual_brief

# ---------------------------------------------------------------------------
# Render style directives — appended to style_and_lighting for "Nowa grafika"
# ---------------------------------------------------------------------------

RENDER_STYLE_DIRECTIVES = {
    "realistic": (
        "RENDER: commercial photography, photo-real output. "
        "Believable proportions, real materials, no painterly or illustrated look."
    ),
    "stylized_ad": (
        "RENDER: bold advertising art direction. "
        "Cinematic composition, strong visual hook, premium staged scene. "
        "More dramatic than plain photography — still photographic, not illustrated."
    ),
    "illustrated": (
        "RENDER: modern editorial illustration style. "
        "Strong shape language, clean graphic read, bold simplified forms. "
        "NOT clipart, NOT children's cartoon. Think award-winning infographic or editorial magazine cover. "
        "Flat planes of color with subtle texture, clear narrative hierarchy."
    ),
}


# ---------------------------------------------------------------------------
# Hex -> semantic color description
# ---------------------------------------------------------------------------

_HEX_RE = re.compile(r"^#?([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$")


def _normalize_mode(mode: str) -> str:
    """Normalize graphic mode name by stripping Polish diacritics.

    Frontend sends 'Zdjęcie z tekstem' (with ę), backend config uses 'Zdjecie z tekstem'.
    """
    nfkd = unicodedata.normalize("NFKD", mode)
    return "".join(c for c in nfkd if not unicodedata.combining(c))


def hex_to_color_description(hex_value: str) -> str:
    """Convert a hex color like '#1a3b6c' to 'dark vivid blue'.

    Returns a human-readable color description that image models
    understand better than raw hex codes.
    """
    m = _HEX_RE.match(hex_value.strip())
    if not m:
        return "neutral color"

    raw = m.group(1)
    if len(raw) == 3:
        raw = raw[0] * 2 + raw[1] * 2 + raw[2] * 2

    r, g, b = int(raw[0:2], 16) / 255, int(raw[2:4], 16) / 255, int(raw[4:6], 16) / 255
    h, l, s = colorsys.rgb_to_hls(r, g, b)
    hue_deg = h * 360

    # Near-achromatic (s < 0.12 catches dark greys with faint tint)
    if s < 0.12:
        if l > 0.90:
            return "white"
        if l < 0.10:
            return "black"
        for label, (lo, hi) in _LIGHTNESS_QUALIFIERS.items():
            if lo <= l < hi:
                return f"{label.replace('_', ' ')} grey"
        return "grey"

    # Find hue name
    hue_name = "red"
    for lo, hi, name in _HUE_NAMES:
        if lo <= hue_deg < hi:
            hue_name = name
            break

    # Lightness qualifier
    light_q = "medium"
    for label, (lo, hi) in _LIGHTNESS_QUALIFIERS.items():
        if lo <= l < hi:
            light_q = label.replace("_", " ")
            break

    # Saturation qualifier
    sat_q = "moderate"
    for label, (lo, hi) in _SATURATION_QUALIFIERS.items():
        if lo <= s < hi:
            sat_q = label.replace("-", " ")
            break

    # Simplify: skip "medium moderate" — just say the color
    parts = []
    if light_q not in ("medium",):
        parts.append(light_q)
    if sat_q not in ("moderate",):
        parts.append(sat_q)
    parts.append(hue_name)

    return " ".join(parts)


def _describe_palette(hex_colors: List[str]) -> str:
    """Convert a list of hex colors to a palette description string."""
    if not hex_colors:
        return ""
    descriptions = [hex_to_color_description(c) for c in hex_colors[:4]]
    # Deduplicate while preserving order
    seen = set()
    unique = []
    for d in descriptions:
        if d not in seen:
            seen.add(d)
            unique.append(d)
    if not unique:
        return ""
    return "color palette: " + ", ".join(unique)


# ---------------------------------------------------------------------------
# Archetype resolution
# ---------------------------------------------------------------------------


def _resolve_archetype(
    industry: str,
    style_label: Optional[str] = None,
    client_feeling: Optional[str] = None,
) -> str:
    """Determine the style archetype from available inputs.

    Priority: client_feeling answer > style_label override > industry default.
    Falls back to 'clean_editorial' if nothing matches.
    """
    # Client profile question has highest priority (future Autopilot)
    if client_feeling:
        from app.services.graphics_config import CLIENT_QUESTIONS
        opts = CLIENT_QUESTIONS.get("feeling", {}).get("options", {})
        if client_feeling in opts:
            return opts[client_feeling]["archetype"]

    # Style label from UI ("prosty"/"ekspercki"/"nowoczesny")
    if style_label and style_label in STYLE_LABEL_OVERRIDE:
        return STYLE_LABEL_OVERRIDE[style_label]

    # Industry default
    industry_key = industry.lower().replace(" ", "_").replace("/", "_")
    return INDUSTRY_DEFAULT_ARCHETYPE.get(industry_key, "clean_editorial")


# ---------------------------------------------------------------------------
# Route resolution
# ---------------------------------------------------------------------------


def resolve_graphic_route(
    graphic_mode: str,
    has_source_image: bool = False,
    has_product_context: bool = False,
) -> str:
    """Decide which generation route to use based on mode and available inputs.

    Returns a key from GRAPHIC_ROUTES.
    """
    mode = _normalize_mode(graphic_mode)

    if mode == "Czyste zdjecie":
        return "clean_photo"

    if mode == "Zdjecie z tekstem":
        if has_source_image:
            return "edit_with_text_zone"
        # No source image — fall back to generation with safe zone
        return "generation_from_scratch"

    if mode == "Na podstawie zdjecia":
        if has_source_image:
            return "generation_inspired"
        return "generation_from_scratch"

    # "Nowa grafika" or default
    if has_source_image:
        return "generation_inspired"
    if has_product_context:
        return "generation_with_product"
    return "generation_from_scratch"


# ---------------------------------------------------------------------------
# Prompt segment builders
# ---------------------------------------------------------------------------


def _seg_use_case(platform: str, graphic_mode: str) -> str:
    """Segment: intended use of the image."""
    mode_cfg = MODE_COMPOSITION.get(graphic_mode, {})
    ratio = mode_cfg.get("aspect_ratio", PLATFORM_ASPECT.get(platform, "4:5"))
    resolution = mode_cfg.get("resolution_hint", "1080x1350")
    return f"Social media graphic for {platform} feed, {ratio} aspect ratio ({resolution}px)"


def _seg_scene_background(archetype_data: dict, product: Optional[dict] = None) -> str:
    """Segment: scene/background description."""
    bg = archetype_data.get("background", "neutral background")
    if product and product.get("title"):
        return f"Scene featuring {product['title']}. Background: {bg}"
    return f"Background: {bg}"


def _seg_subject(
    post_title: str,
    post_description: str,
    subject_focus: str,
    product: Optional[dict] = None,
    route_key: str = "",
) -> str:
    """Segment: main subject, adapted to the generation route."""
    preset = SUBJECT_FOCUS_PRESETS.get(subject_focus, SUBJECT_FOCUS_PRESETS["product"])
    route_data = GRAPHIC_ROUTES.get(route_key, {})
    route_instruction = route_data.get("subject_instruction", "")

    parts = [f"Subject: {post_title}."]

    # Route-specific instruction overrides generic composition
    if route_instruction:
        parts.append(route_instruction)
    else:
        parts.append(f"Composition: {preset['composition']}.")
        parts.append(f"Framing: {preset['framing']}.")

    if product and product.get("description"):
        desc = product["description"][:120]
        parts.append(f"Product context: {desc}.")
    if product and product.get("title") and route_key in ("generation_with_product", "generation_inspired"):
        parts.append(f"Product: {product['title']}.")
    if post_description and len(post_description.strip()) > 10:
        parts.append(f"Post theme: {post_description[:100]}.")

    return " ".join(parts)


def _seg_style_lighting(archetype_data: dict) -> str:
    """Segment: style and lighting."""
    style = archetype_data.get("base_style", "")
    lighting = archetype_data.get("lighting", "")
    mood = archetype_data.get("mood", "")
    return f"Style: {style}. Lighting: {lighting}. Mood: {mood}"


def _seg_palette(
    brand_colors: List[str],
    entry_colors: Optional[dict] = None,
    color_strength: str = "reference",
) -> str:
    """Segment: color palette from brand colors and per-entry overrides.

    color_strength controls how strictly colors should be followed:
      - "strict": exact brand colors must dominate
      - "reference": use as reference, allow creative freedom
      - "free": only loosely inspired, mostly creative freedom
    """
    # Per-entry overrides take priority
    effective_colors = list(brand_colors) if brand_colors else []
    if entry_colors:
        override_vals = [v for v in entry_colors.values() if v]
        if override_vals:
            effective_colors = override_vals + [
                c for c in effective_colors if c not in override_vals
            ]
    palette_desc = _describe_palette(effective_colors[:4])
    if not palette_desc:
        return ""

    if color_strength == "strict":
        return f"IMPORTANT — {palette_desc}. These exact brand colors must be the dominant colors in the image."
    elif color_strength == "free":
        return f"Loosely inspired by {palette_desc}. Creative freedom with color is encouraged."
    else:
        return f"Use {palette_desc} as the primary color reference for the image's mood and tone."


def _seg_composition_safe_zone(
    graphic_mode: str,
    text_density: str,
    route_key: str = "",
) -> str:
    """Segment: composition rules and safe zone instructions.

    Clean photo / no-text routes get no safe zone.
    Other routes get safe zone based on text_density.
    """
    # Clean photo route — no safe zone, fill entire frame
    if route_key == "clean_photo":
        return "Fill the entire frame with the composition. No empty areas for text."

    # No text density — no safe zone needed
    if text_density == "none":
        return "No text will be overlaid. Use the full frame for visual composition."

    parts = []
    mode_cfg = MODE_COMPOSITION.get(graphic_mode, {})

    # Text overlay will be added separately — model should create a calm zone
    density_cfg = TEXT_DENSITY_RULES.get(text_density, TEXT_DENSITY_RULES["short"])
    density_instruction = density_cfg.get("instruction", "")
    if density_instruction:
        parts.append(density_instruction)
        parts.append(
            "Important: do NOT render any text, letters, or words in the image. "
            "Only create a visually calm area where text will be overlaid later by a separate system."
        )

    return " ".join(parts) if parts else ""


def _seg_exclusions(archetype_data: dict, extra_avoid: str = "") -> str:
    """Segment: things to avoid."""
    items = list(GENERATION_RULES["always_exclude"])
    archetype_avoid = archetype_data.get("avoid", "")
    if archetype_avoid:
        items.append(archetype_avoid)
    if extra_avoid:
        items.append(extra_avoid)
    return "Exclusions: " + "; ".join(items)


def _seg_visual_direction(visual_direction: str) -> str:
    """Segment: freeform style hint from user."""
    if not visual_direction or not visual_direction.strip():
        return ""
    return f"Additional style note: {visual_direction.strip()}"


# ---------------------------------------------------------------------------
# Art-direction segments from visual brief (for "Nowa grafika")
# ---------------------------------------------------------------------------


def _build_art_direction_segments(
    brief: dict,
    archetype_data: dict,
) -> dict:
    """Build COMPACT prompt segments from a visual brief.

    Each segment = one focused directive. No redundancy between segments.
    Target: total prompt under 250 words.
    """
    return {
        "subject": f"HERO: {brief['hero']}.",
        "scene_background": f"SCENE: {brief['scene']}.",
        "style_and_lighting": (
            f"STYLE: {brief['style_push']}. "
            f"LIGHT: {brief['light']}. "
            f"CAMERA: {brief['camera']}."
        ),
        "quality_rules": brief["anti_flat"],
    }


# ---------------------------------------------------------------------------
# Generation prompt assembly
# ---------------------------------------------------------------------------


def build_generation_prompt(
    *,
    industry: str,
    platform: str,
    graphic_mode: str,
    post_title: str,
    post_description: str = "",
    post_content: str = "",
    style_label: Optional[str] = None,
    visual_direction: str = "",
    brand_colors: Optional[List[str]] = None,
    entry_colors: Optional[dict] = None,
    product: Optional[dict] = None,
    text_density: str = "short",
    subject_focus: str = "product",
    client_feeling: Optional[str] = None,
    avoid: str = "",
    has_source_image: bool = False,
    color_strength: str = "reference",
    content_adherence: str = "close",
    visual_creativity: str = "balanced",
    render_style: str = "realistic",
) -> dict:
    """Assemble a generation prompt from config + inputs.

    For "Nowa grafika", uses the visual brief layer for richer art-direction
    style prompts. Other modes use the original segment-based approach.

    Returns a dict with:
      - prompt: final assembled prompt string
      - route: resolved graphic route key
      - style_archetype: resolved archetype key
      - aspect_ratio: target aspect ratio
      - resolution_hint: e.g. "1080x1350"
      - safe_zone_side: where overlay text goes (or None)
      - segments: dict of individual prompt segments (for debugging)
      - exclusions: list of things to avoid
      - word_count: total words in the prompt
      - visual_brief_source: "post_content" | "title_fallback" | None
    """
    graphic_mode = _normalize_mode(graphic_mode)
    archetype_key = _resolve_archetype(industry, style_label, client_feeling)
    archetype_data = STYLE_ARCHETYPES.get(archetype_key, STYLE_ARCHETYPES["clean_editorial"])
    mode_cfg = MODE_COMPOSITION.get(graphic_mode, MODE_COMPOSITION.get("Nowa grafika", {}))

    # Resolve route
    route_key = resolve_graphic_route(
        graphic_mode=graphic_mode,
        has_source_image=has_source_image,
        has_product_context=bool(product and product.get("title")),
    )

    # For clean_photo, override text_density — no text overlay
    effective_text_density = "none" if route_key == "clean_photo" else text_density

    # --- "Nowa grafika" uses visual brief for richer prompts ---
    use_visual_brief = (
        graphic_mode == "Nowa grafika"
        and route_key in ("generation_from_scratch", "generation_with_product")
    )

    visual_brief_source = None

    if use_visual_brief:
        brief = build_visual_brief(
            post_title=post_title,
            post_description=post_description,
            post_content=post_content,
            industry=industry,
            product=product,
            content_adherence=content_adherence,
            visual_creativity=visual_creativity,
        )
        visual_brief_source = brief["source"]

        # Art-direction segments replace generic ones
        art_segments = _build_art_direction_segments(brief, archetype_data)

        # Append render style directive to style segment
        render_directive = RENDER_STYLE_DIRECTIVES.get(render_style, RENDER_STYLE_DIRECTIVES["realistic"])
        art_style_with_render = art_segments["style_and_lighting"] + " " + render_directive

        segments = {
            "use_case": _seg_use_case(platform, graphic_mode),
            "scene_background": art_segments["scene_background"],
            "subject": art_segments["subject"],
            "style_and_lighting": art_style_with_render,
            "color_palette": _seg_palette(brand_colors or [], entry_colors, color_strength),
            "composition_and_safe_zone": _seg_composition_safe_zone(
                graphic_mode, effective_text_density, route_key,
            ),
            "quality_rules": art_segments["quality_rules"],
            "exclusions": _seg_exclusions(archetype_data, avoid),
        }
    else:
        # --- Original segment-based approach for other modes ---
        segments = {
            "use_case": _seg_use_case(platform, graphic_mode),
            "scene_background": _seg_scene_background(archetype_data, product),
            "subject": _seg_subject(post_title, post_description, subject_focus, product, route_key),
            "style_and_lighting": _seg_style_lighting(archetype_data),
            "color_palette": _seg_palette(brand_colors or [], entry_colors, color_strength),
            "composition_and_safe_zone": _seg_composition_safe_zone(
                graphic_mode, effective_text_density, route_key,
            ),
            "exclusions": _seg_exclusions(archetype_data, avoid),
        }

    # Optional visual direction from user
    vd = _seg_visual_direction(visual_direction)
    if vd:
        segments["visual_direction"] = vd

    # Assemble in order — extended for visual brief path
    ordered_keys = list(GENERATION_RULES["prompt_order"])
    if use_visual_brief:
        # Insert quality_rules before exclusions
        excl_idx = ordered_keys.index("exclusions") if "exclusions" in ordered_keys else len(ordered_keys)
        ordered_keys.insert(excl_idx, "quality_rules")
    if "visual_direction" in segments:
        ordered_keys.append("visual_direction")

    prompt_parts = []
    for key in ordered_keys:
        seg = segments.get(key, "")
        if seg:
            prompt_parts.append(seg)

    prompt = "\n\n".join(prompt_parts)
    word_count = len(prompt.split())

    # Determine safe zone side — None for clean_photo and no-text
    safe_zone_side = None
    if effective_text_density != "none":
        safe_zone_side = mode_cfg.get("negative_space_side")

    return {
        "prompt": prompt,
        "route": route_key,
        "style_archetype": archetype_key,
        "aspect_ratio": mode_cfg.get("aspect_ratio", "4:5"),
        "resolution_hint": mode_cfg.get("resolution_hint", "1080x1350"),
        "safe_zone_side": safe_zone_side,
        "segments": segments,
        "exclusions": GENERATION_RULES["always_exclude"] + [archetype_data.get("avoid", "")],
        "word_count": word_count,
        "visual_brief_source": visual_brief_source,
    }


# ---------------------------------------------------------------------------
# Edit prompt assembly
# ---------------------------------------------------------------------------


def build_edit_prompt(
    *,
    industry: str,
    graphic_mode: str,
    post_title: str,
    post_description: str = "",
    style_label: Optional[str] = None,
    brand_colors: Optional[List[str]] = None,
    entry_colors: Optional[dict] = None,
    change_description: str = "",
    preserve_elements: Optional[List[str]] = None,
    product: Optional[dict] = None,
    client_feeling: Optional[str] = None,
    avoid: str = "",
) -> dict:
    """Assemble an edit/inpainting prompt.

    Key principle: describe the FINAL state of the image,
    not the editing action. Explicitly list what to preserve.

    Returns a dict with:
      - prompt: final assembled edit prompt string
      - preserve_list: explicit list of things to keep unchanged
      - style_archetype: resolved archetype key
      - segments: dict of individual prompt segments (for debugging)
      - word_count: total words in the prompt
    """
    graphic_mode = _normalize_mode(graphic_mode)
    archetype_key = _resolve_archetype(industry, style_label, client_feeling)
    archetype_data = STYLE_ARCHETYPES.get(archetype_key, STYLE_ARCHETYPES["clean_editorial"])
    mode_cfg = MODE_COMPOSITION.get(graphic_mode, {})

    # Build preserve list
    preserve_list = list(EDIT_RULES["always_preserve"])
    if preserve_elements:
        preserve_list.extend(preserve_elements)
    mode_preserve = mode_cfg.get("preserve_keys", [])
    for p in mode_preserve:
        if p not in preserve_list:
            preserve_list.append(p)

    # Build segments — describe final state, not the action
    segments = {}

    # Final state description
    product_ctx = ""
    if product and product.get("title"):
        product_ctx = f" featuring {product['title']}"
    segments["final_state_description"] = (
        f"Final image: a {archetype_data['base_style']} social media graphic{product_ctx}. "
        f"Theme: {post_title}."
    )

    # Preserve list as explicit instruction
    segments["preserve_list"] = (
        "Preserve unchanged: " + ", ".join(preserve_list) + "."
    )

    # What to change
    if change_description:
        segments["change_description"] = f"Modify only: {change_description}."
    else:
        safe_zone = mode_cfg.get("safe_zone", "")
        if safe_zone:
            segments["change_description"] = (
                f"Adjust the background region to: {safe_zone}"
            )

    # Style consistency
    palette = _seg_palette(brand_colors or [], entry_colors)
    segments["style_consistency"] = (
        f"Style: {archetype_data['base_style']}. "
        f"Lighting: {archetype_data['lighting']}. "
        f"{palette}."
    ).rstrip(". ") + "."

    # Exclusions
    excl_items = list(EDIT_RULES["always_exclude"])
    archetype_avoid = archetype_data.get("avoid", "")
    if archetype_avoid:
        excl_items.append(archetype_avoid)
    if avoid:
        excl_items.append(avoid)
    segments["exclusions"] = "Do not add: " + "; ".join(excl_items)

    # Assemble in order
    prompt_parts = []
    for key in EDIT_RULES["prompt_order"]:
        seg = segments.get(key, "")
        if seg:
            prompt_parts.append(seg)

    prompt = "\n\n".join(prompt_parts)
    word_count = len(prompt.split())

    return {
        "prompt": prompt,
        "preserve_list": preserve_list,
        "style_archetype": archetype_key,
        "segments": segments,
        "word_count": word_count,
    }
