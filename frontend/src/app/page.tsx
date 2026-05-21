"use client";

import { useState, useRef, useEffect, useCallback } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// --- Helpers ---

function parseApiError(status: number, fallback: string): string {
  switch (status) {
    case 429: return "Zbyt wiele zapytań — odczekaj chwilę i spróbuj ponownie.";
    case 502: return "Serwer AI chwilowo niedostępny. Spróbuj za moment.";
    case 504: return "Generacja przekroczyła limit czasu. Spróbuj ponownie.";
    default: return fallback;
  }
}

// --- Headline sanitizer for overlay text ---

function sanitizeHeadline(raw: string, maxLen = 40): string {
  if (!raw) return raw;
  // Strip hashtags (#Edition1, #AMGPakiet, etc.)
  let text = raw.replace(/#\S+/g, "").trim();
  // Strip technical codes (e.g. #550, 4.5B, 1.8T) but NOT plain years like 2025
  text = text.replace(/\s+#\d+\b/g, "").trim();
  text = text.replace(/\s+\d+\.\d+[A-Z]?\b/g, "").trim();
  // Collapse multiple spaces
  text = text.replace(/\s{2,}/g, " ").trim();
  // If still too long, cut at last word boundary
  if (text.length > maxLen) {
    text = text.slice(0, maxLen).replace(/\s+\S*$/, "").trim();
    // Don't add ellipsis — clean cut for graphic headline
  }
  // If stripping left us with almost nothing, fall back to first N chars of original
  if (text.length < 5) {
    text = raw.replace(/#\S+/g, "").trim().slice(0, maxLen).replace(/\s+\S*$/, "").trim();
  }
  return text;
}

// --- Canvas overlay helpers ---

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function drawOverlayText(
  ctx: CanvasRenderingContext2D,
  text: string,
  position: string,
  W: number,
  H: number,
  colors: { bg: string; accent: string; text: string },
  hasPhotoBg: boolean,
) {
  const fontSize = Math.round(W * 0.055); // ~59px at 1080w
  const lineHeight = fontSize * 1.25;
  const pad = Math.round(W * 0.07); // ~76px margin
  ctx.font = `800 ${fontSize}px "Inter", "SF Pro Display", system-ui, -apple-system, sans-serif`;
  ctx.textBaseline = "top";

  const maxTextWidth = position === "left" ? W * 0.38 : W - pad * 2;
  const lines = wrapText(ctx, text, maxTextWidth);
  const blockH = lines.length * lineHeight;

  // Compute text region
  let x = pad;
  let y = pad;
  let scrimX = 0, scrimY = 0, scrimW = W, scrimH = 0;

  if (position === "top") {
    y = pad;
    scrimY = 0;
    scrimH = blockH + pad * 3;
    scrimW = W;
  } else if (position === "bottom") {
    y = H - pad - blockH;
    scrimY = y - pad * 2;
    scrimH = H - scrimY;
    scrimW = W;
  } else if (position === "left") {
    x = pad;
    y = H * 0.35;
    scrimX = 0;
    scrimY = 0;
    scrimW = W * 0.48;
    scrimH = H;
  }

  // Draw scrim (semi-transparent overlay for contrast) only on photo backgrounds
  if (hasPhotoBg) {
    const gradient = ctx.createLinearGradient(scrimX, scrimY, scrimX, scrimY + scrimH);
    if (position === "top") {
      gradient.addColorStop(0, "rgba(0,0,0,0.70)");
      gradient.addColorStop(0.6, "rgba(0,0,0,0.35)");
      gradient.addColorStop(1, "rgba(0,0,0,0)");
    } else if (position === "bottom") {
      gradient.addColorStop(0, "rgba(0,0,0,0)");
      gradient.addColorStop(0.4, "rgba(0,0,0,0.35)");
      gradient.addColorStop(1, "rgba(0,0,0,0.70)");
    } else {
      // left — horizontal gradient
      const hGrad = ctx.createLinearGradient(scrimX, 0, scrimX + scrimW, 0);
      hGrad.addColorStop(0, "rgba(0,0,0,0.65)");
      hGrad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = hGrad;
      ctx.fillRect(scrimX, scrimY, scrimW, scrimH);
    }
    if (position !== "left") {
      ctx.fillStyle = gradient;
      ctx.fillRect(scrimX, scrimY, scrimW, scrimH);
    }
  }

  // Draw accent bar
  const barW = Math.round(W * 0.06);
  const barH = 5;
  ctx.fillStyle = colors.accent;
  if (position === "left") {
    ctx.fillRect(x, y - 20, barW, barH);
  } else {
    ctx.fillRect(x, y - 12, barW, barH);
  }

  // Draw text with shadow for photo backgrounds
  const textColor = hasPhotoBg ? "#ffffff" : colors.text;
  ctx.fillStyle = textColor;
  if (hasPhotoBg) {
    ctx.shadowColor = "rgba(0,0,0,0.8)";
    ctx.shadowBlur = 12;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 3;
  }
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], x, y + i * lineHeight);
  }
  // Reset shadow
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
}

function drawLogo(
  ctx: CanvasRenderingContext2D,
  logoImg: HTMLImageElement,
  textPosition: string,
  W: number,
  H: number,
) {
  const maxLogoW = Math.round(W * 0.14); // ~150px
  const maxLogoH = Math.round(H * 0.06); // ~80px
  const pad = Math.round(W * 0.05);

  let lw = logoImg.naturalWidth;
  let lh = logoImg.naturalHeight;
  const scale = Math.min(maxLogoW / lw, maxLogoH / lh, 1);
  lw = Math.round(lw * scale);
  lh = Math.round(lh * scale);

  // Position logo away from text: if text is top, logo goes bottom-right; if bottom, top-right
  let lx: number, ly: number;
  if (textPosition === "bottom") {
    lx = W - pad - lw;
    ly = pad;
  } else if (textPosition === "left") {
    lx = W - pad - lw;
    ly = H - pad - lh;
  } else {
    // top or default — logo bottom-right
    lx = W - pad - lw;
    ly = H - pad - lh;
  }

  // Subtle shadow behind logo for contrast on photos
  ctx.shadowColor = "rgba(0,0,0,0.3)";
  ctx.shadowBlur = 6;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 2;
  ctx.drawImage(logoImg, lx, ly, lw, lh);
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
}

// --- Types ---

interface AnalyzeResult {
  url: string;
  business_type: string;
  summary: string;
  post_titles: string[];
  brand_colors: string[];
}

interface SocialPost {
  platform: string;
  content: string;
}

interface BlogPost {
  title: string;
  content: string;
  meta_title: string;
  meta_description: string;
}

interface GenerateResult {
  social_posts: SocialPost[];
  blog_post: BlogPost;
  seo_pack: {
    keywords: string[];
    meta_title: string;
    meta_description: string;
  };
  visual_brief: {
    suggestion: string;
    color_palette: string[];
  };
}

interface ProductData {
  url: string;
  source_type: string;
  title: string;
  description: string;
  price: string | null;
  currency: string | null;
  features: string[];
  images: string[];
  brand: string | null;
  category: string | null;
  availability: string | null;
}

interface PlanEntry {
  week: number;
  slot: string;
  platform: string;
  title: string;
  description: string;
  content_type: string;
}

interface PlanResult {
  entries: PlanEntry[];
  summary: string;
}

interface PromptPreviewResult {
  generation_prompt: string;
  edit_prompt: string | null;
  route: string;
  style_archetype: string;
  aspect_ratio: string;
  resolution_hint: string;
  safe_zone_side: string | null;
  preserve_list: string[] | null;
  generation_word_count: number;
  edit_word_count: number | null;
  generation_segments: Record<string, string>;
  edit_segments: Record<string, string> | null;
}

type Step = "landing" | "teaser" | "plan" | "brief" | "results";

interface SourceImage {
  url: string;                    // data URL (upload) or remote URL (product)
  source: "product" | "upload";
  name?: string;                  // original filename for uploads
}

// --- Persistence ---

const STORAGE_KEY = "sociale_v1";
const SCHEMA_VERSION = 10;

const IMAGE_MODELS: ReadonlyArray<{ id: string; label: string; hint: string }> = [
  { id: "gpt-image-2", label: "Najnowszy ⭐", hint: "Najlepsza jakość" },
  { id: "gpt-image-1.5", label: "Stabilny", hint: "Dojrzały, bezpieczny" },
  { id: "gpt-image-1", label: "Klasyczny", hint: "Sprawdzony baseline" },
  { id: "gpt-image-1-mini", label: "Szybki", hint: "Tańszy, do draftów" },
] as const;
const DEFAULT_IMAGE_MODEL = "gpt-image-2";

interface PersistedState {
  _v: number;
  step: Step;
  url: string;
  analyzeResult: AnalyzeResult | null;
  selectedTitle: number | null;
  briefOrigin: "teaser" | "plan";
  goal: string;
  promote: string;
  style: string;
  avoid: string;
  note: string;
  hashtags: string;
  planWeeks: number;
  planPostsPerWeek: number;
  planScope: "blog" | "social" | "both";
  planPlatforms: string[];
  planPromote: string;
  planStyle: string;
  planAvoid: string;
  planNote: string;
  planResult: PlanResult | null;
  generatedPosts: Record<string, { platform: string; content: string }>;
  entryHashtags: Record<string, string>;
  entrySlots: Record<string, string>;
  entryTitles: Record<string, string>;
  entryDescriptions: Record<string, string>;
  selectedEntries: string[];
  generateResult: GenerateResult | null;
  generatedBlogs: Record<string, BlogPost>;
  entryGraphicMode: Record<string, string>;
  entryVisualDirection: Record<string, string>;
  brandOverrides: { bg: string; accent: string; text: string };
  logoDataUrl: string;
  entryProductUrl: Record<string, string>;
  entryProductData: Record<string, ProductData>;
  entryProductImage: Record<string, string>;
  entryColorOverrides: Record<string, { bg?: string; accent?: string; text?: string }>;
  clientFeeling: string;
  clientSubject: string;
  clientTextDensity: string;
  entrySourceImage: Record<string, SourceImage>;
  entryOverlayText: Record<string, string>;
  entryOverlayPosition: Record<string, string>;
  imageModel: string;
}

// --- Component ---

