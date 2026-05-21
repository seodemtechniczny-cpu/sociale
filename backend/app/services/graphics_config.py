"""
AI Graphics Preparation Layer — configuration data.

Pure data, zero runtime logic. Consumed by prompt_builder.py.
"""

# ---------------------------------------------------------------------------
# Style archetypes
# ---------------------------------------------------------------------------

STYLE_ARCHETYPES = {
    "clean_editorial": {
        "label": "Czysty editorial",
        "base_style": "clean product photography, studio quality",
        "lighting": "soft even studio lighting, minimal shadows",
        "background": "pure white or very light neutral background",
        "mood": "crisp, premium, professional",
        "avoid": "busy backgrounds, dramatic shadows, cluttered composition, informal elements",
    },
    "lifestyle_warm": {
        "label": "Lifestyle cieply",
        "base_style": "lifestyle photography, natural environment",
        "lighting": "warm natural daylight, golden hour tones",
        "background": "natural surfaces: wood, linen, marble, greenery",
        "mood": "warm, inviting, authentic, human",
        "avoid": "clinical white backgrounds, cold blue light, sterile empty space",
    },
    "bold_graphic": {
        "label": "Bold graficzny",
        "base_style": "bold graphic design, high contrast composition",
        "lighting": "dramatic directional light or flat graphic fill",
        "background": "strong solid color or minimal gradient",
        "mood": "modern, dynamic, confident, energetic",
        "avoid": "soft pastel tones, busy realistic textures, vintage aesthetic",
    },
    "professional_neutral": {
        "label": "Profesjonalny neutralny",
        "base_style": "professional corporate photography",
        "lighting": "clean neutral lighting, no dramatic shadows",
        "background": "neutral grey, off-white, or soft blurred workspace",
        "mood": "trustworthy, structured, competent, calm",
        "avoid": "bright saturated colors, casual aesthetics, playful elements",
    },
    "story_driven": {
        "label": "Narracyjny",
        "base_style": "cinematic lifestyle photography, storytelling composition",
        "lighting": "natural emotive light, atmospheric depth",
        "background": "environmental context that suggests a moment or narrative",
        "mood": "emotive, authentic, narrative, community-driven",
        "avoid": "sterile backgrounds, stock-photo poses, clinical flat light",
    },
}

# ---------------------------------------------------------------------------
# Industry -> default archetype
# ---------------------------------------------------------------------------

INDUSTRY_DEFAULT_ARCHETYPE = {
    "ecommerce": "clean_editorial",
    "uslugi": "professional_neutral",
    "gastronomia": "lifestyle_warm",
    "edukacja": "professional_neutral",
    "beauty_wellness": "lifestyle_warm",
    "tech": "bold_graphic",
}

# User-facing style label (from UI "prosty"/"ekspercki"/"nowoczesny") -> archetype override.
# If the user picks a style, it overrides the industry default.
STYLE_LABEL_OVERRIDE = {
    "nowoczesny": "bold_graphic",
    "ekspercki": "professional_neutral",
    "prosty": "clean_editorial",
}

# ---------------------------------------------------------------------------
# Mode -> composition config
# ---------------------------------------------------------------------------

MODE_COMPOSITION = {
    "Nowa grafika": {
        "type": "generation",
        "aspect_ratio": "4:5",
        "resolution_hint": "1080x1350",
        "safe_zone": (
            "Leave the upper 30% of the image with minimal visual detail, "
            "suitable for white or light text overlay. "
            "Keep the lower 20% simple enough for a caption block."
        ),
        "negative_space_side": "top",
        "text_area": "upper_third",
    },
    "Zdjecie z tekstem": {
        "type": "edit",
        "aspect_ratio": "4:5",
        "resolution_hint": "1080x1350",
        "safe_zone": (
            "Reserve the left 40% or upper 30% as a clean, low-contrast area "
            "where text will be overlaid deterministically."
        ),
        "negative_space_side": "left",
        "text_area": "left_side",
        "preserve_keys": [
            "overall composition",
            "lighting direction",
            "subject identity and pose",
            "color temperature",
        ],
    },
    "Czyste zdjecie": {
        "type": "generation",
        "aspect_ratio": "1:1",
        "resolution_hint": "1080x1080",
        "safe_zone": "",
        "negative_space_side": None,
        "text_area": None,
    },
    "Na podstawie zdjecia": {
        "type": "generation",
        "aspect_ratio": "4:5",
        "resolution_hint": "1080x1350",
        "safe_zone": "",
        "negative_space_side": None,
        "text_area": None,
    },
    "Karuzela": {
        "type": "generation_sequence",
        "aspect_ratio": "1:1",
        "resolution_hint": "1080x1080",
        "safe_zone": (
            "Each slide must be compositionally self-contained. "
            "Keep consistent color palette, lighting, and background style across all slides."
        ),
        "negative_space_side": "bottom",
        "text_area": "bottom_strip",
        "consistency_note": (
            "Use identical phrasing for background, lighting, and style descriptors "
            "across every slide in the carousel to prevent style drift."
        ),
    },
}

