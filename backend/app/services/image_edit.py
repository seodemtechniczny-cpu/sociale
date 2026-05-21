"""
AI Image Edit Layer — source image editing via OpenAI images.edit.

Takes a source image (base64) + edit action, returns edited base64 PNG.
"""

import base64
import io

from openai import OpenAI

from app.core.config import settings
from app.core.logging import logger
from app.services.image_gen import resolve_image_model

# Edit action definitions: action_key -> prompt template
# Prompts describe the FINAL state of the image, not the action.
_SUBJECT_LOCK = (
    "CRITICAL — SUBJECT IDENTITY LOCK. "
    "The main subject MUST be an exact copy from the source photo. "
    "UNCHANGED LIST (do NOT modify any of these): "
    "exact silhouette and outline; body proportions and dimensions; "
    "surface details (grille, headlights, taillights, wheels, rims, mirrors, handles, badges, vents); "
    "interior visible through windows; paint color and finish; "
    "perspective, camera angle, and viewpoint; pose and orientation; "
    "material textures (metal, glass, rubber, leather, plastic). "
    "FORBIDDEN: redesigning, reinterpreting, restyling, simplifying, or reimagining the subject; "
    "changing its shape, proportions, color, or any distinguishing feature; "
    "replacing the subject with a similar but different object; "
    "adding elements that were not in the original (spoilers, decals, different wheels). "
    "ALLOWED changes: background, ambient lighting, color temperature, composition/crop. "
    "The subject must look like it was cut from the original photo and placed in a new setting."
)

EDIT_ACTIONS = {
    "fix_colors": {
        "label": "Popraw kolory / światło",
        "prompt": (
            "Final image: a well-lit, color-balanced photograph of the same subject. "
            "Neutral white balance, no color casts. Even exposure, visible detail in "
            "shadows and highlights. Natural contrast. "
            f"{_SUBJECT_LOCK} "
            "Do not add, remove, or move any objects. "
            "Do not add any text, letters, numbers, watermarks, or logos."
        ),
    },
    "clean_background": {
        "label": "Oczyść tło",
        "prompt": (
            "Final image: the same subject with a clean, simplified, calm background. "
            "The background should be soft, uncluttered, and not distracting — "
            "either a gentle gradient, soft blur, or simple neutral surface. "
            f"{_SUBJECT_LOCK} "
            "Change ONLY the background — do not alter, crop, or reposition the subject. "
            "Do not add any text, letters, numbers, watermarks, or logos."
        ),
    },
    "ad_layout": {
        "label": "Wersja reklamowa",
        "prompt_template": True,  # uses safe_zone_position parameter
    },
}


_AD_LAYOUT_PROMPTS = {
    "top": (
        "Final image: a marketing-ready version of this photograph. "
        "Recompose the image so the main subject is positioned in the lower 60-70% of the frame. "
        "The upper 30-35% must be a clean, calm, low-detail area — either a soft gradient, "
        "gentle blur, or simple tonal extension of the existing background. "
        "This calm area must have enough contrast uniformity for text to be readable over it. "
        f"{_SUBJECT_LOCK} "
        "Do not add any text, letters, numbers, watermarks, or logos."
    ),
    "bottom": (
        "Final image: a marketing-ready version of this photograph. "
        "Recompose the image so the main subject is positioned in the upper 60-70% of the frame. "
        "The lower 30-35% must be a clean, calm, low-detail area — either a soft gradient, "
        "gentle blur, or simple tonal extension of the existing background. "
        "This calm area must have enough contrast uniformity for text to be readable over it. "
        f"{_SUBJECT_LOCK} "
        "Do not add any text, letters, numbers, watermarks, or logos."
    ),
    "left": (
        "Final image: a marketing-ready version of this photograph. "
        "Recompose the image so the main subject is positioned in the right 55-65% of the frame. "
        "The left 35-40% must be a clean, calm, low-detail area — either a soft gradient, "
        "gentle blur, or simple tonal extension of the existing background. "
        "This calm area must have enough contrast uniformity for text to be readable over it. "
        f"{_SUBJECT_LOCK} "
        "Do not add any text, letters, numbers, watermarks, or logos."
    ),
}


def build_edit_action_prompt(
    action: str,
    brand_colors_desc: str = "",
    extra_context: str = "",
    safe_zone_position: str = "top",
) -> str:
    """Build the final edit prompt for a given action.

    For ad_layout, safe_zone_position controls where the text area goes.
    Returns the prompt string to send to the edit API.
    """
    action_cfg = EDIT_ACTIONS.get(action)
    if not action_cfg:
        raise ValueError(f"Unknown edit action: {action}")

    # ad_layout uses position-specific prompts
    if action == "ad_layout":
        prompt = _AD_LAYOUT_PROMPTS.get(safe_zone_position, _AD_LAYOUT_PROMPTS["top"])
        parts = [prompt]
    else:
        parts = [action_cfg["prompt"]]

    if brand_colors_desc and action in ("clean_background", "ad_layout"):
        parts.append(
            f"Use tones harmonious with the brand palette: {brand_colors_desc}."
        )

    if extra_context:
        parts.append(extra_context)

    return " ".join(parts)


def edit_image(
    image_b64: str,
    prompt: str,
    size: str = "auto",
    quality: str = "medium",
    model: str = "",
) -> dict:
    """Edit an image using OpenAI images.edit API.

    Args:
        image_b64: base64-encoded source image (PNG or JPEG)
        prompt: edit prompt describing the final state
        size: output size
        quality: generation quality
        model: image model id (validated via resolve_image_model)

    Returns dict with:
      - b64_image: base64-encoded result PNG
      - size: size used
      - model: model used
    """
    raw_b64 = image_b64
    if "," in raw_b64:
        raw_b64 = raw_b64.split(",", 1)[1]

    image_bytes = base64.b64decode(raw_b64)
    chosen_model = resolve_image_model(model)

    logger.info(
        f"[IMAGE-EDIT] Editing: model={chosen_model} size={size} quality={quality} "
        f"image_bytes={len(image_bytes)} prompt_len={len(prompt.split())} words"
    )

    client = OpenAI(api_key=settings.openai_api_key)

    image_file = io.BytesIO(image_bytes)
    image_file.name = "source.png"

    result = client.images.edit(
        model=chosen_model,
        image=image_file,
        prompt=prompt,
        size=size,
        quality=quality,
        output_format="png",
        n=1,
    )

    b64_result = result.data[0].b64_json
    if not b64_result:
        raise RuntimeError("Edit API returned empty b64_json")

    decoded_size = len(base64.b64decode(b64_result))
    logger.info(f"[IMAGE-EDIT] Success: {decoded_size} bytes, size={size}")

    return {
        "b64_image": b64_result,
        "size": size,
        "model": chosen_model,
    }
