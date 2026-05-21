from typing import List, Optional

from pydantic import BaseModel, HttpUrl


# --- Analyze (teaser) ---

class AnalyzeRequest(BaseModel):
    url: HttpUrl


class AnalyzeResponse(BaseModel):
    url: str
    business_type: str
    summary: str
    post_titles: List[str]
    brand_colors: List[str]


# --- Generate (full content) ---

class GenerateRequest(BaseModel):
    url: str
    business_type: str
    summary: str
    selected_title: str
    goal: str  # sprzedaż / edukacja / wizerunek
    promote: Optional[str] = ""
    style: str = "prosty"  # prosty / ekspercki / nowoczesny
    avoid: Optional[str] = ""
    note: Optional[str] = ""
    hashtags: Optional[str] = ""
    brand_colors: List[str] = []


class SocialPost(BaseModel):
    platform: str
    content: str


class BlogPost(BaseModel):
    title: str
    content: str
    meta_title: str
    meta_description: str


class SeoPack(BaseModel):
    keywords: List[str]
    meta_title: str
    meta_description: str


class VisualBrief(BaseModel):
    suggestion: str
    color_palette: List[str]


class GenerateResponse(BaseModel):
    social_posts: List[SocialPost]
    blog_post: BlogPost
    seo_pack: SeoPack
    visual_brief: VisualBrief


# --- Plan (content calendar) ---

class PlanRequest(BaseModel):
    url: str
    business_type: str
    summary: str
    weeks: int = 2  # 1–4
    posts_per_week: int = 3  # 2 / 3 / 4
    goal: str = "sprzedaż"
    style: str = "prosty"
    scope: str = "both"  # "blog" | "social" | "both"
    platforms: List[str] = []  # np. ["LinkedIn", "Facebook"]
    promote: Optional[str] = ""
    avoid: Optional[str] = ""
    note: Optional[str] = ""
    brand_colors: List[str] = []


class PlanEntry(BaseModel):
    week: int
    slot: str  # np. "Poniedziałek", "Środa", "Piątek"
    platform: str  # "blog", "LinkedIn", "Facebook", "Instagram"
    title: str
    description: str
    content_type: str  # "wpis blogowy", "post social"


class PlanResponse(BaseModel):
    entries: List[PlanEntry]
    summary: str


# --- Single social post ---

class SinglePostRequest(BaseModel):
    platform: str  # "LinkedIn" / "Facebook" / "Instagram"
    title: str
    description: str
    business_type: str
    summary: str
    goal: str = "sprzedaż"
    style: str = "prosty"
    promote: Optional[str] = ""
    avoid: Optional[str] = ""
    hashtags: Optional[str] = ""
    brand_colors: List[str] = []
    product_context: Optional[dict] = None  # ProductData dict if entry has a product URL


class SinglePostResponse(BaseModel):
    platform: str
    content: str


# --- Export WordPress ---

# --- Scrape product ---

class ScrapeProductRequest(BaseModel):
    url: HttpUrl


class ProductData(BaseModel):
    url: str
    source_type: str  # "product" | "service" | "offer" | "unknown"
    title: str
    description: str
    price: Optional[str] = None
    currency: Optional[str] = None
    features: List[str] = []
    images: List[str] = []
    brand: Optional[str] = None
    category: Optional[str] = None
    availability: Optional[str] = None


class ExportRequest(BaseModel):
    wp_url: str
    wp_user: str
    wp_app_password: str
    title: str
    content: str
    excerpt: Optional[str] = ""
    status: str = "draft"


class ExportResponse(BaseModel):
    success: bool
    post_id: Optional[int] = None
    post_url: Optional[str] = None
    message: str


# --- Graphics prompt preview ---

class PreviewPromptRequest(BaseModel):
    industry: str                          # business_type from analyze
    platform: str = "Instagram"
    graphic_mode: str = "Nowa grafika"
    post_title: str
    post_description: str = ""
    post_content: str = ""                 # full generated post text (primary source for visual brief)
    style_label: Optional[str] = None      # "prosty" / "ekspercki" / "nowoczesny"
    visual_direction: str = ""
    brand_colors: List[str] = []
    entry_colors: Optional[dict] = None    # per-entry color overrides
    product_context: Optional[dict] = None # ProductData dict if available
    text_density: str = "short"            # "none" / "short" / "full"
    subject_focus: str = "product"         # "product" / "service" / "concept" / "food"
    client_feeling: Optional[str] = None   # from future 3 questions
    avoid: str = ""
    source_image_source: Optional[str] = None  # "product" / "upload" / None
    color_strength: str = "reference"      # "strict" / "reference" / "free"
    content_adherence: str = "close"       # "loose" / "close" / "literal"
    visual_creativity: str = "balanced"    # "realistic" / "balanced" / "creative"
    render_style: str = "realistic"        # "realistic" / "stylized_ad" / "illustrated"


class PreviewPromptResponse(BaseModel):
    generation_prompt: str
    edit_prompt: Optional[str] = None
    route: str = ""                        # resolved graphic route key
    style_archetype: str
    aspect_ratio: str
    resolution_hint: str
    safe_zone_side: Optional[str] = None
    preserve_list: Optional[List[str]] = None
    generation_word_count: int
    edit_word_count: Optional[int] = None
    generation_segments: dict
    edit_segments: Optional[dict] = None


# --- Graphics image generation ---

class GenerateImageRequest(BaseModel):
    industry: str
    platform: str = "Instagram"
    graphic_mode: str = "Nowa grafika"
    post_title: str
    post_description: str = ""
    post_content: str = ""                 # full generated post text (primary source for visual brief)
    style_label: Optional[str] = None
    visual_direction: str = ""
    brand_colors: List[str] = []
    entry_colors: Optional[dict] = None
    product_context: Optional[dict] = None
    text_density: str = "short"
    subject_focus: str = "product"
    client_feeling: Optional[str] = None
    avoid: str = ""
    quality: str = "medium"               # "low" / "medium" / "high"
    image_model: Optional[str] = None      # "gpt-image-2" / "gpt-image-1.5" / "gpt-image-1" / "gpt-image-1-mini"
    source_image_source: Optional[str] = None  # "product" / "upload" / None
    source_image_b64: Optional[str] = None     # base64-encoded source image for edit-based routes
    color_strength: str = "reference"      # "strict" / "reference" / "free"
    content_adherence: str = "close"       # "loose" / "close" / "literal"
    visual_creativity: str = "balanced"    # "realistic" / "balanced" / "creative"
    render_style: str = "realistic"        # "realistic" / "stylized_ad" / "illustrated"


class GenerateImageResponse(BaseModel):
    b64_image: str                         # base64-encoded PNG
    prompt_used: str                       # the actual prompt sent to image API
    route: str = ""                        # resolved graphic route key
    style_archetype: str
    aspect_ratio: str
    size: str                              # e.g. "1024x1536"
    word_count: int


# --- Image edit (manual actions on source image) ---

class EditImageRequest(BaseModel):
    action: str                            # "fix_colors" / "clean_background" / "ad_layout"
    image_b64: str                         # base64-encoded source image (with or without data: prefix)
    brand_colors: List[str] = []           # for background cleanup / ad_layout color hints
    quality: str = "medium"
    image_model: Optional[str] = None      # "gpt-image-2" / "gpt-image-1.5" / "gpt-image-1" / "gpt-image-1-mini"
    safe_zone_position: str = "top"        # "top" / "bottom" / "left" — for ad_layout

class EditImageResponse(BaseModel):
    b64_image: str                         # base64-encoded result PNG
    action: str
    prompt_used: str
    size: str
