from fastapi import APIRouter, HTTPException

from app.core.logging import logger
from app.models.schemas import (
    EditImageRequest,
    EditImageResponse,
    GenerateImageRequest,
    GenerateImageResponse,
    PreviewPromptRequest,
    PreviewPromptResponse,
)
from app.services.image_edit import EDIT_ACTIONS, build_edit_action_prompt, edit_image
from app.services.image_gen import generate_image
from app.services.prompt_builder import (
    _normalize_mode,
    build_edit_prompt,
    build_generation_prompt,
    hex_to_color_description,
    resolve_graphic_route,
)

router = APIRouter()

# Modes that support AI image generation in the current version
_SUPPORTED_GEN_MODES = {"Nowa grafika", "Czyste zdjecie", "Zdjecie z tekstem", "Na podstawie zdjecia"}


@router.post("/graphics/preview-prompt", response_model=PreviewPromptResponse)
async def preview_prompt(req: PreviewPromptRequest):
    """Build and return image prompts without calling any image generation API.

    Debug / QA endpoint for validating prompt quality before wiring
    up the actual generation layer.
    """
    logger.info(
        f"[GRAPHICS] preview-prompt: industry={req.industry!r} "
        f"mode={req.graphic_mode!r} platform={req.platform!r} "
        f"title={req.post_title!r}"
    )

    has_source = req.source_image_source is not None

    gen_result = build_generation_prompt(
        industry=req.industry,
        platform=req.platform,
        graphic_mode=req.graphic_mode,
        post_title=req.post_title,
        post_description=req.post_description,
        post_content=req.post_content,
        style_label=req.style_label,
        visual_direction=req.visual_direction,
        brand_colors=req.brand_colors,
        entry_colors=req.entry_colors,
        product=req.product_context,
        text_density=req.text_density,
        subject_focus=req.subject_focus,
        client_feeling=req.client_feeling,
        avoid=req.avoid,
        has_source_image=has_source,
        color_strength=req.color_strength,
        content_adherence=req.content_adherence,
        visual_creativity=req.visual_creativity,
        render_style=req.render_style,
    )

    # Build edit prompt for routes that use editing
    edit_result = None
    route = gen_result.get("route", "")
    if route == "edit_with_text_zone":
        edit_result = build_edit_prompt(
            industry=req.industry,
            graphic_mode=req.graphic_mode,
            post_title=req.post_title,
            post_description=req.post_description,
            style_label=req.style_label,
            brand_colors=req.brand_colors,
            entry_colors=req.entry_colors,
            product=req.product_context,
            client_feeling=req.client_feeling,
            avoid=req.avoid,
        )

    return PreviewPromptResponse(
        generation_prompt=gen_result["prompt"],
        edit_prompt=edit_result["prompt"] if edit_result else None,
        route=route,
        style_archetype=gen_result["style_archetype"],
        aspect_ratio=gen_result["aspect_ratio"],
        resolution_hint=gen_result["resolution_hint"],
        safe_zone_side=gen_result["safe_zone_side"],
        preserve_list=edit_result["preserve_list"] if edit_result else None,
        generation_word_count=gen_result["word_count"],
        edit_word_count=edit_result["word_count"] if edit_result else None,
        generation_segments=gen_result["segments"],
        edit_segments=edit_result["segments"] if edit_result else None,
    )