# ---------------------------------------------------------------------------
# Platform -> aspect ratio (override for mode defaults when needed)
# ---------------------------------------------------------------------------

PLATFORM_ASPECT = {
    "Instagram": "4:5",
    "Facebook": "4:5",
    "LinkedIn": "4:5",
    "blog": "16:9",
}

# ---------------------------------------------------------------------------
# Text density -> safe zone behaviour
# ---------------------------------------------------------------------------

TEXT_DENSITY_RULES = {
    "none": {
        "label": "Bez tekstu / tylko logo",
        "safe_zone_fraction": 0.0,
        "instruction": "",
    },
    "short": {
        "label": "Krotki naglowek (1-2 linijki)",
        "safe_zone_fraction": 0.25,
        "instruction": (
            "Reserve approximately 25% of the image (top or bottom strip) "
            "as a calm, low-detail area suitable for a short text overlay."
        ),
    },
    "full": {
        "label": "Naglowek + body + CTA",
        "safe_zone_fraction": 0.40,
        "instruction": (
            "Reserve approximately 40% of the image as a clean, low-contrast region "
            "for headline, body text, and a call-to-action button overlay. "
            "Push the main subject to the opposite side."
        ),
    },
}

# ---------------------------------------------------------------------------
# Subject focus -> composition preset
# ---------------------------------------------------------------------------

SUBJECT_FOCUS_PRESETS = {
    "product": {
        "label": "Produkt fizyczny",
        "composition": "centered product, tight framing, clean surroundings",
        "framing": "product occupies 40-60% of the frame, clearly visible",
    },
    "service": {
        "label": "Usluga / doswiadczenie",
        "composition": "lifestyle context, human cues suggested, environmental storytelling",
        "framing": "wider framing, context visible, subject not isolated",
    },
    "concept": {
        "label": "Idea / koncepcja",
        "composition": "abstract visual metaphor, no single physical anchor",
        "framing": "symbolic or atmospheric, open interpretation",
    },
    "food": {
        "label": "Jedzenie / napoj",
        "composition": "overhead or 45-degree angle, texture emphasis, appetizing arrangement",
        "framing": "close-up to medium shot, ingredients and texture visible",
    },
}

# ---------------------------------------------------------------------------
# Graphic route definitions
#
# Route selection decides HOW to generate based on mode + source image.
# Each route has a key, description, and generation strategy.
# ---------------------------------------------------------------------------

GRAPHIC_ROUTES = {
    "generation_from_scratch": {
        "description": "Full generation from scratch, no source image",
        "strategy": "generation",
        "needs_source_image": False,
        "subject_instruction": (
            "Create a conceptual visual representation of the topic. "
            "Do not attempt to depict a specific real product model — "
            "use symbolic, atmospheric, or abstract composition instead."
        ),
    },
    "generation_with_product": {
        "description": "Generation from scratch but product context available (no source image)",
        "strategy": "generation",
        "needs_source_image": False,
        "subject_instruction": (
            "Create a conceptual visual that strongly relates to the described product category. "
            "Since no reference photo is available, represent the product type and context "
            "rather than a specific model. Emphasize the mood, use case, and category."
        ),
    },
    "generation_inspired": {
        "description": "New graphic inspired by source image",
        "strategy": "generation",
        "needs_source_image": True,
        "subject_instruction": (
            "Create a new graphic visually inspired by the provided reference image. "
            "Maintain the visual character and key elements but create a fresh composition "
            "suitable for social media."
        ),
    },
    "clean_photo": {
        "description": "Clean photo without text overlay",
        "strategy": "generation",
        "needs_source_image": False,
        "subject_instruction": (
            "Create a clean, aesthetic photograph without any text areas or safe zones. "
            "Fill the entire frame with the composition. Focus on visual quality and mood."
        ),
    },
    "edit_with_text_zone": {
        "description": "Edit source image to prepare text overlay zone",
        "strategy": "edit",
        "needs_source_image": True,
        "subject_instruction": (
            "Modify the image to create a clean, low-contrast area suitable for text overlay. "
            "Preserve the main subject and overall composition."
        ),
    },
}

