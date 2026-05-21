"""
AI Graphics Generation Layer — image generation via OpenAI.

Thin wrapper: takes a prompt string, calls the API, returns base64 PNG.
No prompt building logic here — that lives in prompt_builder.py.
"""

import base64

from openai import OpenAI

from app.core.config import settings
from app.core.logging import logger

# Aspect ratio -> closest available API size
_SIZE_MAP = {
    "4:5": "1024x1536",   # portrait, close to 1080x1350
    "1:1": "1024x1024",   # square
    "16:9": "1536x1024",  # landscape (blog headers)
}

_DEFAULT_QUALITY = "medium"

ALLOWED_IMAGE_MODELS = {
    "gpt-image-2",
    "gpt-image-1.5",
    "gpt-image-1",
    "gpt-image-1-mini",
}
_HARDCODED_FALLBACK = "gpt-image-2"


def resolve_image_model(requested: str = "") -> str:
    """Pick an allowed image model. Untrusted input -> server default -> hardcoded fallback."""
    if requested and requested in ALLOWED_IMAGE_MODELS:
        return requested
    if settings.image_model in ALLOWED_IMAGE_MODELS:
        return settings.image_model
    return _HARDCODED_FALLBACK


def generate_image(
    prompt: str,
    aspect_ratio: str = "4:5",
    quality: str = "",
    model: str = "",
) -> dict:
    """Generate an image from a prompt string.

    Returns dict with:
      - b64_image: base64-encoded PNG string
      - size: actual size used (e.g. "1024x1536")
      - model: model used
    """
    size = _SIZE_MAP.get(aspect_ratio, "1024x1536")
    q = quality or _DEFAULT_QUALITY
    chosen_model = resolve_image_model(model)

    logger.info(
        f"[IMAGE-GEN] Generating: model={chosen_model} size={size} quality={q} "
        f"prompt_chars={len(prompt)} prompt_words={len(prompt.split())}"
    )

    client = OpenAI(api_key=settings.openai_api_key)

    result = client.images.generate(
        model=chosen_model,
        prompt=prompt,
        size=size,
        quality=q,
        output_format="png",
        n=1,
    )

    b64_image = result.data[0].b64_json
    if not b64_image:
        raise RuntimeError("Image API returned empty b64_json")

    decoded_size = len(base64.b64decode(b64_image))
    logger.info(f"[IMAGE-GEN] Success: {decoded_size} bytes, size={size}")

    return {
        "b64_image": b64_image,
        "size": size,
        "model": chosen_model,
    }