@router.post("/graphics/generate", response_model=GenerateImageResponse)
async def generate_graphic(req: GenerateImageRequest):
    """Generate an AI image using the prompt builder + OpenAI image API.

    Currently supports: "Nowa grafika" and "Czyste zdjecie" modes.
    Returns a base64-encoded PNG.
    """
    mode_normalized = _normalize_mode(req.graphic_mode.strip())
    if mode_normalized not in _SUPPORTED_GEN_MODES:
        raise HTTPException(
            status_code=400,
            detail=f"Tryb '{req.graphic_mode}' nie jest jeszcze obsługiwany. "
                   f"Dostępne: {', '.join(sorted(_SUPPORTED_GEN_MODES))}",
        )

    has_source = req.source_image_source is not None

    has_post_content = bool(req.post_content and len(req.post_content.strip()) > 30)
    logger.info(
        f"[GRAPHICS] generate: industry={req.industry!r} "
        f"mode={req.graphic_mode!r} platform={req.platform!r} "
        f"title={req.post_title!r} quality={req.quality} "
        f"source_image={req.source_image_source!r} "
        f"adherence={req.content_adherence} creativity={req.visual_creativity} "
        f"has_post_content={has_post_content} post_len={len(req.post_content)}"
    )

    # Build prompt via prompt builder with route awareness
    gen_result = build_generation_prompt(
        industry=req.industry,
        platform=req.platform,
        graphic_mode=req.graphic_mode,
        post_title=req.post_title,
        post_description=req.post_description,
        post_content=req.post_content,
        style_label=req.style_label,
        visual_direction=req.visual_direction,
        brand_colors=req.brand_colors,
        entry_colors=req.entry_colors,
        product=req.product_context,
        text_density=req.text_density,
        subject_focus=req.subject_focus,
        client_feeling=req.client_feeling,
        avoid=req.avoid,
        has_source_image=has_source,
        color_strength=req.color_strength,
        content_adherence=req.content_adherence,
        visual_creativity=req.visual_creativity,
        render_style=req.render_style,
    )

    prompt = gen_result["prompt"]
    aspect_ratio = gen_result["aspect_ratio"]
    route = gen_result.get("route", "generation_from_scratch")

    vb_source = gen_result.get("visual_brief_source")
    logger.info(
        f"[GRAPHICS] resolved: route={route} archetype={gen_result['style_archetype']} "
        f"aspect={gen_result['aspect_ratio']} words={gen_result['word_count']} "
        f"vb_source={vb_source}"
    )
    # Log prompt preview (first 200 chars)
    prompt_preview = gen_result["prompt"][:200].replace("\n", " ")
    logger.info(f"[GRAPHICS] prompt preview: {prompt_preview}...")

    # Routes that use source image go through edit API; others through generate API
    _EDIT_ROUTES = {"edit_with_text_zone", "generation_inspired"}
    use_edit = route in _EDIT_ROUTES and req.source_image_b64

    try:
        if use_edit:
            logger.info(f"[GRAPHICS] using images.edit with source image (route={route})")
            img_result = edit_image(
                image_b64=req.source_image_b64,
                prompt=prompt,
                quality=req.quality,
                model=req.image_model or "",
            )
        else:
            img_result = generate_image(
                prompt=prompt,
                aspect_ratio=aspect_ratio,
                quality=req.quality,
                model=req.image_model or "",
            )
    except Exception as e:
        logger.error(f"[GRAPHICS] Image {'edit' if use_edit else 'generation'} failed: {e}")
        raise HTTPException(status_code=502, detail="Generacja obrazu nie powiodła się. Spróbuj ponownie.")

    return GenerateImageResponse(
        b64_image=img_result["b64_image"],
        prompt_used=prompt,
        route=route,
        style_archetype=gen_result["style_archetype"],
        aspect_ratio=aspect_ratio,
        size=img_result["size"],
        word_count=gen_result["word_count"],
    )


@router.post("/graphics/edit", response_model=EditImageResponse)
async def edit_graphic(req: EditImageRequest):
    """Apply a manual edit action to a source image.

    Actions: "fix_colors", "clean_background", "ad_layout".
    Accepts base64-encoded source image, returns edited base64 PNG.
    """
    if req.action not in EDIT_ACTIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Nieznana akcja: '{req.action}'. "
                   f"Dostępne: {', '.join(sorted(EDIT_ACTIONS.keys()))}",
        )

    # Build color description for background cleanup
    brand_desc = ""
    if req.brand_colors:
        descs = [hex_to_color_description(c) for c in req.brand_colors[:3]]
        brand_desc = ", ".join(descs)

    img_b64_len = len(req.image_b64) if req.image_b64 else 0
    logger.info(
        f"[GRAPHICS] edit: action={req.action!r} quality={req.quality} "
        f"safe_zone={req.safe_zone_position} brand_colors={req.brand_colors[:3]} "
        f"image_b64_chars={img_b64_len}"
    )

    prompt = build_edit_action_prompt(
        action=req.action,
        brand_colors_desc=brand_desc,
        safe_zone_position=req.safe_zone_position,
    )
    logger.info(f"[GRAPHICS] edit prompt preview: {prompt[:150]}...")

    try:
        result = edit_image(
            image_b64=req.image_b64,
            prompt=prompt,
            quality=req.quality,
            model=req.image_model or "",
        )
    except Exception as e:
        logger.error(f"[GRAPHICS] Image edit failed: {e}")
        raise HTTPException(
            status_code=502,
            detail="Edycja obrazu nie powiodła się. Spróbuj ponownie.",
        )

    return EditImageResponse(
        b64_image=result["b64_image"],
        action=req.action,
        prompt_used=prompt,
        size=result["size"],
    )