export default function Home() {
  const [step, setStep] = useState<Step>("landing");

  // Landing
  const [url, setUrl] = useState("");

  // Teaser
  const [analyzeResult, setAnalyzeResult] = useState<AnalyzeResult | null>(null);
  const [selectedTitle, setSelectedTitle] = useState<number | null>(null);

  // Brief
  const [briefOrigin, setBriefOrigin] = useState<"teaser" | "plan">("teaser");
  const [goal, setGoal] = useState("sprzedaż");
  const [promote, setPromote] = useState("");
  const [style, setStyle] = useState("prosty");
  const [avoid, setAvoid] = useState("");
  const [note, setNote] = useState("");
  const [hashtags, setHashtags] = useState("");

  // Plan
  const [planWeeks, setPlanWeeks] = useState(2);
  const [planPostsPerWeek, setPlanPostsPerWeek] = useState(3);
  const [planScope, setPlanScope] = useState<"blog" | "social" | "both">("both");
  const [planPlatforms, setPlanPlatforms] = useState<string[]>(["LinkedIn", "Facebook", "Instagram"]);
  const [planPromote, setPlanPromote] = useState("");
  const [planStyle, setPlanStyle] = useState("prosty");
  const [planAvoid, setPlanAvoid] = useState("");
  const [planNote, setPlanNote] = useState("");
  const [planResult, setPlanResult] = useState<PlanResult | null>(null);
  const [generatedPosts, setGeneratedPosts] = useState<Record<string, { platform: string; content: string }>>({});
  const [generatedBlogs, setGeneratedBlogs] = useState<Record<string, BlogPost>>({});
  const [currentBlogEntryKey, setCurrentBlogEntryKey] = useState<string | null>(null);
  const [postLoadingKeys, setPostLoadingKeys] = useState<Set<string>>(new Set());
  const [singlePostErrors, setSinglePostErrors] = useState<Record<string, string>>({});
  const [slowLoadingKeys, setSlowLoadingKeys] = useState<Set<string>>(new Set());
  const slowTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [entryHashtags, setEntryHashtags] = useState<Record<string, string>>({});
  const [entryGraphicMode, setEntryGraphicMode] = useState<Record<string, string>>({});
  const [entryContentAdherence, setEntryContentAdherence] = useState<Record<string, string>>({}); // "loose" / "close" / "literal"
  const [entryVisualCreativity, setEntryVisualCreativity] = useState<Record<string, string>>({}); // "realistic" / "balanced" / "creative"
  const [entryRenderStyle, setEntryRenderStyle] = useState<Record<string, string>>({}); // "realistic" / "stylized_ad" / "illustrated"
  const [entryVisualDirection, setEntryVisualDirection] = useState<Record<string, string>>({});
  const [brandOverrides, setBrandOverrides] = useState<{ bg: string; accent: string; text: string }>({ bg: "#ffffff", accent: "#6366f1", text: "#1a1a1a" });
  const [logoDataUrl, setLogoDataUrl] = useState<string>("");
  const [graphicPreview, setGraphicPreview] = useState<{ dataUrl: string; filename: string } | null>(null);
  const renderedGraphicKeys = useRef<Set<string>>(new Set());
  const [entryProductUrl, setEntryProductUrl] = useState<Record<string, string>>({});
  const [entryProductData, setEntryProductData] = useState<Record<string, ProductData>>({});
  const [entryProductImage, setEntryProductImage] = useState<Record<string, string>>({});
  const [productLoadingKeys, setProductLoadingKeys] = useState<Set<string>>(new Set());
  const [entryColorOverrides, setEntryColorOverrides] = useState<Record<string, { bg?: string; accent?: string; text?: string }>>({});
  const [entrySourceImage, setEntrySourceImage] = useState<Record<string, SourceImage>>({});
  const [entryOverlayText, setEntryOverlayText] = useState<Record<string, string>>({});
  const [entryOverlayPosition, setEntryOverlayPosition] = useState<Record<string, string>>({});
  const [editActionLoading, setEditActionLoading] = useState<Record<string, string>>({}); // entryKey -> action in progress
  const [editActionErrors, setEditActionErrors] = useState<Record<string, string>>({});

  // Client profile questions (global for session — feed into prompt builder)
  const [clientFeeling, setClientFeeling] = useState("");
  const [clientSubject, setClientSubject] = useState("");
  const [clientTextDensity, setClientTextDensity] = useState("");
  const [imageModel, setImageModel] = useState<string>(DEFAULT_IMAGE_MODEL);

  // Prompt preview per entry
  const [promptPreviews, setPromptPreviews] = useState<Record<string, PromptPreviewResult>>({});
  const [promptPreviewOpen, setPromptPreviewOpen] = useState<Record<string, boolean>>({});
  const [promptPreviewLoading, setPromptPreviewLoading] = useState<Set<string>>(new Set());

  // AI image generation per entry
  const [entryAiBackground, setEntryAiBackground] = useState<Record<string, string>>({}); // entryKey -> data:image/png;base64,...
  const [aiGenLoading, setAiGenLoading] = useState<Set<string>>(new Set());
  const [aiGenErrors, setAiGenErrors] = useState<Record<string, string>>({});
  const [aiGenMeta, setAiGenMeta] = useState<Record<string, { route: string; usedSource: boolean; method: "generate" | "edit" }>>({}); // feedback after generation
  const [entryLastRender, setEntryLastRender] = useState<Record<string, { dataUrl: string; filename: string }>>({}); // persisted last preview per entry

  const [entrySlots, setEntrySlots] = useState<Record<string, string>>({});
  const [entryTitles, setEntryTitles] = useState<Record<string, string>>({});
  const [entryDescriptions, setEntryDescriptions] = useState<Record<string, string>>({});
  const [selectedEntries, setSelectedEntries] = useState<Set<string>>(new Set());
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number; failed: string[] } | null>(null);

  // Results
  const [generateResult, setGenerateResult] = useState<GenerateResult | null>(null);

  // WordPress export
  const [showExportForm, setShowExportForm] = useState(false);
  const [wpUrl, setWpUrl] = useState("");
  const [wpUser, setWpUser] = useState("");
  const [wpAppPassword, setWpAppPassword] = useState("");
  const [exportLoading, setExportLoading] = useState(false);
  const [exportMessage, setExportMessage] = useState<{ ok: boolean; text: string } | null>(null);

  // Shared
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // --- Restore from localStorage on mount ---
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved: PersistedState = JSON.parse(raw);
      if (saved._v !== SCHEMA_VERSION) {
        localStorage.removeItem(STORAGE_KEY);
        return;
      }
      setStep(saved.step);
      setUrl(saved.url);
      setAnalyzeResult(saved.analyzeResult);
      setSelectedTitle(saved.selectedTitle);
      setBriefOrigin(saved.briefOrigin);
      setGoal(saved.goal);
      setPromote(saved.promote);
      setStyle(saved.style);
      setAvoid(saved.avoid);
      setNote(saved.note);
      setHashtags(saved.hashtags);
      setPlanWeeks(saved.planWeeks);
      setPlanPostsPerWeek(saved.planPostsPerWeek);
      setPlanScope(saved.planScope);
      setPlanPlatforms(saved.planPlatforms);
      setPlanPromote(saved.planPromote);
      setPlanStyle(saved.planStyle);
      setPlanAvoid(saved.planAvoid);
      setPlanNote(saved.planNote);
      setPlanResult(saved.planResult);
      setGeneratedPosts(saved.generatedPosts);
      setEntryHashtags(saved.entryHashtags);
      setEntrySlots(saved.entrySlots);
      setEntryTitles(saved.entryTitles);
      setEntryDescriptions(saved.entryDescriptions);
      setSelectedEntries(new Set(saved.selectedEntries));
      setGenerateResult(saved.generateResult);
      setGeneratedBlogs(saved.generatedBlogs ?? {});
      setEntryGraphicMode(saved.entryGraphicMode ?? {});
      setEntryVisualDirection(saved.entryVisualDirection ?? {});
      if (saved.brandOverrides) setBrandOverrides(saved.brandOverrides);
      if (saved.logoDataUrl) setLogoDataUrl(saved.logoDataUrl);
      if (saved.entryProductUrl) setEntryProductUrl(saved.entryProductUrl);
      if (saved.entryProductData) setEntryProductData(saved.entryProductData);
      if (saved.entryProductImage) setEntryProductImage(saved.entryProductImage);
      if (saved.entryColorOverrides) setEntryColorOverrides(saved.entryColorOverrides);
      if (saved.clientFeeling) setClientFeeling(saved.clientFeeling);
      if (saved.clientSubject) setClientSubject(saved.clientSubject);
      if (saved.clientTextDensity) setClientTextDensity(saved.clientTextDensity);
      if (saved.entrySourceImage) setEntrySourceImage(saved.entrySourceImage);
      if (saved.entryOverlayText) setEntryOverlayText(saved.entryOverlayText);
      if (saved.entryOverlayPosition) setEntryOverlayPosition(saved.entryOverlayPosition);
      if (saved.imageModel && IMAGE_MODELS.some((m) => m.id === saved.imageModel)) {
        setImageModel(saved.imageModel);
      }
    } catch {
      // Uszkodzony lub nieparsowalny wpis — wyczyść, żeby nie próbować w kółko
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  // --- Save to localStorage on state change ---
  useEffect(() => {
    try {
      const state: PersistedState = {
        _v: SCHEMA_VERSION,
        step,
        url,
        analyzeResult,
        selectedTitle,
        briefOrigin,
        goal,
        promote,
        style,
        avoid,
        note,
        hashtags,
        planWeeks,
        planPostsPerWeek,
        planScope,
        planPlatforms,
        planPromote,
        planStyle,
        planAvoid,
        planNote,
        planResult,
        generatedPosts,
        entryHashtags,
        entrySlots,
        entryTitles,
        entryDescriptions,
        selectedEntries: Array.from(selectedEntries),
        generateResult,
        generatedBlogs,
        entryGraphicMode,
        entryVisualDirection,
        brandOverrides,
        logoDataUrl,
        entryProductUrl,
        entryProductData,
        entryProductImage,
        entryColorOverrides,
        clientFeeling,
        clientSubject,
        clientTextDensity,
        entrySourceImage,
        entryOverlayText,
        entryOverlayPosition,
        imageModel,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // localStorage pełny lub niedostępny (tryb prywatny) — ignoruj cicho
    }
  }, [
    step, url, analyzeResult, selectedTitle, briefOrigin,
    goal, promote, style, avoid, note, hashtags,
    planWeeks, planPostsPerWeek, planScope, planPlatforms,
    planPromote, planStyle, planAvoid, planNote, planResult,
    generatedPosts, entryHashtags, entrySlots, entryTitles,
    entryDescriptions, selectedEntries, generateResult, generatedBlogs,
    entryGraphicMode, entryVisualDirection,
    brandOverrides, logoDataUrl,
    entryProductUrl, entryProductData, entryProductImage,
    entryColorOverrides, entrySourceImage,
    entryOverlayText, entryOverlayPosition,
    clientFeeling, clientSubject, clientTextDensity,
    imageModel,
  ]);

  function resetAll() {
    localStorage.removeItem(STORAGE_KEY);
    setStep("landing");
    setUrl("");
    setAnalyzeResult(null);
    setSelectedTitle(null);
    setBriefOrigin("teaser");
    setGoal("sprzedaż");
    setPromote("");
    setStyle("prosty");
    setAvoid("");
    setNote("");
    setHashtags("");
    setGenerateResult(null);
    setPlanWeeks(2);
    setPlanPostsPerWeek(3);
    setPlanScope("both");
    setPlanPlatforms(["LinkedIn", "Facebook", "Instagram"]);
    setPlanPromote("");
    setPlanStyle("prosty");
    setPlanAvoid("");
    setPlanNote("");
    setPlanResult(null);
    setGeneratedPosts({});
    setGeneratedBlogs({});
    setCurrentBlogEntryKey(null);
    setEntryGraphicMode({});
    setEntryVisualDirection({});
    setBrandOverrides({ bg: "#ffffff", accent: "#6366f1", text: "#1a1a1a" });
    setLogoDataUrl("");
    setEntryProductUrl({});
    setEntryProductData({});
    setEntryProductImage({});
    setEntryColorOverrides({});
    setEntrySourceImage({});
    setEntryOverlayText({});
    setEntryOverlayPosition({});
    setClientFeeling("");
    setClientSubject("");
    setClientTextDensity("");
    setImageModel(DEFAULT_IMAGE_MODEL);
    setPromptPreviews({});
    setPromptPreviewOpen({});
    setPromptPreviewLoading(new Set());
    setEntryAiBackground({});
    setEntryLastRender({});
    setAiGenLoading(new Set());
    setAiGenErrors({});
    setProductLoadingKeys(new Set());
    setPostLoadingKeys(new Set());
    setEntryHashtags({});
    setEntrySlots({});
    setEntryTitles({});
    setEntryDescriptions({});
    setSelectedEntries(new Set());
    setBatchProgress(null);
    setSinglePostErrors({});
    setSlowLoadingKeys(new Set());
    setShowExportForm(false);
    setWpUrl("");
    setWpUser("");
    setWpAppPassword("");
    setExportLoading(false);
    setExportMessage(null);
    setError("");
  }

  // --- Graphic rendering ---

  const renderGraphic = useCallback(async (title: string, _description: string, weekNum: number, day: string, platform: string, entryKey: string) => {
    const W = 1080;
    const H = 1350;
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d")!;

    // Resolve colors
    const ec = entryColorOverrides[entryKey] ?? {};
    const colors = {
      bg:     ec.bg     ?? brandOverrides.bg,
      accent: ec.accent ?? brandOverrides.accent,
      text:   ec.text   ?? brandOverrides.text,
    };

    // Overlay text: per-entry headline, fallback to title truncated
    const overlayText = sanitizeHeadline(entryOverlayText[entryKey] || title || "", 45);
    const position = entryOverlayPosition[entryKey] || "top";
    const hasAiBg = !!entryAiBackground[entryKey];

    // Step 1: Draw background
    const drawContent = () => {
      // Step 2: Overlay text (if position != "none" and text exists)
      if (position !== "none" && overlayText.trim()) {
        drawOverlayText(ctx, overlayText, position, W, H, colors, hasAiBg);
      }

      // Step 3: Logo
      if (logoDataUrl) {
        const logoImg = new Image();
        logoImg.onload = () => {
          drawLogo(ctx, logoImg, position, W, H);
          finalize();
        };
        logoImg.onerror = () => finalize();
        logoImg.src = logoDataUrl;
      } else {
        finalize();
      }
    };

    const finalize = () => {
      const dataUrl = canvas.toDataURL("image/png");
      const slug = `${weekNum}-${day}-${platform}`.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      const preview = { dataUrl, filename: `grafika-${slug}.png` };
      renderedGraphicKeys.current.add(entryKey);
      setEntryLastRender((prev) => ({ ...prev, [entryKey]: preview }));
      setGraphicPreview(preview);
    };

    // Background priority: AI background > source image > solid color
    const bgSrc = entryAiBackground[entryKey] || entrySourceImage[entryKey]?.url;
    if (bgSrc) {
      const bgImg = new Image();
      bgImg.onload = () => {
        ctx.drawImage(bgImg, 0, 0, W, H);
        drawContent();
      };
      bgImg.onerror = () => {
        ctx.fillStyle = colors.bg;
        ctx.fillRect(0, 0, W, H);
        drawContent();
      };
      bgImg.src = bgSrc;
    } else {
      ctx.fillStyle = colors.bg;
      ctx.fillRect(0, 0, W, H);
      drawContent();
    }
  }, [brandOverrides, logoDataUrl, entryColorOverrides, entryAiBackground, entrySourceImage, entryOverlayText, entryOverlayPosition]);

  // --- Prompt preview ---

  async function handlePromptPreview(entry: PlanEntry, entryKey: string) {
    if (!analyzeResult) return;
    setPromptPreviewLoading((prev) => new Set(prev).add(entryKey));
    try {
      const gm = entryGraphicMode[entryKey] || "Nowa grafika";
      const res = await fetch(`${API_URL}/api/graphics/preview-prompt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          industry: analyzeResult.business_type,
          platform: entry.platform,
          graphic_mode: gm.normalize("NFC"),
          post_title: entryTitles[entryKey] || entry.title,
          post_description: entryDescriptions[entryKey] || entry.description,
          post_content: generatedPosts[entryKey]?.content || "",
          style_label: planStyle || undefined,
          visual_direction: entryVisualDirection[entryKey] || "",
          brand_colors: analyzeResult.brand_colors || [],
          entry_colors: entryColorOverrides[entryKey] || undefined,
          product_context: entryProductData[entryKey] || undefined,
          text_density: clientTextDensity || "short",
          subject_focus: clientSubject || "product",
          client_feeling: clientFeeling || undefined,
          avoid: planAvoid || "",
          source_image_source: entrySourceImage[entryKey]?.source || undefined,
          content_adherence: entryContentAdherence[entryKey] || "close",
          visual_creativity: entryVisualCreativity[entryKey] || "balanced",
          render_style: entryRenderStyle[entryKey] || "realistic",
        }),
      });
      if (!res.ok) throw new Error("Nie udało się pobrać podglądu promptu.");
      const data: PromptPreviewResult = await res.json();
      setPromptPreviews((prev) => ({ ...prev, [entryKey]: data }));
      setPromptPreviewOpen((prev) => ({ ...prev, [entryKey]: true }));
    } catch {
      setPromptPreviews((prev) => {
        const n = { ...prev };
        delete n[entryKey];
        return n;
      });
    } finally {
      setPromptPreviewLoading((prev) => {
        const next = new Set(prev);
        next.delete(entryKey);
        return next;
      });
    }
  }

  // --- AI image generation ---

  async function handleAiGenerate(entry: PlanEntry, entryKey: string, weekNum: number) {
    if (!analyzeResult) return;
    const gm = entryGraphicMode[entryKey] || "Nowa grafika";

    setAiGenErrors((prev) => { const n = { ...prev }; delete n[entryKey]; return n; });
    setAiGenLoading((prev) => new Set(prev).add(entryKey));

    try {
      // Resolve source image to base64 if available (product URLs need fetch)
      let sourceB64: string | undefined;
      const srcImg = entrySourceImage[entryKey];
      if (srcImg) {
        if (srcImg.source === "product" && srcImg.url.startsWith("http")) {
          const imgRes = await fetch(srcImg.url);
          if (imgRes.ok) {
            const blob = await imgRes.blob();
            sourceB64 = await new Promise<string>((resolve) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result as string);
              reader.readAsDataURL(blob);
            });
          }
        } else {
          sourceB64 = srcImg.url;
        }
      }

      const res = await fetch(`${API_URL}/api/graphics/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          industry: analyzeResult.business_type,
          platform: entry.platform,
          graphic_mode: gm.normalize("NFC"),
          post_title: entryTitles[entryKey] || entry.title,
          post_description: entryDescriptions[entryKey] || entry.description,
          post_content: generatedPosts[entryKey]?.content || "",
          style_label: planStyle || undefined,
          visual_direction: entryVisualDirection[entryKey] || "",
          brand_colors: analyzeResult.brand_colors || [],
          entry_colors: entryColorOverrides[entryKey] || undefined,
          product_context: entryProductData[entryKey] || undefined,
          text_density: clientTextDensity || "short",
          subject_focus: clientSubject || "product",
          client_feeling: clientFeeling || undefined,
          avoid: planAvoid || "",
          quality: "medium",
          image_model: imageModel,
          source_image_source: srcImg?.source || undefined,
          source_image_b64: sourceB64 || undefined,
          content_adherence: entryContentAdherence[entryKey] || "close",
          visual_creativity: entryVisualCreativity[entryKey] || "balanced",
          render_style: entryRenderStyle[entryKey] || "realistic",
        }),
      });
      if (!res.ok) throw new Error(parseApiError(res.status, "Nie udało się wygenerować grafiki AI."));
      const data = await res.json();
      const dataUrl = `data:image/png;base64,${data.b64_image}`;

      // Store generation metadata for feedback chip
      const editRoutes = new Set(["edit_with_text_zone", "generation_inspired"]);
      setAiGenMeta((prev) => ({
        ...prev,
        [entryKey]: {
          route: data.route || "generation_from_scratch",
          usedSource: !!sourceB64,
          method: editRoutes.has(data.route) && sourceB64 ? "edit" : "generate",
        },
      }));

      if (gm === "Czyste zdjęcie") {
        // Pure photo mode — show directly without overlay
        const slug = `${weekNum}-${entrySlots[entryKey] || entry.slot}-${entry.platform}`.toLowerCase().replace(/[^a-z0-9]+/g, "-");
        const preview = { dataUrl, filename: `grafika-ai-${slug}.png` };
        setEntryLastRender((prev) => ({ ...prev, [entryKey]: preview }));
        setGraphicPreview(preview);
      } else {
        // Hybrid C: store as background, then render with text+logo overlay
        setEntryAiBackground((prev) => ({ ...prev, [entryKey]: dataUrl }));
        // Auto-render the composite immediately
        setTimeout(() => {
          renderGraphic(
            entryTitles[entryKey] || entry.title,
            entryDescriptions[entryKey] || entry.description,
            weekNum,
            entrySlots[entryKey] || entry.slot,
            entry.platform,
            entryKey,
          );
        }, 100);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Nie udało się wygenerować grafiki AI.";
      setAiGenErrors((prev) => ({ ...prev, [entryKey]: msg }));
    } finally {
      setAiGenLoading((prev) => {
        const next = new Set(prev);
        next.delete(entryKey);
        return next;
      });
    }
  }

  // --- Source image edit actions ---

  async function handleEditAction(entryKey: string, action: "fix_colors" | "clean_background" | "ad_layout") {
    const sourceImg = entrySourceImage[entryKey];
    if (!sourceImg) return;

    setEditActionErrors((prev) => { const n = { ...prev }; delete n[entryKey]; return n; });
    setEditActionLoading((prev) => ({ ...prev, [entryKey]: action }));

    try {
      // For product images from URL, we need to fetch and convert to base64 first
      let imageB64 = sourceImg.url;
      if (sourceImg.source === "product" && sourceImg.url.startsWith("http")) {
        const imgRes = await fetch(sourceImg.url);
        if (!imgRes.ok) throw new Error("Nie udało się pobrać zdjęcia produktu.");
        const blob = await imgRes.blob();
        imageB64 = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.readAsDataURL(blob);
        });
      }

      const res = await fetch(`${API_URL}/api/graphics/edit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          image_b64: imageB64,
          brand_colors: analyzeResult?.brand_colors || [],
          quality: "medium",
          image_model: imageModel,
          safe_zone_position: entryOverlayPosition[entryKey] || "top",
        }),
      });
      if (!res.ok) throw new Error(parseApiError(res.status, "Edycja obrazu nie powiodła się."));
      const data = await res.json();
      const resultUrl = `data:image/png;base64,${data.b64_image}`;
      const actionLabels: Record<string, string> = {
        fix_colors: "korekta-kolorow",
        clean_background: "czyste-tlo",
        ad_layout: "wersja-reklamowa",
      };
      const filename = `${actionLabels[action] || action}-${Date.now()}.png`;

      // Replace source image with the edited result
      setEntrySourceImage((prev) => ({
        ...prev,
        [entryKey]: { url: resultUrl, source: "upload", name: filename },
      }));

      // Show preview with download + persist for reopen
      const preview = { dataUrl: resultUrl, filename };
      setEntryLastRender((prev) => ({ ...prev, [entryKey]: preview }));
      setGraphicPreview(preview);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Edycja nie powiodła się.";
      setEditActionErrors((prev) => ({ ...prev, [entryKey]: msg }));
    } finally {
      setEditActionLoading((prev) => { const n = { ...prev }; delete n[entryKey]; return n; });
    }
  }

  // --- Analyze ---

  async function handleAnalyze(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (!res.ok) throw new Error(parseApiError(res.status, "Nie udało się przeanalizować strony."));
      const data: AnalyzeResult = await res.json();
      setAnalyzeResult(data);
      if (data.brand_colors?.length) {
        setBrandOverrides({
          bg: "#ffffff",
          accent: data.brand_colors[0] || "#6366f1",
          text: data.brand_colors[1] || "#1a1a1a",
        });
      }
      setStep("teaser");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Wystąpił nieoczekiwany błąd.");
    } finally {
      setLoading(false);
    }
  }

  // --- Generate ---

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    if (!analyzeResult || selectedTitle === null) return;
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: analyzeResult.url,
          business_type: analyzeResult.business_type,
          summary: analyzeResult.summary,
          selected_title: analyzeResult.post_titles[selectedTitle],
          goal,
          promote,
          style,
          avoid,
          note,
          hashtags,
          brand_colors: analyzeResult.brand_colors,
        }),
      });
      if (!res.ok) throw new Error(parseApiError(res.status, "Nie udało się wygenerować treści."));
      const data: GenerateResult = await res.json();
      setGenerateResult(data);
      if (briefOrigin === "plan" && currentBlogEntryKey) {
        // Generacja z harmonogramu — zapisz per entry i wróć do planu
        setGeneratedBlogs((prev) => ({ ...prev, [currentBlogEntryKey]: data.blog_post }));
        setCurrentBlogEntryKey(null);
        setStep("plan");
      } else {
        // Single-gen flow z teasera — bez zmian
        setStep("results");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Wystąpił nieoczekiwany błąd.");
    } finally {
      setLoading(false);
    }
  }

  // --- Plan ---

  async function handlePlan() {
    if (!analyzeResult) return;
    if (planScope !== "blog" && planPlatforms.length === 0) {
      setError("Wybierz przynajmniej jedną platformę social media.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: analyzeResult.url,
          business_type: analyzeResult.business_type,
          summary: analyzeResult.summary,
          weeks: planWeeks,
          posts_per_week: planPostsPerWeek,
          scope: planScope,
          platforms: planScope !== "blog" ? planPlatforms : [],
          goal: "sprzedaż",
          style: planStyle,
          promote: planPromote,
          avoid: planAvoid,
          note: planNote,
          brand_colors: analyzeResult.brand_colors,
        }),
      });
      if (!res.ok) throw new Error(parseApiError(res.status, "Nie udało się wygenerować planu treści."));
      const data: PlanResult = await res.json();
      setPlanResult(data);
      setStep("plan");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Wystąpił nieoczekiwany błąd.");
    } finally {
      setLoading(false);
    }
  }

  // --- Single post from planner ---

  async function handleGenerateSinglePost(entry: PlanEntry, entryKey: string) {
    if (!analyzeResult) return;
    setSinglePostErrors((prev) => { const n = { ...prev }; delete n[entryKey]; return n; });
    setPostLoadingKeys((prev) => new Set(prev).add(entryKey));

    // Slow loading indicator after 10s
    slowTimers.current[entryKey] = setTimeout(() => {
      setSlowLoadingKeys((prev) => new Set(prev).add(entryKey));
    }, 10000);

    try {
      const res = await fetch(`${API_URL}/api/generate/single-post`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform: entry.platform,
          title: entryTitles[entryKey] || entry.title,
          description: entryDescriptions[entryKey] || entry.description,
          business_type: analyzeResult.business_type,
          summary: analyzeResult.summary,
          goal: "sprzedaż",
          style: planStyle,
          promote: planPromote,
          avoid: planAvoid,
          hashtags: entryHashtags[entryKey] || "",
          brand_colors: analyzeResult.brand_colors,
          ...(entryProductData[entryKey] ? { product_context: entryProductData[entryKey] } : {}),
        }),
      });
      if (!res.ok) {
        throw new Error(parseApiError(res.status, "Nie udało się wygenerować posta."));
      }
      const data = await res.json();
      setGeneratedPosts((prev) => ({ ...prev, [entryKey]: { platform: data.platform, content: data.content } }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Wystąpił nieoczekiwany błąd.";
      setSinglePostErrors((prev) => ({ ...prev, [entryKey]: msg }));
    } finally {
      clearTimeout(slowTimers.current[entryKey]);
      delete slowTimers.current[entryKey];
      setPostLoadingKeys((prev) => {
        const next = new Set(prev);
        next.delete(entryKey);
        return next;
      });
      setSlowLoadingKeys((prev) => {
        const next = new Set(prev);
        next.delete(entryKey);
        return next;
      });
    }
  }

  // --- Batch generate + final CSV ---

  function getPlanEntryByKey(key: string): PlanEntry | null {
    if (!planResult) return null;
    const [weekStr, idxStr] = key.split("-");
    const weekNum = Number(weekStr);
    const idx = Number(idxStr);
    const weekEntries = planResult.entries.filter((e) => e.week === weekNum);
    return weekEntries[idx] || null;
  }

  async function handleBatchFinalCSV() {
    if (!analyzeResult || !planResult || selectedEntries.size === 0) return;

    // Find which selected entries need generation
    const toGenerate = Array.from(selectedEntries).filter((key) => !generatedPosts[key]);
    const failed: string[] = [];

    if (toGenerate.length > 0) {
      setBatchProgress({ current: 0, total: toGenerate.length, failed: [] });

      for (let i = 0; i < toGenerate.length; i++) {
        const key = toGenerate[i];
        const entry = getPlanEntryByKey(key);
        if (!entry) { failed.push(key); continue; }

        setBatchProgress({ current: i + 1, total: toGenerate.length, failed });

        try {
          const res = await fetch(`${API_URL}/api/generate/single-post`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              platform: entry.platform,
              title: entryTitles[key] || entry.title,
              description: entryDescriptions[key] || entry.description,
              business_type: analyzeResult.business_type,
              summary: analyzeResult.summary,
              goal: "sprzedaż",
              style: planStyle,
              promote: planPromote,
              avoid: planAvoid,
              hashtags: entryHashtags[key] || "",
              brand_colors: analyzeResult.brand_colors,
              ...(entryProductData[key] ? { product_context: entryProductData[key] } : {}),
            }),
          });
          if (!res.ok) throw new Error();
          const data = await res.json();
          setGeneratedPosts((prev) => ({ ...prev, [key]: { platform: data.platform, content: data.content } }));
        } catch {
          failed.push(key);
        }
      }
    }

    // Build final CSV from all selected entries that have generated content
    const BOM = "\uFEFF";
    const header = "Tydzień;Dzień;Platforma;Tytuł;Treść posta";
    const rows: string[] = [];

    // Build key mapping same as rendering
    const weekCounters: Record<number, number> = {};
    for (const e of planResult.entries) {
      const w = e.week;
      if (!(w in weekCounters)) weekCounters[w] = 0;
      const key = `${w}-${weekCounters[w]}`;
      weekCounters[w]++;

      if (!selectedEntries.has(key)) continue;
      const gen = generatedPosts[key];
      if (!gen && !failed.includes(key)) continue; // shouldn't happen but safety

      const slot = entrySlots[key] || e.slot;
      const title = entryTitles[key] ?? e.title;
      const content = gen ? gen.content : "(generacja nie powiodła się)";

      rows.push([e.week, slot, e.platform, `"${title.replace(/"/g, '""')}"`, `"${content.replace(/"/g, '""')}"`].join(";"));
    }

    if (rows.length > 0) {
      const csv = BOM + [header, ...rows].join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const date = new Date().toISOString().slice(0, 10);
      const a = document.createElement("a");
      a.href = url;
      a.download = `sociale-final-posts-${date}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    }

    setBatchProgress(failed.length > 0 ? { current: toGenerate.length, total: toGenerate.length, failed } : null);
  }

  const businessTypeLabel =
    analyzeResult?.business_type === "ecommerce" ? "sklep internetowy" : "firma usługowa";

  return (
    <div className="flex flex-col flex-1 items-center px-4 font-sans">
      {/* ===================== LANDING ===================== */}
      {step === "landing" && (
        <>
          <div className="w-full max-w-2xl text-center mt-32 mb-12">
            <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-foreground mb-4">
              Sociale
            </h1>
            <p className="text-lg text-muted max-w-md mx-auto">
              Wklej adres swojej strony — wygenerujemy treści marketingowe
              dopasowane do Twojego biznesu.
            </p>
          </div>

          <form
            onSubmit={handleAnalyze}
            className="w-full max-w-xl flex flex-col sm:flex-row gap-3"
          >
            <input
              type="url"
              required
              placeholder="https://twoja-strona.pl"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="flex-1 h-12 px-4 rounded-lg border border-border bg-card text-foreground placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent transition"
            />
            <button
              type="submit"
              disabled={loading}
              className="h-12 px-8 rounded-lg bg-accent text-white font-medium hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition cursor-pointer"
            >
              {loading ? "Analizuję…" : "Analizuj"}
            </button>
          </form>
        </>
      )}

      {/* ===================== TEASER ===================== */}
      {step === "teaser" && analyzeResult && (
        <div className="w-full max-w-2xl mt-16 mb-16">
          <button
            onClick={() => {
              if (window.confirm("Zresetować sesję? Cały plan, refinementy i wygenerowane posty zostaną usunięte.")) {
                resetAll();
              }
            }}
            className="mb-8 text-sm text-muted hover:text-foreground transition cursor-pointer"
          >
            &larr; Nowa analiza
          </button>

          {/* Co wykryliśmy */}
          <div className="mb-10 p-5 rounded-lg border border-border bg-card">
            <div className="flex items-center gap-2 mb-2">
              <span className="inline-block px-3 py-1 rounded-full bg-accent/10 text-accent text-xs font-medium">
                {analyzeResult.business_type}
              </span>
              <span className="text-xs text-muted">
                {analyzeResult.url}
              </span>
            </div>
            <h2 className="text-lg font-semibold text-foreground mb-1">
              Co wykryliśmy
            </h2>
            <p className="text-sm text-muted leading-relaxed">
              Twoja strona wygląda na <strong>{businessTypeLabel}</strong>.{" "}
              {analyzeResult.summary}
            </p>
          </div>

          {/* ===== Ścieżka 1: Szybka generacja ===== */}
          <div className="mb-10">
            <h3 className="text-lg font-semibold text-foreground mb-1">
              Szybka generacja treści
            </h3>
            <p className="text-sm text-muted mb-4">
              Wybierz temat i przejdź do briefu — wygenerujemy komplet treści.
            </p>
            <div className="space-y-3">
              {analyzeResult.post_titles.map((title, i) => (
                <div
                  key={i}
                  onClick={() => setSelectedTitle(i)}
                  className={`flex items-center gap-4 p-4 rounded-lg border bg-card transition cursor-pointer ${
                    selectedTitle === i
                      ? "border-accent bg-accent/5"
                      : "border-border hover:border-accent/40"
                  }`}
                >
                  <span
                    className={`flex-shrink-0 w-8 h-8 rounded-full text-sm font-medium flex items-center justify-center ${
                      selectedTitle === i
                        ? "bg-accent text-white"
                        : "bg-accent/10 text-accent"
                    }`}
                  >
                    {i + 1}
                  </span>
                  <span className="text-foreground">{title}</span>
                </div>
              ))}
            </div>
            {selectedTitle !== null && (
              <button
                onClick={() => { setBriefOrigin("teaser"); setStep("brief"); }}
                className="mt-4 w-full h-12 rounded-lg bg-accent text-white font-medium hover:bg-accent-hover transition cursor-pointer"
              >
                Przejdź dalej
              </button>
            )}
          </div>

          {/* ===== Ścieżka 2: Planner ===== */}
          <div className="p-5 rounded-lg border border-border bg-card">
            <h3 className="text-lg font-semibold text-foreground mb-1">
              Zaplanuj harmonogram treści
            </h3>
            <p className="text-sm text-muted mb-4">
              Stwórz kalendarz publikacji na kilka tygodni.
            </p>

            {/* Scope */}
            <div className="mb-4">
              <label className="block text-xs text-muted mb-1">Co planujesz?</label>
              <select
                value={planScope}
                onChange={(e) => setPlanScope(e.target.value as "blog" | "social" | "both")}
                className="w-full h-10 px-3 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent transition"
              >
                <option value="blog">Tylko blog</option>
                <option value="social">Tylko social media</option>
                <option value="both">Blog + social media</option>
              </select>
            </div>

            {/* Platforms */}
            {planScope !== "blog" && (
              <div className="mb-4">
                <label className="block text-xs text-muted mb-1">Platformy social</label>
                <div className="flex gap-3">
                  {["LinkedIn", "Facebook", "Instagram"].map((p) => (
                    <label key={p} className="flex items-center gap-1.5 text-sm text-foreground cursor-pointer">
                      <input
                        type="checkbox"
                        checked={planPlatforms.includes(p)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setPlanPlatforms([...planPlatforms, p]);
                          } else {
                            setPlanPlatforms(planPlatforms.filter((x) => x !== p));
                          }
                        }}
                        className="accent-accent"
                      />
                      {p}
                    </label>
                  ))}
                </div>
                {planPlatforms.length === 0 && (
                  <p className="text-xs text-red-500 mt-1">Wybierz przynajmniej jedną platformę.</p>
                )}
              </div>
            )}

            <div className="flex gap-4 mb-4">
              <div className="flex-1">
                <label className="block text-xs text-muted mb-1">Tygodnie</label>
                <select
                  value={planWeeks}
                  onChange={(e) => setPlanWeeks(Number(e.target.value))}
                  className="w-full h-10 px-3 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent transition"
                >
                  <option value={1}>1 tydzień</option>
                  <option value={2}>2 tygodnie</option>
                  <option value={3}>3 tygodnie</option>
                  <option value={4}>4 tygodnie</option>
                </select>
              </div>
              <div className="flex-1">
                <label className="block text-xs text-muted mb-1">Treści / tydzień</label>
                <select
                  value={planPostsPerWeek}
                  onChange={(e) => setPlanPostsPerWeek(Number(e.target.value))}
                  className="w-full h-10 px-3 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent transition"
                >
                  <option value={2}>2</option>
                  <option value={3}>3</option>
                  <option value={4}>4</option>
                </select>
              </div>
            </div>

            {/* Brief strategiczny planera */}
            <div className="mb-4">
              <label className="block text-xs text-muted mb-1">Co chcesz promować?</label>
              <input
                type="text"
                value={planPromote}
                onChange={(e) => setPlanPromote(e.target.value)}
                placeholder="np. nowa kolekcja, usługa, event…"
                className="w-full h-10 px-3 rounded-lg border border-border bg-background text-foreground text-sm placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent transition"
              />
            </div>
            <div className="mb-4">
              <label className="block text-xs text-muted mb-1">Styl komunikacji</label>
              <select
                value={planStyle}
                onChange={(e) => setPlanStyle(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent transition"
              >
                <option value="prosty">Prosty i przystępny</option>
                <option value="ekspercki">Ekspercki</option>
                <option value="nowoczesny">Nowoczesny i odważny</option>
              </select>
            </div>
            <div className="mb-4">
              <label className="block text-xs text-muted mb-1">
                Czego unikać? <span className="text-muted/60">(opcjonalnie)</span>
              </label>
              <input
                type="text"
                value={planAvoid}
                onChange={(e) => setPlanAvoid(e.target.value)}
                placeholder="np. żargon techniczny, agresywna sprzedaż…"
                className="w-full h-10 px-3 rounded-lg border border-border bg-background text-foreground text-sm placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent transition"
              />
            </div>
            <div className="mb-4">
              <label className="block text-xs text-muted mb-1">
                Dodatkowa notatka <span className="text-muted/60">(opcjonalnie)</span>
              </label>
              <textarea
                value={planNote}
                onChange={(e) => setPlanNote(e.target.value)}
                rows={2}
                placeholder="Kontekst, grupa docelowa, ton…"
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent transition resize-none"
              />
            </div>

            <button
              onClick={handlePlan}
              disabled={loading || (planScope !== "blog" && planPlatforms.length === 0)}
              className="w-full h-11 rounded-lg border-2 border-accent text-accent font-medium hover:bg-accent/5 disabled:opacity-50 disabled:cursor-not-allowed transition cursor-pointer"
            >
              {loading ? "Generuję plan…" : "Zaplanuj treści"}
            </button>
          </div>
        </div>
      )}

      {/* ===================== BRIEF ===================== */}
      {step === "brief" && analyzeResult && selectedTitle !== null && (
        <div className="w-full max-w-2xl mt-16 mb-16">
          <button
            onClick={() => setStep(briefOrigin)}
            className="mb-8 text-sm text-muted hover:text-foreground transition cursor-pointer"
          >
            &larr; {briefOrigin === "plan" ? "Wróć do harmonogramu" : "Wróć do tematów"}
          </button>

          {/* Wybrany temat */}
          <div className="mb-8 p-4 rounded-lg border border-accent/30 bg-accent/5">
            <p className="text-xs text-muted mb-1">Wybrany temat</p>
            <p className="text-foreground font-medium">
              {analyzeResult.post_titles[selectedTitle]}
            </p>
          </div>

          <h2 className="text-2xl font-semibold text-foreground mb-2">
            Brief treści
          </h2>
          <p className="text-sm text-muted mb-6">
            Uzupełnij kilka informacji, żebyśmy lepiej dopasowali treści do
            Twoich potrzeb.
          </p>

          <form onSubmit={handleGenerate} className="space-y-5">
            {/* Cel */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                Cel treści
              </label>
              <select
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                className="w-full h-11 px-3 rounded-lg border border-border bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent transition"
              >
                <option value="sprzedaż">Sprzedaż</option>
                <option value="edukacja">Edukacja</option>
                <option value="wizerunek">Wizerunek</option>
              </select>
            </div>

            {/* Co promować */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                Co chcesz teraz promować?
              </label>
              <input
                type="text"
                value={promote}
                onChange={(e) => setPromote(e.target.value)}
                placeholder="np. nowa kolekcja, usługa konsultingu, event…"
                className="w-full h-11 px-3 rounded-lg border border-border bg-card text-foreground placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent transition"
              />
            </div>

            {/* Styl */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                Styl komunikacji
              </label>
              <select
                value={style}
                onChange={(e) => setStyle(e.target.value)}
                className="w-full h-11 px-3 rounded-lg border border-border bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent transition"
              >
                <option value="prosty">Prosty i przystępny</option>
                <option value="ekspercki">Ekspercki</option>
                <option value="nowoczesny">Nowoczesny i odważny</option>
              </select>
            </div>

            {/* Czego unikać */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                Czego unikać?
              </label>
              <input
                type="text"
                value={avoid}
                onChange={(e) => setAvoid(e.target.value)}
                placeholder="np. żargon techniczny, humor, agresywna sprzedaż…"
                className="w-full h-11 px-3 rounded-lg border border-border bg-card text-foreground placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent transition"
              />
            </div>

            {/* Notatka */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                Dodatkowa notatka{" "}
                <span className="text-muted font-normal">(opcjonalnie)</span>
              </label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                placeholder="Cokolwiek, co może pomóc — kontekst, grupa docelowa, ton…"
                className="w-full px-3 py-2 rounded-lg border border-border bg-card text-foreground placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent transition resize-none"
              />
            </div>

            {/* Hashtagi */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                Dodatkowe hashtagi{" "}
                <span className="text-muted font-normal">(opcjonalnie)</span>
              </label>
              <input
                type="text"
                value={hashtags}
                onChange={(e) => setHashtags(e.target.value)}
                placeholder="#marketing #ecommerce #mojabrand"
                className="w-full h-11 px-3 rounded-lg border border-border bg-card text-foreground placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent transition"
              />
              <p className="text-xs text-muted mt-1">
                Generator doda własne hashtagi dopasowane do platformy i branży.
              </p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full h-12 rounded-lg bg-accent text-white font-medium hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition cursor-pointer"
            >
              {loading ? "Generuję treści…" : "Generuj treści"}
            </button>
          </form>
        </div>
      )}

      {/* ===================== PLAN ===================== */}
      {step === "plan" && planResult && analyzeResult && (
        <div className="w-full max-w-3xl mt-16 mb-16">
          <button
            onClick={() => setStep("teaser")}
            className="mb-8 text-sm text-muted hover:text-foreground transition cursor-pointer"
          >
            &larr; Wróć do tematów
          </button>

          <h2 className="text-2xl font-semibold text-foreground mb-2">
            Harmonogram treści
          </h2>
          <p className="text-sm text-muted mb-4">
            {planResult.summary}
          </p>

          {/* Brand & Logo panel */}
          <div className="mb-6 p-4 rounded-lg border border-border bg-card">
            <p className="text-xs font-medium text-muted mb-3 uppercase tracking-wide">Grafika — kolory i logo</p>
            <div className="flex flex-wrap items-end gap-4">
              <label className="flex flex-col gap-1">
                <span className="text-xs text-muted">Tło</span>
                <input
                  type="color"
                  value={brandOverrides.bg}
                  onChange={(e) => setBrandOverrides((p) => ({ ...p, bg: e.target.value }))}
                  className="w-9 h-9 rounded border border-border cursor-pointer bg-transparent"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-muted">Akcent</span>
                <input
                  type="color"
                  value={brandOverrides.accent}
                  onChange={(e) => setBrandOverrides((p) => ({ ...p, accent: e.target.value }))}
                  className="w-9 h-9 rounded border border-border cursor-pointer bg-transparent"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-muted">Tekst</span>
                <input
                  type="color"
                  value={brandOverrides.text}
                  onChange={(e) => setBrandOverrides((p) => ({ ...p, text: e.target.value }))}
                  className="w-9 h-9 rounded border border-border cursor-pointer bg-transparent"
                />
              </label>
              <div className="flex flex-col gap-1">
                <span className="text-xs text-muted">Logo</span>
                {logoDataUrl ? (
                  <div className="flex items-center gap-2">
                    <img src={logoDataUrl} alt="Logo" className="h-9 w-9 object-contain rounded border border-border bg-white" />
                    <button
                      type="button"
                      onClick={() => setLogoDataUrl("")}
                      className="text-xs text-muted hover:text-foreground transition cursor-pointer"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <label className="h-9 px-3 flex items-center rounded border border-dashed border-border text-xs text-muted hover:border-accent/40 hover:text-foreground transition cursor-pointer">
                    Dodaj logo
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        if (file.size > 512_000) {
                          const canvas = document.createElement("canvas");
                          const img = new Image();
                          img.onload = () => {
                            const scale = Math.min(1, 200 / Math.max(img.width, img.height));
                            canvas.width = img.width * scale;
                            canvas.height = img.height * scale;
                            canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
                            setLogoDataUrl(canvas.toDataURL("image/png"));
                          };
                          img.src = URL.createObjectURL(file);
                        } else {
                          const reader = new FileReader();
                          reader.onload = () => setLogoDataUrl(reader.result as string);
                          reader.readAsDataURL(file);
                        }
                        e.target.value = "";
                      }}
                    />
                  </label>
                )}
              </div>
              {analyzeResult.brand_colors.length > 0 && (
                <div className="flex flex-col gap-1 ml-auto">
                  <span className="text-xs text-muted">Z analizy URL</span>
                  <div className="flex gap-1">
                    {analyzeResult.brand_colors.map((c, i) => (
                      <div
                        key={i}
                        className="w-5 h-5 rounded-full border border-border cursor-pointer hover:scale-110 transition-transform"
                        style={{ backgroundColor: c }}
                        title={c}
                        onClick={() => {
                          if (i === 0) setBrandOverrides((p) => ({ ...p, accent: c }));
                          else if (i === 1) setBrandOverrides((p) => ({ ...p, text: c }));
                        }}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Client profile questions — feed into AI prompt builder */}
            <div className="mt-4 pt-3 border-t border-border">
              <p className="text-xs font-medium text-muted mb-2 uppercase tracking-wide">Styl grafik AI</p>
              <div className="space-y-2">
                <div>
                  <span className="text-xs text-muted">Feeling grafik</span>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {([
                      ["professional", "Profesjonalny"],
                      ["warm", "Ciepły i przystępny"],
                      ["bold", "Nowoczesny"],
                      ["premium", "Luksusowy"],
                    ] as const).map(([val, label]) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setClientFeeling(clientFeeling === val ? "" : val)}
                        className={`px-2.5 py-1 rounded-full border text-xs transition-colors cursor-pointer ${
                          clientFeeling === val
                            ? "bg-accent border-accent text-white"
                            : "border-border bg-background text-foreground hover:bg-accent/10 hover:border-accent/40"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <span className="text-xs text-muted">Bohater grafiki</span>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {([
                      ["product", "Produkt"],
                      ["service", "Usługa"],
                      ["concept", "Idea / koncepcja"],
                      ["food", "Jedzenie"],
                    ] as const).map(([val, label]) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setClientSubject(clientSubject === val ? "" : val)}
                        className={`px-2.5 py-1 rounded-full border text-xs transition-colors cursor-pointer ${
                          clientSubject === val
                            ? "bg-accent border-accent text-white"
                            : "border-border bg-background text-foreground hover:bg-accent/10 hover:border-accent/40"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <span className="text-xs text-muted">Tekst na grafice</span>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {([
                      ["none", "Tylko logo"],
                      ["short", "Krótki nagłówek"],
                      ["full", "Nagłówek + CTA"],
                    ] as const).map(([val, label]) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setClientTextDensity(clientTextDensity === val ? "" : val)}
                        className={`px-2.5 py-1 rounded-full border text-xs transition-colors cursor-pointer ${
                          clientTextDensity === val
                            ? "bg-accent border-accent text-white"
                            : "border-border bg-background text-foreground hover:bg-accent/10 hover:border-accent/40"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <span className="text-xs text-muted">Model AI do grafik</span>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {IMAGE_MODELS.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setImageModel(m.id)}
                        title={`${m.id} — ${m.hint}`}
                        className={`px-2.5 py-1 rounded-full border text-xs transition-colors cursor-pointer ${
                          imageModel === m.id
                            ? "bg-accent border-accent text-white"
                            : "border-border bg-background text-foreground hover:bg-accent/10 hover:border-accent/40"
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                  <p className="text-[10px] text-muted mt-1">
                    {IMAGE_MODELS.find((m) => m.id === imageModel)?.hint} ({imageModel})
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Batch select controls */}
          {(() => {
            const allSocialKeys: string[] = [];
            const wc: Record<number, number> = {};
            for (const e of planResult.entries) {
              const w = e.week;
              if (!(w in wc)) wc[w] = 0;
              const key = `${w}-${wc[w]}`;
              wc[w]++;
              if (!e.content_type.toLowerCase().includes("blog")) allSocialKeys.push(key);
            }
            const allSelected = allSocialKeys.length > 0 && allSocialKeys.every((k) => selectedEntries.has(k));
            return allSocialKeys.length > 0 ? (
              <div className="flex items-center justify-between mb-6 p-3 rounded-lg border border-border bg-card">
                <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={() => {
                      if (allSelected) {
                        setSelectedEntries(new Set());
                      } else {
                        setSelectedEntries(new Set(allSocialKeys));
                      }
                    }}
                    className="accent-accent"
                  />
                  {allSelected ? "Odznacz wszystkie social" : "Zaznacz wszystkie social"}
                  <span className="text-xs text-muted">({selectedEntries.size}/{allSocialKeys.length})</span>
                </label>
                <button
                  onClick={handleBatchFinalCSV}
                  disabled={selectedEntries.size === 0 || batchProgress !== null}
                  className="h-9 px-4 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition cursor-pointer"
                >
                  {batchProgress
                    ? `Generuję ${batchProgress.current}/${batchProgress.total}…`
                    : `Przygotuj finalny CSV (${selectedEntries.size})`
                  }
                </button>
              </div>
            ) : null;
          })()}

          {batchProgress && batchProgress.failed.length > 0 && (
            <div className="mb-4 p-3 rounded-lg border border-red-300 bg-red-50 text-red-800 text-xs flex items-center gap-3">
              <span>Nie udało się wygenerować {batchProgress.failed.length} wpisów.</span>
              <button
                onClick={() => {
                  setBatchProgress(null);
                  handleBatchFinalCSV();
                }}
                className="underline font-medium cursor-pointer"
              >
                Ponów nieudane
              </button>
              <button
                onClick={() => setBatchProgress(null)}
                className="underline cursor-pointer"
              >
                Zamknij
              </button>
            </div>
          )}

          {Array.from({ length: planWeeks }, (_, w) => w + 1).map((weekNum) => {
            const weekEntries = planResult.entries.filter((e) => e.week === weekNum);
            if (weekEntries.length === 0) return null;
            return (
              <div key={weekNum} className="mb-8">
                <h3 className="text-lg font-semibold text-foreground mb-3">
                  Tydzień {weekNum}
                </h3>
                <div className="space-y-3">
                  {weekEntries.map((entry, i) => {
                    const isBlog = entry.content_type.toLowerCase().includes("blog");
                    const entryKey = `${weekNum}-${i}`;
                    const isGenerating = postLoadingKeys.has(entryKey);
                    const generated = generatedPosts[entryKey];
                    return (
                      <div key={i}>
                        <div
                          onClick={() => {
                            if (isGenerating) return;
                            if (isBlog) {
                              if (!generatedBlogs[entryKey]) {
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
                            } else if (!generated) {
                              handleGenerateSinglePost(entry, entryKey);
                            }
                          }}
                          className={`p-4 rounded-lg border bg-card transition ${
                            isBlog
                              ? "border-accent/30 hover:border-accent cursor-pointer"
                              : generated
                                ? "border-accent/20"
                                : "border-border hover:border-accent/40 cursor-pointer"
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-1.5">
                            {!isBlog && (
                              <input
                                type="checkbox"
                                checked={selectedEntries.has(entryKey)}
                                onChange={(ev) => {
                                  ev.stopPropagation();
                                  setSelectedEntries((prev) => {
                                    const next = new Set(prev);
                                    if (next.has(entryKey)) next.delete(entryKey);
                                    else next.add(entryKey);
                                    return next;
                                  });
                                }}
                                onClick={(ev) => ev.stopPropagation()}
                                className="accent-accent flex-shrink-0"
                              />
                            )}
                            <select
                              value={entrySlots[entryKey] || entry.slot}
                              onChange={(ev) => {
                                ev.stopPropagation();
                                setEntrySlots((prev) => ({ ...prev, [entryKey]: ev.target.value }));
                              }}
                              onClick={(ev) => ev.stopPropagation()}
                              className="text-xs text-muted font-medium bg-transparent border-none focus:outline-none focus:ring-1 focus:ring-accent/40 rounded cursor-pointer pr-4"
                            >
                              {["Poniedziałek", "Wtorek", "Środa", "Czwartek", "Piątek", "Sobota", "Niedziela"].map((d) => (
                                <option key={d} value={d}>{d}</option>
                              ))}
                            </select>
                            <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-accent/10 text-accent">
                              {entry.platform}
                            </span>
                            <span className="text-xs text-muted">
                              {entry.content_type}
                            </span>
                          </div>
                          <input
                            type="text"
                            value={entryTitles[entryKey] ?? entry.title}
                            onChange={(ev) => {
                              ev.stopPropagation();
                              setEntryTitles((prev) => ({ ...prev, [entryKey]: ev.target.value }));
                            }}
                            onClick={(ev) => ev.stopPropagation()}
                            className="w-full text-foreground font-medium text-sm bg-transparent border-none focus:outline-none focus:ring-1 focus:ring-accent/40 rounded px-0 py-0.5"
                          />
                          <textarea
                            value={entryDescriptions[entryKey] ?? entry.description}
                            onChange={(ev) => {
                              ev.stopPropagation();
                              setEntryDescriptions((prev) => ({ ...prev, [entryKey]: ev.target.value }));
                            }}
                            onClick={(ev) => ev.stopPropagation()}
                            rows={2}
                            className="w-full text-muted text-xs mt-1 leading-relaxed bg-transparent border-none focus:outline-none focus:ring-1 focus:ring-accent/40 rounded px-0 py-0.5 resize-none"
                          />
                          {isBlog && !generatedBlogs[entryKey] && (
                            <p className="text-accent text-xs mt-2 font-medium">
                              Kliknij, aby wygenerować wpis blogowy &rarr;
                            </p>
                          )}
                          {isBlog && generatedBlogs[entryKey] && (
                            <p className="text-green-600 text-xs mt-2 font-medium">
                              ✓ Wpis wygenerowany
                            </p>
                          )}
                          {!isBlog && (
                            <div className="mt-2 space-y-2">
                              {/* --- 1. Product URL --- */}
                              <div onClick={(ev) => ev.stopPropagation()}>
                                {!entryProductData[entryKey] && !entryProductUrl[entryKey] && (
                                  <button
                                    type="button"
                                    onClick={() => setEntryProductUrl((prev) => ({ ...prev, [entryKey]: "" }))}
                                    className="text-xs text-muted hover:text-foreground transition cursor-pointer"
                                  >
                                    + Dodaj URL produktu
                                  </button>
                                )}
                                {entryProductUrl[entryKey] !== undefined && !entryProductData[entryKey] && (
                                  <div className="flex gap-1.5 mt-1">
                                    <input
                                      type="text"
                                      value={entryProductUrl[entryKey]}
                                      onChange={(ev) => setEntryProductUrl((prev) => ({ ...prev, [entryKey]: ev.target.value }))}
                                      placeholder="https://... URL produktu lub usługi"
                                      className="flex-1 h-8 px-2 rounded border border-border bg-background text-foreground text-xs placeholder:text-muted/60 focus:outline-none focus:ring-1 focus:ring-accent/40 transition"
                                    />
                                    <button
                                      type="button"
                                      disabled={!entryProductUrl[entryKey] || productLoadingKeys.has(entryKey)}
                                      onClick={async () => {
                                        const productUrl = entryProductUrl[entryKey];
                                        if (!productUrl) return;
                                        setProductLoadingKeys((prev) => new Set(prev).add(entryKey));
                                        try {
                                          const res = await fetch(`${API_URL}/api/scrape-product`, {
                                            method: "POST",
                                            headers: { "Content-Type": "application/json" },
                                            body: JSON.stringify({ url: productUrl }),
                                          });
                                          if (!res.ok) throw new Error();
                                          const data: ProductData = await res.json();
                                          const hasUsefulData = !!(data.title?.trim() || data.description?.trim());
                                          if (!hasUsefulData) {
                                            setSinglePostErrors((prev) => ({ ...prev, [entryKey]: "Nie udało się odczytać danych produktu z tego adresu. Strona może wymagać logowania lub blokuje automatyczne pobieranie." }));
                                          } else {
                                            setEntryProductData((prev) => ({ ...prev, [entryKey]: data }));
                                            if (data.images.length > 0) {
                                              setEntryProductImage((prev) => ({ ...prev, [entryKey]: data.images[0] }));
                                            }
                                          }
                                        } catch {
                                          setSinglePostErrors((prev) => ({ ...prev, [entryKey]: "Nie udało się pobrać danych produktu." }));
                                        } finally {
                                          setProductLoadingKeys((prev) => { const n = new Set(prev); n.delete(entryKey); return n; });
                                        }
                                      }}
                                      className="h-8 px-3 rounded-lg bg-accent text-white text-xs font-medium hover:bg-accent-hover disabled:opacity-50 transition cursor-pointer"
                                    >
                                      {productLoadingKeys.has(entryKey) ? "Analizuję…" : "Analizuj"}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEntryProductUrl((prev) => { const n = { ...prev }; delete n[entryKey]; return n; });
                                      }}
                                      className="h-8 px-2 text-xs text-muted hover:text-foreground transition cursor-pointer"
                                    >
                                      ✕
                                    </button>
                                  </div>
                                )}
                                {entryProductData[entryKey] && (
                                  <div className="mt-1 p-3 rounded-lg border border-accent/20 bg-accent/5">
                                    <div className="flex items-start justify-between gap-2 mb-1">
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-0.5">
                                          <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-accent/10 text-accent">
                                            {entryProductData[entryKey].source_type === "product" ? "Produkt" :
                                             entryProductData[entryKey].source_type === "service" ? "Usługa" :
                                             entryProductData[entryKey].source_type === "offer" ? "Oferta" : "Źródło"}
                                          </span>
                                          {entryProductData[entryKey].price && (
                                            <span className="text-xs font-semibold text-foreground">{entryProductData[entryKey].price}</span>
                                          )}
                                        </div>
                                        <p className="text-xs font-medium text-foreground truncate">{entryProductData[entryKey].title}</p>
                                        <p className="text-[11px] text-muted line-clamp-2">{entryProductData[entryKey].description}</p>
                                      </div>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setEntryProductData((prev) => { const n = { ...prev }; delete n[entryKey]; return n; });
                                          setEntryProductUrl((prev) => { const n = { ...prev }; delete n[entryKey]; return n; });
                                          setEntryProductImage((prev) => { const n = { ...prev }; delete n[entryKey]; return n; });
                                        }}
                                        className="text-xs text-muted hover:text-foreground transition cursor-pointer flex-shrink-0"
                                      >
                                        ✕
                                      </button>
                                    </div>
                                    {entryProductData[entryKey].images.filter(Boolean).length > 0 && (
                                      <div className="flex gap-1.5 mt-2">
                                        {entryProductData[entryKey].images.filter(Boolean).slice(0, 4).map((img, idx) => (
                                          <button
                                            key={idx}
                                            type="button"
                                            onClick={() => setEntryProductImage((prev) => ({ ...prev, [entryKey]: img }))}
                                            className={`w-12 h-12 rounded border overflow-hidden flex-shrink-0 cursor-pointer transition ${
                                              entryProductImage[entryKey] === img
                                                ? "border-accent ring-1 ring-accent"
                                                : "border-border hover:border-accent/40"
                                            }`}
                                          >
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img src={img} alt="" className="w-full h-full object-cover" />
                                          </button>
                                        ))}
                                      </div>
                                    )}
                                    {entryProductData[entryKey]?.title?.trim() && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const pd = entryProductData[entryKey];
                                          if (!pd?.title?.trim()) return;
                                          setEntryTitles((prev) => ({ ...prev, [entryKey]: pd.title.slice(0, 80) }));
                                          if (pd.description?.trim()) {
                                            setEntryDescriptions((prev) => ({ ...prev, [entryKey]: pd.description.slice(0, 200) }));
                                          }
                                          if (!entryVisualDirection[entryKey]) {
                                            const vd = [pd.title, pd.brand].filter(Boolean).join(", ");
                                            setEntryVisualDirection((prev) => ({ ...prev, [entryKey]: vd }));
                                          }
                                        }}
                                        className="mt-2 text-xs text-accent hover:text-accent-hover font-medium transition cursor-pointer"
                                      >
                                        Użyj jako temat posta →
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>

                              {/* --- 2. Source Image + Edit Actions --- */}
                              <div onClick={(ev) => ev.stopPropagation()}>
                                {entrySourceImage[entryKey] ? (
                                  <div className="p-2 rounded-lg border border-accent/20 bg-accent/5">
                                    <div className="flex items-start gap-3">
                                      {/* eslint-disable-next-line @next/next/no-img-element */}
                                      <img
                                        src={entrySourceImage[entryKey].url}
                                        alt="Source image"
                                        className="w-20 h-20 rounded border border-border object-cover flex-shrink-0"
                                      />
                                      <div className="flex-1 min-w-0">
                                        <p className="text-[10px] text-muted uppercase tracking-wide mb-1">Zdjęcie bazowe</p>
                                        <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-accent/10 text-accent">
                                          {entrySourceImage[entryKey].source === "product" ? "Zdjęcie produktu" : "Własne zdjęcie"}
                                        </span>
                                        {entrySourceImage[entryKey].name && (
                                          <p className="text-[11px] text-muted mt-0.5 truncate">{entrySourceImage[entryKey].name}</p>
                                        )}
                                        <div className="flex flex-wrap gap-2 mt-1.5">
                                          <label className="text-xs text-muted hover:text-foreground transition cursor-pointer">
                                            Zamień
                                            <input
                                              type="file"
                                              accept="image/jpeg,image/png,image/webp"
                                              className="hidden"
                                              onChange={(ev) => {
                                                const file = ev.target.files?.[0];
                                                if (!file) return;
                                                if (file.size > 10 * 1024 * 1024) { alert("Maksymalny rozmiar: 10 MB"); return; }
                                                const reader = new FileReader();
                                                reader.onload = () => {
                                                  const img = new Image();
                                                  img.onload = () => {
                                                    const MAX = 1600;
                                                    let w = img.width, h = img.height;
                                                    if (w > MAX || h > MAX) {
                                                      const scale = MAX / Math.max(w, h);
                                                      w = Math.round(w * scale);
                                                      h = Math.round(h * scale);
                                                    }
                                                    const canvas = document.createElement("canvas");
                                                    canvas.width = w; canvas.height = h;
                                                    canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
                                                    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
                                                    setEntrySourceImage((prev) => ({ ...prev, [entryKey]: { url: dataUrl, source: "upload", name: file.name } }));
                                                  };
                                                  img.src = reader.result as string;
                                                };
                                                reader.readAsDataURL(file);
                                                ev.target.value = "";
                                              }}
                                            />
                                          </label>
                                          <button
                                            type="button"
                                            onClick={() => setEntrySourceImage((prev) => { const n = { ...prev }; delete n[entryKey]; return n; })}
                                            className="text-xs text-muted hover:text-red-500 transition cursor-pointer"
                                          >
                                            Usuń
                                          </button>
                                        </div>
                                        {/* Edit actions */}
                                        <div className="flex flex-wrap gap-1.5 mt-2">
                                          <button
                                            type="button"
                                            disabled={!!editActionLoading[entryKey]}
                                            onClick={() => handleEditAction(entryKey, "fix_colors")}
                                            className="h-7 px-2.5 rounded-lg border border-border text-foreground text-xs font-medium hover:bg-accent/10 hover:border-accent/40 disabled:opacity-50 transition cursor-pointer"
                                          >
                                            {editActionLoading[entryKey] === "fix_colors" ? "Poprawiam…" : "Popraw kolory"}
                                          </button>
                                          <button
                                            type="button"
                                            disabled={!!editActionLoading[entryKey]}
                                            onClick={() => handleEditAction(entryKey, "clean_background")}
                                            className="h-7 px-2.5 rounded-lg border border-border text-foreground text-xs font-medium hover:bg-accent/10 hover:border-accent/40 disabled:opacity-50 transition cursor-pointer"
                                          >
                                            {editActionLoading[entryKey] === "clean_background" ? "Czyszczę tło…" : "Oczyść tło"}
                                          </button>
                                          <button
                                            type="button"
                                            disabled={!!editActionLoading[entryKey]}
                                            onClick={() => handleEditAction(entryKey, "ad_layout")}
                                            className="h-7 px-2.5 rounded-lg border border-accent/30 text-accent text-xs font-medium hover:bg-accent/10 hover:border-accent disabled:opacity-50 transition cursor-pointer"
                                          >
                                            {editActionLoading[entryKey] === "ad_layout" ? "Przygotowuję…" : `Wersja reklamowa (${({top: "góra", bottom: "dół", left: "lewo"} as Record<string, string>)[entryOverlayPosition[entryKey] || "top"] || "góra"})`}
                                          </button>
                                        </div>
                                        {editActionLoading[entryKey] && (
                                          <p className="text-accent text-[11px] mt-1 animate-pulse">Edycja AI może potrwać do 30s…</p>
                                        )}
                                        {editActionErrors[entryKey] && !editActionLoading[entryKey] && (
                                          <p className="text-red-600 text-[11px] mt-1">{editActionErrors[entryKey]}</p>
                                        )}
                                        <p className="text-[10px] text-muted mt-1">Wynik edycji zastąpi zdjęcie bazowe. Podgląd i pobieranie po zakończeniu.</p>
                                      </div>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-[10px] text-muted uppercase tracking-wide">Zdjęcie bazowe:</span>
                                    {entryProductImage[entryKey] && (
                                      <button
                                        type="button"
                                        onClick={() => setEntrySourceImage((prev) => ({ ...prev, [entryKey]: { url: entryProductImage[entryKey], source: "product" } }))}
                                        className="h-7 px-2.5 rounded-lg border border-accent/30 text-accent text-xs font-medium hover:bg-accent/10 transition cursor-pointer"
                                      >
                                        Użyj zdjęcia produktu
                                      </button>
                                    )}
                                    <label className="h-7 px-2.5 rounded-lg border border-border text-foreground text-xs font-medium hover:bg-accent/10 hover:border-accent/40 transition cursor-pointer inline-flex items-center">
                                      Wgraj własne zdjęcie
                                      <input
                                        type="file"
                                        accept="image/jpeg,image/png,image/webp"
                                        className="hidden"
                                        onChange={(ev) => {
                                          const file = ev.target.files?.[0];
                                          if (!file) return;
                                          if (file.size > 10 * 1024 * 1024) { alert("Maksymalny rozmiar: 10 MB"); return; }
                                          const reader = new FileReader();
                                          reader.onload = () => {
                                            const img = new Image();
                                            img.onload = () => {
                                              const MAX = 1600;
                                              let w = img.width, h = img.height;
                                              if (w > MAX || h > MAX) {
                                                const scale = MAX / Math.max(w, h);
                                                w = Math.round(w * scale);
                                                h = Math.round(h * scale);
                                              }
                                              const canvas = document.createElement("canvas");
                                              canvas.width = w; canvas.height = h;
                                              canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
                                              const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
                                              setEntrySourceImage((prev) => ({ ...prev, [entryKey]: { url: dataUrl, source: "upload", name: file.name } }));
                                            };
                                            img.src = reader.result as string;
                                          };
                                          reader.readAsDataURL(file);
                                          ev.target.value = "";
                                        }}
                                      />
                                    </label>
                                  </div>
                                )}
                              </div>

                              {/* --- 3. Hashtags --- */}
                              <input
                                type="text"
                                value={entryHashtags[entryKey] || ""}
                                onChange={(ev) => {
                                  ev.stopPropagation();
                                  setEntryHashtags((prev) => ({ ...prev, [entryKey]: ev.target.value }));
                                }}
                                onClick={(ev) => ev.stopPropagation()}
                                placeholder="#hashtag1 #hashtag2"
                                className="w-full h-8 px-2 rounded border border-border bg-background text-foreground text-xs placeholder:text-muted/60 focus:outline-none focus:ring-1 focus:ring-accent/40 transition"
                              />

                              {/* --- 4. Graphic Mode --- */}
                              <div
                                className="flex flex-wrap gap-1.5"
                                onClick={(ev) => ev.stopPropagation()}
                              >
                                {(["Brak grafiki", "Nowa grafika", "Zdjęcie z tekstem", "Na podstawie zdjęcia", "Karuzela"] as const).map((mode) => {
                                  const isActive = (entryGraphicMode[entryKey] || "") === mode;
                                  const isSoon = mode === "Karuzela";
                                  const needsImage = mode === "Zdjęcie z tekstem" || mode === "Na podstawie zdjęcia";
                                  const hasImage = !!entrySourceImage[entryKey];
                                  const isDisabled = needsImage && !hasImage;
                                  return (
                                    <button
                                      key={mode}
                                      type="button"
                                      disabled={isDisabled}
                                      onClick={(ev) => {
                                        ev.stopPropagation();
                                        if (isDisabled) return;
                                        setEntryGraphicMode((prev) => ({
                                          ...prev,
                                          [entryKey]: isActive ? "" : mode,
                                        }));
                                      }}
                                      title={isDisabled ? "Najpierw dodaj zdjęcie bazowe powyżej" : undefined}
                                      className={`px-2 py-0.5 rounded-full border text-xs transition-colors ${
                                        isActive
                                          ? "bg-accent border-accent text-white cursor-pointer"
                                          : isDisabled
                                            ? "border-border bg-background text-muted/40 cursor-not-allowed"
                                            : isSoon
                                              ? "border-border bg-background text-muted hover:bg-accent/10 hover:border-accent/40 cursor-pointer"
                                              : "border-border bg-background text-foreground hover:bg-accent/10 hover:border-accent/40 cursor-pointer"
                                      }`}
                                    >
                                      {mode}{isSoon && <span className="opacity-60"> (wkrótce)</span>}
                                      {isDisabled && <span className="opacity-60"> (dodaj zdjęcie)</span>}
                                    </button>
                                  );
                                })}
                              </div>

                              {/* --- 5. Visual direction + color overrides --- */}
                              {entryGraphicMode[entryKey] && entryGraphicMode[entryKey] !== "Brak grafiki" && (
                                <>
                                  <input
                                    type="text"
                                    value={entryVisualDirection[entryKey] || ""}
                                    onChange={(ev) => {
                                      ev.stopPropagation();
                                      setEntryVisualDirection((prev) => ({ ...prev, [entryKey]: ev.target.value }));
                                    }}
                                    onClick={(ev) => ev.stopPropagation()}
                                    placeholder="Wskazówka graficzna (np. kawa w biurze, ciepłe kolory)"
                                    className="w-full h-8 px-2 rounded border border-border bg-background text-foreground text-xs placeholder:text-muted/60 focus:outline-none focus:ring-1 focus:ring-accent/40 transition"
                                  />
                                  {/* Content adherence + visual creativity — only for "Nowa grafika" */}
                                  {entryGraphicMode[entryKey] === "Nowa grafika" && (
                                    <div className="flex flex-wrap gap-4" onClick={(ev) => ev.stopPropagation()}>
                                      <div className="flex items-center gap-1.5">
                                        <span className="text-[10px] text-muted whitespace-nowrap">Treść:</span>
                                        {([["loose", "Luźno"], ["close", "Mocno"], ["literal", "Dosłownie"]] as const).map(([val, label]) => {
                                          const active = (entryContentAdherence[entryKey] || "close") === val;
                                          return (
                                            <button
                                              key={val}
                                              type="button"
                                              onClick={() => setEntryContentAdherence((prev) => ({ ...prev, [entryKey]: val }))}
                                              className={`px-2 py-0.5 rounded-full border text-[10px] transition-colors cursor-pointer ${
                                                active
                                                  ? "bg-accent border-accent text-white"
                                                  : "border-border bg-background text-muted hover:border-accent/40"
                                              }`}
                                            >
                                              {label}
                                            </button>
                                          );
                                        })}
                                      </div>
                                      <div className="flex items-center gap-1.5">
                                        <span className="text-[10px] text-muted whitespace-nowrap">Styl:</span>
                                        {([["realistic", "Realistycznie"], ["balanced", "Balans"], ["creative", "Kreatywnie"]] as const).map(([val, label]) => {
                                          const active = (entryVisualCreativity[entryKey] || "balanced") === val;
                                          return (
                                            <button
                                              key={val}
                                              type="button"
                                              onClick={() => setEntryVisualCreativity((prev) => ({ ...prev, [entryKey]: val }))}
                                              className={`px-2 py-0.5 rounded-full border text-[10px] transition-colors cursor-pointer ${
                                                active
                                                  ? "bg-accent border-accent text-white"
                                                  : "border-border bg-background text-muted hover:border-accent/40"
                                              }`}
                                            >
                                              {label}
                                            </button>
                                          );
                                        })}
                                      </div>
                                      <div className="flex items-center gap-1.5">
                                        <span className="text-[10px] text-muted whitespace-nowrap">Render:</span>
                                        {([
                                          ["realistic", "Realistycznie"],
                                          ["stylized_ad", "Reklama"],
                                          ["illustrated", "Ilustracja"],
                                        ] as const).map(([val, label]) => {
                                          const active = (entryRenderStyle[entryKey] || "realistic") === val;
                                          return (
                                            <button
                                              key={val}
                                              type="button"
                                              onClick={() => setEntryRenderStyle((prev) => ({ ...prev, [entryKey]: val }))}
                                              className={`px-2 py-0.5 rounded-full border text-[10px] transition-colors cursor-pointer ${
                                                active
                                                  ? "bg-accent border-accent text-white"
                                                  : "border-border bg-background text-muted hover:border-accent/40"
                                              }`}
                                            >
                                              {label}
                                            </button>
                                          );
                                        })}
                                        {(() => {
                                          const t = (entryTitles[entryKey] || entry.title || "").toLowerCase();
                                          const isEducational = /jak wybrać|porównani|ranking|top \d|5 cech|3 powody|poradnik|przewodnik|co wybrać/.test(t);
                                          const currentRender = entryRenderStyle[entryKey] || "realistic";
                                          if (isEducational && currentRender === "realistic") {
                                            return <span className="text-[10px] text-amber-600 ml-1">Poradnik/porównanie — rozważ Ilustrację</span>;
                                          }
                                          return null;
                                        })()}
                                      </div>
                                      {generatedPosts[entryKey] && (
                                        <span className="text-[10px] text-green-600">Post dostępny — grafika bazuje na treści</span>
                                      )}
                                      {!generatedPosts[entryKey] && (
                                        <span className="text-[10px] text-muted">Wygeneruj najpierw post, aby grafika bazowała na treści</span>
                                      )}
                                    </div>
                                  )}
                                  <div className="flex flex-wrap items-end gap-3" onClick={(ev) => ev.stopPropagation()}>
                                    {(["bg", "accent", "text"] as const).map((key_) => {
                                      const labels = { bg: "Tło", accent: "Akcent", text: "Tekst" };
                                      const globalVal = brandOverrides[key_];
                                      const localVal = entryColorOverrides[entryKey]?.[key_];
                                      return (
                                        <label key={key_} className="flex flex-col gap-0.5">
                                          <span className="text-[10px] text-muted">{labels[key_]}</span>
                                          <input
                                            type="color"
                                            value={localVal ?? globalVal}
                                            onChange={(ev) => {
                                              ev.stopPropagation();
                                              setEntryColorOverrides((prev) => ({
                                                ...prev,
                                                [entryKey]: { ...prev[entryKey], [key_]: ev.target.value },
                                              }));
                                            }}
                                            className="w-8 h-8 rounded border border-border cursor-pointer bg-transparent"
                                          />
                                        </label>
                                      );
                                    })}
                                    {entryColorOverrides[entryKey] && Object.keys(entryColorOverrides[entryKey]).length > 0 && (
                                      <button
                                        type="button"
                                        onClick={(ev) => {
                                          ev.stopPropagation();
                                          setEntryColorOverrides((prev) => { const n = { ...prev }; delete n[entryKey]; return n; });
                                        }}
                                        className="text-[10px] text-muted hover:text-foreground transition cursor-pointer pb-1"
                                      >
                                        Użyj globalnych
                                      </button>
                                    )}
                                  </div>
                                </>
                              )}

                              {/* --- 6. Overlay text + position --- */}
                              {((entryGraphicMode[entryKey] && entryGraphicMode[entryKey] !== "Brak grafiki" && entryGraphicMode[entryKey] !== "Czyste zdjęcie") || entrySourceImage[entryKey]) && (
                                <div className="space-y-1.5" onClick={(ev) => ev.stopPropagation()}>
                                  <div className="flex gap-1.5">
                                    <input
                                      type="text"
                                      value={entryOverlayText[entryKey] ?? ""}
                                      onChange={(ev) => {
                                        ev.stopPropagation();
                                        setEntryOverlayText((prev) => ({ ...prev, [entryKey]: ev.target.value }));
                                      }}
                                      placeholder="Napis na grafice (np. Import krok po kroku)"
                                      maxLength={60}
                                      className="flex-1 h-8 px-2 rounded border border-border bg-background text-foreground text-xs placeholder:text-muted/60 focus:outline-none focus:ring-1 focus:ring-accent/40 transition"
                                    />
                                    {!entryOverlayText[entryKey] && (entryTitles[entryKey] || entry.title) && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const title = (entryTitles[entryKey] || entry.title).slice(0, 60);
                                          setEntryOverlayText((prev) => ({ ...prev, [entryKey]: title }));
                                        }}
                                        className="h-8 px-2 rounded border border-border text-[10px] text-muted hover:text-foreground hover:border-accent/40 transition cursor-pointer whitespace-nowrap"
                                        title="Użyj tytułu posta jako napisu"
                                      >
                                        Użyj tytułu
                                      </button>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-[10px] text-muted">Pozycja napisu:</span>
                                    {(["top", "bottom", "left", "none"] as const).map((pos) => {
                                      const labels = { top: "Góra", bottom: "Dół", left: "Lewo", none: "Brak" };
                                      const active = (entryOverlayPosition[entryKey] || "top") === pos;
                                      return (
                                        <button
                                          key={pos}
                                          type="button"
                                          onClick={() => setEntryOverlayPosition((prev) => ({ ...prev, [entryKey]: pos }))}
                                          className={`px-2 py-0.5 rounded-full border text-[10px] transition-colors cursor-pointer ${
                                            active
                                              ? "bg-accent border-accent text-white"
                                              : "border-border bg-background text-muted hover:border-accent/40"
                                          }`}
                                        >
                                          {labels[pos]}
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}

                              {/* --- 7. Generate + Render buttons --- */}
                              {entryGraphicMode[entryKey] && entryGraphicMode[entryKey] !== "Brak grafiki" && entryGraphicMode[entryKey] !== "Karuzela" && (
                                <div className="flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    disabled={aiGenLoading.has(entryKey)}
                                    onClick={(ev) => {
                                      ev.stopPropagation();
                                      handleAiGenerate(entry, entryKey, weekNum);
                                    }}
                                    className="h-8 px-3 rounded-lg bg-accent text-white text-xs font-medium hover:bg-accent-hover disabled:opacity-50 transition cursor-pointer"
                                  >
                                    {aiGenLoading.has(entryKey)
                                      ? "Generuję AI…"
                                      : entryAiBackground[entryKey]
                                        ? "Regeneruj AI"
                                        : "Generuj grafikę AI"
                                    }
                                  </button>
                                  {(entryGraphicMode[entryKey] === "Nowa grafika" || entryGraphicMode[entryKey] === "Zdjęcie z tekstem" || entryGraphicMode[entryKey] === "Na podstawie zdjęcia") && (
                                    <button
                                      type="button"
                                      onClick={(ev) => {
                                        ev.stopPropagation();
                                        renderGraphic(
                                          entryTitles[entryKey] || entry.title,
                                          entryDescriptions[entryKey] || entry.description,
                                          weekNum,
                                          entrySlots[entryKey] || entry.slot,
                                          entry.platform,
                                          entryKey,
                                        );
                                      }}
                                      className="h-8 px-3 rounded-lg border border-border text-foreground text-xs font-medium hover:bg-accent/10 transition cursor-pointer"
                                    >
                                      {renderedGraphicKeys.current.has(entryKey) ? "Nałóż ponownie" : "Nałóż tekst i logo"}
                                    </button>
                                  )}
                                </div>
                              )}
                              {/* Overlay on source image — visible when source image exists but no graphic mode selected */}
                              {(!entryGraphicMode[entryKey] || entryGraphicMode[entryKey] === "Brak grafiki") && entrySourceImage[entryKey] && (
                                <button
                                  type="button"
                                  onClick={(ev) => {
                                    ev.stopPropagation();
                                    renderGraphic(
                                      entryTitles[entryKey] || entry.title,
                                      entryDescriptions[entryKey] || entry.description,
                                      weekNum,
                                      entrySlots[entryKey] || entry.slot,
                                      entry.platform,
                                      entryKey,
                                    );
                                  }}
                                  className="h-8 px-3 rounded-lg border border-accent/30 text-accent text-xs font-medium hover:bg-accent/10 transition cursor-pointer"
                                >
                                  {renderedGraphicKeys.current.has(entryKey) ? "Nałóż ponownie" : "Nałóż tekst i logo na zdjęcie"}
                                </button>
                              )}

                              {/* --- 8. AI status + feedback chip + reopen preview --- */}
                              {aiGenLoading.has(entryKey) && (
                                <p className="text-accent text-xs mt-1 animate-pulse">Generowanie grafiki AI może potrwać do 30s…</p>
                              )}
                              {aiGenErrors[entryKey] && !aiGenLoading.has(entryKey) && (
                                <p className="text-red-600 text-xs mt-1">{aiGenErrors[entryKey]}</p>
                              )}
                              {entryAiBackground[entryKey] && !aiGenLoading.has(entryKey) && entryGraphicMode[entryKey] !== "Czyste zdjęcie" && (
                                <div className="space-y-1">
                                  <p className="text-green-600 text-xs">Grafika AI gotowa — użyj &quot;Renderuj z tekstem&quot; aby nałożyć napis i logo</p>
                                  {aiGenMeta[entryKey] && (
                                    <div className="flex flex-wrap gap-1.5">
                                      <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-100 text-green-700">
                                        {aiGenMeta[entryKey].method === "edit" ? "Edit API" : "Generate API"}
                                      </span>
                                      {aiGenMeta[entryKey].usedSource && (
                                        <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-100 text-blue-700">
                                          Ze zdjęciem bazowym
                                        </span>
                                      )}
                                      <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-600">
                                        {aiGenMeta[entryKey].route.replace(/_/g, " ")}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              )}
                              {/* Persistent preview reopen + download */}
                              {entryLastRender[entryKey] && !aiGenLoading.has(entryKey) && (
                                <div className="flex flex-wrap items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={(ev) => {
                                      ev.stopPropagation();
                                      setGraphicPreview(entryLastRender[entryKey]);
                                    }}
                                    className="h-7 px-2.5 rounded-lg border border-green-300 text-green-700 text-xs font-medium hover:bg-green-50 transition cursor-pointer"
                                  >
                                    Otwórz podgląd
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(ev) => {
                                      ev.stopPropagation();
                                      const a = document.createElement("a");
                                      a.href = entryLastRender[entryKey].dataUrl;
                                      a.download = entryLastRender[entryKey].filename;
                                      a.click();
                                    }}
                                    className="h-7 px-2.5 rounded-lg border border-border text-muted text-xs font-medium hover:text-foreground hover:border-accent/40 transition cursor-pointer"
                                  >
                                    Pobierz PNG
                                  </button>
                                  <span className="text-[10px] text-muted">Ostatni wynik</span>
                                </div>
                              )}

                              {/* --- 9. Prompt preview --- */}
                              {entryGraphicMode[entryKey] && entryGraphicMode[entryKey] !== "Brak grafiki" && (
                                <div onClick={(ev) => ev.stopPropagation()}>
                                  <button
                                    type="button"
                                    disabled={promptPreviewLoading.has(entryKey)}
                                    onClick={() => {
                                      if (promptPreviewOpen[entryKey] && promptPreviews[entryKey]) {
                                        setPromptPreviewOpen((prev) => ({ ...prev, [entryKey]: false }));
                                      } else {
                                        handlePromptPreview(entry, entryKey);
                                      }
                                    }}
                                    className="text-[11px] text-muted hover:text-foreground transition cursor-pointer"
                                  >
                                    {promptPreviewLoading.has(entryKey)
                                      ? "Ładuję prompt…"
                                      : promptPreviewOpen[entryKey]
                                        ? "Ukryj prompt"
                                        : "Podgląd promptu AI"
                                    }
                                  </button>
                                  {promptPreviewOpen[entryKey] && promptPreviews[entryKey] && (() => {
                                    const pp = promptPreviews[entryKey];
                                    return (
                                      <div className="mt-1.5 p-3 rounded-lg border border-border bg-background text-xs space-y-3">
                                        <div className="flex flex-wrap gap-3 text-[10px] text-muted">
                                          {pp.route && <span>Route: <strong className="text-foreground">{pp.route}</strong></span>}
                                          <span>Archetype: <strong className="text-foreground">{pp.style_archetype}</strong></span>
                                          <span>Aspect: <strong className="text-foreground">{pp.aspect_ratio}</strong></span>
                                          <span>{pp.resolution_hint}</span>
                                          {pp.safe_zone_side && <span>Safe zone: <strong className="text-foreground">{pp.safe_zone_side}</strong></span>}
                                          <span>{pp.generation_word_count} słów</span>
                                        </div>
                                        <div>
                                          <p className="text-[10px] text-muted uppercase tracking-wide mb-1">Generation prompt</p>
                                          <pre className="whitespace-pre-wrap text-foreground text-[11px] leading-relaxed font-mono bg-card p-2 rounded border border-border overflow-x-auto">{pp.generation_prompt}</pre>
                                        </div>
                                        {pp.edit_prompt && (
                                          <div>
                                            <p className="text-[10px] text-muted uppercase tracking-wide mb-1">Edit prompt ({pp.edit_word_count} słów)</p>
                                            <pre className="whitespace-pre-wrap text-foreground text-[11px] leading-relaxed font-mono bg-card p-2 rounded border border-border overflow-x-auto">{pp.edit_prompt}</pre>
                                          </div>
                                        )}
                                        {pp.preserve_list && pp.preserve_list.length > 0 && (
                                          <div>
                                            <p className="text-[10px] text-muted uppercase tracking-wide mb-1">Preserve list</p>
                                            <p className="text-foreground">{pp.preserve_list.join(", ")}</p>
                                          </div>
                                        )}
                                        <details className="text-[10px]">
                                          <summary className="text-muted cursor-pointer hover:text-foreground transition">Segmenty debugowe</summary>
                                          <div className="mt-1 space-y-1">
                                            {Object.entries(pp.generation_segments).map(([key, val]) => (
                                              <div key={key}>
                                                <span className="text-muted">{key}: </span>
                                                <span className="text-foreground">{val}</span>
                                              </div>
                                            ))}
                                          </div>
                                        </details>
                                      </div>
                                    );
                                  })()}
                                </div>
                              )}
                            </div>
                          )}
                          {!isBlog && !isGenerating && !generated && !singlePostErrors[entryKey] && (
                            <p className="text-accent text-xs mt-2 font-medium">
                              Kliknij, aby wygenerować post &rarr;
                            </p>
                          )}
                          {isGenerating && (
                            <p className="text-accent text-xs mt-2 font-medium animate-pulse">
                              {slowLoadingKeys.has(entryKey)
                                ? "Generacja trwa dłużej niż zwykle, poczekaj chwilę…"
                                : "Generuję post…"
                              }
                            </p>
                          )}
                          {singlePostErrors[entryKey] && !isGenerating && (
                            <div className="mt-2 flex items-center gap-2">
                              <p className="text-red-600 text-xs">{singlePostErrors[entryKey]}</p>
                              <button
                                onClick={(ev) => {
                                  ev.stopPropagation();
                                  handleGenerateSinglePost(entry, entryKey);
                                }}
                                className="text-xs text-accent hover:text-accent-hover font-medium cursor-pointer"
                              >
                                Spróbuj ponownie
                              </button>
                            </div>
                          )}
                        </div>
                        {generated && (
                          <div className="mt-2 ml-4 p-4 rounded-lg border border-accent/20 bg-accent/5">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xs font-medium text-accent">
                                Wygenerowany post — {generated.platform}
                              </span>
                              <div className="flex gap-3">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    navigator.clipboard.writeText(generated.content);
                                  }}
                                  className="text-xs text-muted hover:text-foreground transition cursor-pointer"
                                >
                                  Kopiuj
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleGenerateSinglePost(entry, entryKey);
                                  }}
                                  disabled={isGenerating}
                                  className="text-xs text-muted hover:text-foreground transition cursor-pointer disabled:opacity-50"
                                >
                                  Regeneruj
                                </button>
                              </div>
                            </div>
                            <p className="text-foreground text-sm leading-relaxed whitespace-pre-wrap">
                              {generated.content}
                            </p>
                          </div>
                        )}
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
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          <div className="mt-6 flex gap-3">
            <button
              onClick={() => {
                if (!planResult) return;
                const BOM = "\uFEFF";
                const hasAnyGenerated = Object.keys(generatedPosts).length > 0;
                const hasAnyBlogGenerated = Object.keys(generatedBlogs).length > 0;
                const hasAnyGraphicMode = Object.values(entryGraphicMode).some((v) => v !== "");
                const hasAnyProduct = Object.keys(entryProductData).length > 0;
                const headerCols = ["Tydzień", "Dzień", "Platforma", "Typ", "Tytuł", "Opis"];
                if (hasAnyGenerated) headerCols.push("Wygenerowany post");
                if (hasAnyBlogGenerated) headerCols.push("Tytuł bloga");
                if (hasAnyGraphicMode) headerCols.push("Tryb graficzny", "Wskazówka graficzna");
                if (hasAnyProduct) headerCols.push("URL produktu", "Nazwa produktu");
                const header = headerCols.join(";");
                // Build entryKey map: track per-week index to match rendering keys
                const weekCounters: Record<number, number> = {};
                const rows = planResult.entries.map((e) => {
                  const w = e.week;
                  if (!(w in weekCounters)) weekCounters[w] = 0;
                  const key = `${w}-${weekCounters[w]}`;
                  weekCounters[w]++;
                  const gen = generatedPosts[key];
                  const slot = entrySlots[key] || e.slot;
                  const title = entryTitles[key] ?? e.title;
                  const desc = entryDescriptions[key] ?? e.description;
                  const blogGen = generatedBlogs[key];
                  const base = [e.week, slot, e.platform, e.content_type, `"${title.replace(/"/g, '""')}"`, `"${desc.replace(/"/g, '""')}"`];
                  if (hasAnyGenerated) {
                    base.push(gen ? `"${gen.content.replace(/"/g, '""')}"` : "");
                  }
                  if (hasAnyBlogGenerated) {
                    base.push(blogGen ? `"${blogGen.title.replace(/"/g, '""')}"` : "");
                  }
                  if (hasAnyGraphicMode) {
                    const gMode = entryGraphicMode[key] || "";
                    const gDir = entryVisualDirection[key] || "";
                    base.push(`"${gMode}"`, `"${gDir.replace(/"/g, '""')}"`);
                  }
                  if (hasAnyProduct) {
                    const pd = entryProductData[key];
                    base.push(pd ? `"${pd.url}"` : "", pd ? `"${pd.title.replace(/"/g, '""')}"` : "");
                  }
                  return base.join(";");
                });
                const csv = BOM + [header, ...rows].join("\n");
                const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
                const url = URL.createObjectURL(blob);
                const date = new Date().toISOString().slice(0, 10);
                const a = document.createElement("a");
                a.href = url;
                a.download = `sociale-plan-${date}.csv`;
                a.click();
                URL.revokeObjectURL(url);
              }}
              className="flex-1 h-11 rounded-lg border-2 border-accent text-accent font-medium hover:bg-accent/5 transition cursor-pointer"
            >
              Pobierz plan (CSV)
            </button>
            <button
              onClick={() => {
                if (window.confirm("Zresetować sesję? Cały plan, refinementy i wygenerowane posty zostaną usunięte.")) {
                  resetAll();
                }
              }}
              className="flex-1 h-11 rounded-lg border border-border text-muted font-medium hover:text-foreground hover:border-accent/40 transition cursor-pointer"
            >
              Nowa analiza
            </button>
          </div>
        </div>
      )}

      {/* ===================== RESULTS ===================== */}
      {step === "results" && generateResult && (
        <div className="w-full max-w-2xl mt-16 mb-16">
          <button
            onClick={() => {
              if (window.confirm("Zresetować sesję? Cały plan, refinementy i wygenerowane posty zostaną usunięte.")) {
                resetAll();
              }
            }}
            className="mb-8 text-sm text-muted hover:text-foreground transition cursor-pointer"
          >
            &larr; Nowa analiza
          </button>

          <h2 className="text-2xl font-semibold text-foreground mb-8">
            Twoje treści
          </h2>

          {/* Social posts */}
          <section className="mb-10">
            <h3 className="text-lg font-semibold text-foreground mb-4">
              Posty social media
            </h3>
            <div className="space-y-4">
              {generateResult.social_posts.map((post, i) => (
                <div
                  key={i}
                  className="p-4 rounded-lg border border-border bg-card"
                >
                  <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-accent/10 text-accent mb-2">
                    {post.platform}
                  </span>
                  <p className="text-foreground text-sm leading-relaxed whitespace-pre-wrap">
                    {post.content}
                  </p>
                </div>
              ))}
            </div>
          </section>

          {/* Blog post */}
          <section className="mb-10">
            <h3 className="text-lg font-semibold text-foreground mb-4">
              Wpis blogowy
            </h3>
            <div className="p-5 rounded-lg border border-border bg-card">
              <h4 className="text-base font-semibold text-foreground mb-3">
                {generateResult.blog_post.title}
              </h4>
              <div
                className="blog-content"
                dangerouslySetInnerHTML={{
                  __html: generateResult.blog_post.content,
                }}
              />
            </div>
          </section>

          {/* SEO Pack */}
          <section className="mb-10">
            <h3 className="text-lg font-semibold text-foreground mb-4">
              SEO Pack
            </h3>
            <div className="p-5 rounded-lg border border-border bg-card space-y-3">
              <div>
                <p className="text-xs text-muted mb-1">Meta title</p>
                <p className="text-sm text-foreground">
                  {generateResult.seo_pack.meta_title}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted mb-1">Meta description</p>
                <p className="text-sm text-foreground">
                  {generateResult.seo_pack.meta_description}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted mb-1">Słowa kluczowe</p>
                <div className="flex flex-wrap gap-2">
                  {generateResult.seo_pack.keywords.map((kw, i) => (
                    <span
                      key={i}
                      className="px-2 py-1 rounded text-xs bg-accent/10 text-accent"
                    >
                      {kw}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* Visual Brief */}
          <section className="mb-10">
            <h3 className="text-lg font-semibold text-foreground mb-4">
              Visual brief
            </h3>
            <div className="p-5 rounded-lg border border-border bg-card space-y-3">
              <p className="text-sm text-foreground leading-relaxed">
                {generateResult.visual_brief.suggestion}
              </p>
              <div>
                <p className="text-xs text-muted mb-2">Paleta kolorów</p>
                <div className="flex gap-2">
                  {generateResult.visual_brief.color_palette.map((color, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <div
                        className="w-6 h-6 rounded border border-border"
                        style={{ backgroundColor: color }}
                      />
                      <span className="text-xs text-muted font-mono">
                        {color}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* WordPress Export */}
          <section className="mb-10">
            <h3 className="text-lg font-semibold text-foreground mb-4">
              Eksport do WordPress
            </h3>

            {!showExportForm && !exportMessage && (
              <button
                onClick={() => setShowExportForm(true)}
                className="h-11 px-6 rounded-lg border border-border bg-card text-foreground font-medium hover:border-accent/40 transition cursor-pointer"
              >
                Eksportuj blog jako szkic
              </button>
            )}

            {showExportForm && !exportMessage && (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!generateResult) return;
                  setExportLoading(true);
                  setExportMessage(null);
                  try {
                    const res = await fetch(`${API_URL}/api/export/wordpress`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        wp_url: wpUrl,
                        wp_user: wpUser,
                        wp_app_password: wpAppPassword,
                        title: generateResult.blog_post.title,
                        content: generateResult.blog_post.content,
                        excerpt: generateResult.seo_pack.meta_description,
                        status: "draft",
                      }),
                    });
                    const data = await res.json();
                    if (data.success) {
                      setExportMessage({ ok: true, text: data.message + (data.post_url ? ` Podgląd: ${data.post_url}` : "") });
                    } else {
                      setExportMessage({ ok: false, text: data.message || "Wystąpił nieoczekiwany błąd." });
                    }
                  } catch {
                    setExportMessage({ ok: false, text: "Nie udało się połączyć z serwerem." });
                  } finally {
                    setExportLoading(false);
                  }
                }}
                className="p-5 rounded-lg border border-border bg-card space-y-4"
              >
                <p className="text-sm text-muted">
                  Podaj dane WordPress, aby wyeksportować wpis blogowy jako szkic (draft).
                </p>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    Adres strony WordPress
                  </label>
                  <input
                    type="url"
                    required
                    placeholder="https://twoja-strona.pl"
                    value={wpUrl}
                    onChange={(e) => setWpUrl(e.target.value)}
                    className="w-full h-11 px-3 rounded-lg border border-border bg-background text-foreground placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent transition"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    Nazwa użytkownika
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="admin"
                    value={wpUser}
                    onChange={(e) => setWpUser(e.target.value)}
                    className="w-full h-11 px-3 rounded-lg border border-border bg-background text-foreground placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent transition"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    Hasło aplikacji
                  </label>
                  <input
                    type="password"
                    required
                    placeholder="xxxx xxxx xxxx xxxx"
                    value={wpAppPassword}
                    onChange={(e) => setWpAppPassword(e.target.value)}
                    className="w-full h-11 px-3 rounded-lg border border-border bg-background text-foreground placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent transition"
                  />
                  <p className="text-xs text-muted mt-1">
                    Wygeneruj w WordPress: Użytkownicy → Twój profil → Hasła aplikacji
                  </p>
                </div>
                <div className="flex gap-3">
                  <button
                    type="submit"
                    disabled={exportLoading}
                    className="h-11 px-6 rounded-lg bg-accent text-white font-medium hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition cursor-pointer"
                  >
                    {exportLoading ? "Eksportuję…" : "Utwórz szkic"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowExportForm(false)}
                    className="h-11 px-4 rounded-lg border border-border text-muted hover:text-foreground transition cursor-pointer"
                  >
                    Anuluj
                  </button>
                </div>
              </form>
            )}

            {exportMessage && (
              <div className={`p-4 rounded-lg border ${exportMessage.ok ? "border-green-300 bg-green-50 text-green-800" : "border-red-300 bg-red-50 text-red-800"}`}>
                <p className="text-sm">{exportMessage.text}</p>
                {exportMessage.ok && (
                  <p className="text-xs mt-1 text-green-600">
                    Post został zapisany jako szkic — nie jest jeszcze opublikowany.
                  </p>
                )}
                <button
                  onClick={() => {
                    setExportMessage(null);
                    setShowExportForm(false);
                  }}
                  className="mt-3 text-xs text-muted hover:text-foreground transition cursor-pointer"
                >
                  {exportMessage.ok ? "Eksportuj ponownie" : "Spróbuj ponownie"}
                </button>
              </div>
            )}
          </section>
        </div>
      )}

      {/* Error */}
      {error && (
        <p className="mt-6 text-red-600 text-sm text-center">{error}</p>
      )}

      {/* Canvas-based overlay renderer — no hidden DOM template needed */}

      {/* Graphic preview modal */}
      {graphicPreview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={() => setGraphicPreview(null)}
        >
          <div
            className="bg-card rounded-xl border border-border p-6 max-w-lg w-full mx-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-foreground">Podgląd grafiki</h3>
              <button
                onClick={() => setGraphicPreview(null)}
                className="text-muted hover:text-foreground text-lg cursor-pointer"
              >
                ✕
              </button>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={graphicPreview.dataUrl}
              alt="Podgląd"
              className="w-full rounded-lg border border-border mb-4"
            />
            <div className="flex gap-3">
              <button
                onClick={() => {
                  const a = document.createElement("a");
                  a.href = graphicPreview.dataUrl;
                  a.download = graphicPreview.filename;
                  a.click();
                }}
                className="flex-1 h-10 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent-hover transition cursor-pointer"
              >
                Pobierz PNG
              </button>
              <button
                onClick={() => setGraphicPreview(null)}
                className="flex-1 h-10 rounded-lg border border-border text-muted text-sm font-medium hover:text-foreground transition cursor-pointer"
              >
                Zamknij
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="mt-auto py-8 text-center text-xs text-muted/50">
        Sociale MVP
      </div>
    </div>
  );
}