# ---------------------------------------------------------------------------
# Generation rules (global, always applied)
# ---------------------------------------------------------------------------

GENERATION_RULES = {
    "max_prompt_words": 150,
    "always_exclude": [
        "no rendered text, letters, numbers, or words anywhere in the image",
        "no watermarks",
        "no logos or trademarks in the generated image",
        "no extra objects outside the described scene",
    ],
    "always_include_use_case": True,
    "prompt_order": [
        "use_case",
        "scene_background",
        "subject",
        "style_and_lighting",
        "color_palette",
        "composition_and_safe_zone",
        "exclusions",
    ],
}

# ---------------------------------------------------------------------------
# Edit rules (for "Zdjecie z tekstem" and future edit modes)
# ---------------------------------------------------------------------------

EDIT_RULES = {
    "max_prompt_words": 120,
    "describe_final_state": True,
    "always_preserve": [
        "overall composition",
        "lighting direction",
        "color temperature",
    ],
    "always_exclude": [
        "no text rendered in the image",
        "no watermarks",
        "no new objects outside described change",
    ],
    "one_change_per_call": True,
    "prompt_order": [
        "final_state_description",
        "preserve_list",
        "change_description",
        "style_consistency",
        "exclusions",
    ],
}

# ---------------------------------------------------------------------------
# Client profile questions -> mapping (for future Autopilot UI)
#
# Structure: question_id -> { options -> archetype/composition/density effects }
# Not wired to frontend yet; consumed by prompt_builder when inputs are provided.
# ---------------------------------------------------------------------------

CLIENT_QUESTIONS = {
    "feeling": {
        "question": "Jaki feeling maja tworzyc twoje grafiki?",
        "options": {
            "professional": {
                "label": "Profesjonalny i godny zaufania",
                "archetype": "professional_neutral",
            },
            "warm": {
                "label": "Ciepły i przystepny",
                "archetype": "lifestyle_warm",
            },
            "bold": {
                "label": "Nowoczesny i dynamiczny",
                "archetype": "bold_graphic",
            },
            "premium": {
                "label": "Luksusowy i ekskluzywny",
                "archetype": "clean_editorial",
            },
        },
    },
    "subject": {
        "question": "Co jest glownym bohaterem grafiki?",
        "options": {
            "product": {
                "label": "Produkt fizyczny",
                "subject_focus": "product",
            },
            "service": {
                "label": "Usluga / doswiadczenie",
                "subject_focus": "service",
            },
            "concept": {
                "label": "Idea / koncepcja",
                "subject_focus": "concept",
            },
            "food": {
                "label": "Jedzenie / napoj",
                "subject_focus": "food",
            },
        },
    },
    "text_density": {
        "question": "Ile tekstu pojawia sie zwykle na grafice?",
        "options": {
            "none": {
                "label": "Tylko logo, bez tekstu",
                "text_density": "none",
            },
            "short": {
                "label": "Krotki naglowek (1-2 linijki)",
                "text_density": "short",
            },
            "full": {
                "label": "Naglowek + body + CTA",
                "text_density": "full",
            },
        },
    },
}

# ---------------------------------------------------------------------------
# Hex -> semantic color name mapping
#
# Used by prompt_builder to translate brand hex values into natural language
# that image models understand better than raw hex codes.
# ---------------------------------------------------------------------------

# Hue ranges (degrees) -> base color name
_HUE_NAMES = [
    (0, 15, "red"),
    (15, 40, "orange"),
    (40, 70, "yellow"),
    (70, 160, "green"),
    (160, 200, "cyan"),
    (200, 260, "blue"),
    (260, 290, "purple"),
    (290, 340, "pink"),
    (340, 360, "red"),
]

# Lightness/saturation qualifiers
_LIGHTNESS_QUALIFIERS = {
    "very_light": (0.80, 1.0),
    "light": (0.60, 0.80),
    "medium": (0.35, 0.60),
    "dark": (0.15, 0.35),
    "very_dark": (0.0, 0.15),
}

_SATURATION_QUALIFIERS = {
    "vivid": (0.70, 1.0),
    "moderate": (0.30, 0.70),
    "muted": (0.10, 0.30),
    "near-grey": (0.0, 0.10),
}
