import axios from "axios";

/** 사용자에게 표시하는 통신/API 설정 안내 문구 (백엔드 주소 미설정·연결 실패 시). */
export const AI_SERVER_HELP_MESSAGE = "AI 서버 주소를 확인해주세요.";

/**
 * Colab/백엔드 FastAPI가 **동일 런타임 안**의 SD WebUI(API)로 호출할 때 쓰는 기본 URL입니다.
 * 브라우저가 이 주소로 직접 요청하지 않습니다 — 서버( Colab 내 uvicorn )가 `127.0.0.1:7860` 으로 붙습니다.
 */
export const INTERNAL_SD_WEBUI_DEFAULT = "http://127.0.0.1:7860";

/**
 * Backend origin only (scheme + host[:port]). No trailing slash.
 * Strips repeated ".../api" suffix so baseURL does not become ".../api/api".
 */
function normalizeApiOrigin(raw) {
  if (raw == null || raw === "") return "";
  let s = String(raw).trim();
  while (/\/api\/?$/i.test(s)) {
    s = s.replace(/\/api\/?$/i, "");
  }
  return s.replace(/\/+$/, "");
}

const RAW_API_ORIGIN = import.meta.env.VITE_API_BASE_URL ?? "";

const API_ORIGIN = normalizeApiOrigin(RAW_API_ORIGIN);

/** 프로덕션에서 API 베이스가 빌드에 포함되었는지 (`VITE_API_BASE_URL`). */
export function isApiBaseConfigured() {
  return Boolean(String(import.meta.env.VITE_API_BASE_URL ?? "").trim());
}

/** Axios base: `{origin}/api` 또는 `/api` (개발 시 Vite 프록시). `${VITE_API_BASE_URL}/api/...` 형태가 되도록 함. */
function resolveAxiosApiBase() {
  if (!API_ORIGIN) return "/api";
  try {
    const u = new URL(API_ORIGIN.match(/^https?:\/\//i) ? API_ORIGIN : `https://${API_ORIGIN}`);
    const origin = u.origin;
    return `${origin}/api`.replace(/([^:]\/)\/+/g, "$1");
  } catch {
    const root = API_ORIGIN.replace(/\/+$/, "");
    return `${root}/api`.replace(/([^:]\/)\/+/g, "$1");
  }
}

const AXIOS_BASE = resolveAxiosApiBase();

/** 서버 detail 우선, 없으면 err.message, 최종 폴백은 AI_SERVER_HELP_MESSAGE. */
export function apiErrorMessage(err) {
  const d = err?.response?.data?.detail;
  if (typeof d === "string" && d.trim()) return d;
  if (Array.isArray(d) && d.length) {
    const parts = d.map((x) => (typeof x?.msg === "string" ? x.msg : JSON.stringify(x)));
    return parts.join("; ");
  }
  if (d != null && typeof d === "object") {
    try {
      return JSON.stringify(d);
    } catch {
      return AI_SERVER_HELP_MESSAGE;
    }
  }
  const msg = err?.message;
  if (typeof msg === "string" && msg.trim()) return msg;
  return AI_SERVER_HELP_MESSAGE;
}

/** 프론트가 Vercel 등 공개 호스트일 때 API 호스트가 빠졌는지. */
export function shouldWarnMissingApiEnv() {
  if (!import.meta.env.PROD || typeof window === "undefined") return false;
  const h = window.location.hostname;
  const local = h === "localhost" || h === "127.0.0.1";
  return !local && !isApiBaseConfigured();
}

/** 환경 변수로 고정된 백엔드 origin이 있을 때만 절대 URL로 만듭니다 (예: 기본 뼈대 PNG). */
export function resolveAppUrl(path) {
  if (!path || !path.startsWith("/")) return path;
  const origin = API_ORIGIN.replace(/\/+$/, "");
  return origin ? `${origin}${path}` : path;
}

const api = axios.create({
  baseURL: AXIOS_BASE,
  timeout: 120_000,
});

api.interceptors.request.use(
  (config) => {
    if (shouldWarnMissingApiEnv()) {
      return Promise.reject(new Error(AI_SERVER_HELP_MESSAGE));
    }
    return config;
  },
  (err) => Promise.reject(err)
);

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (!err.response && err.code !== "ERR_CANCELED") {
      err.message = AI_SERVER_HELP_MESSAGE;
    }
    return Promise.reject(err);
  }
);

// ─── Step 1: Upload ──────────────────────────────────────────────────────────

export async function uploadImage(file, onProgress) {
  const form = new FormData();
  form.append("file", file);
  const { data } = await api.post("upload", form, {
    onUploadProgress: (e) => {
      if (onProgress) onProgress(Math.round((e.loaded * 100) / e.total));
    },
  });
  return data;
}

// ─── AI Status ───────────────────────────────────────────────────────────────

export async function getAiStatus() {
  const { data } = await api.get("ai/status");
  return data;
}

export async function checkSdStatus(sdUrl) {
  const { data } = await api.get("ai/sd/status", {
    params: { url: sdUrl },
  });
  return data;
}

export async function generateAnimation(params) {
  const form = new FormData();
  form.append("skeleton_sheet", params.skeleton_sheet);
  form.append("reference_photo", params.reference_photo);
  form.append("sd_url", params.sd_url || INTERNAL_SD_WEBUI_DEFAULT);
  form.append("num_frames", params.num_frames ?? 8);
  form.append("extra_prompt", params.extra_prompt || "");
  form.append("extra_negative", params.extra_negative ?? "");
  form.append("lora_pixel", params.lora_pixel || "pixel_art");
  form.append("lora_chibi", params.lora_chibi || "chibi_style");
  form.append("lora_weight", params.lora_weight ?? 1.0);
  form.append("steps", params.steps ?? 25);
  form.append("cfg_scale", params.cfg_scale ?? 7.5);
  form.append("canny_weight", params.canny_weight ?? 1.0);
  form.append("ref_weight", params.ref_weight ?? 0.8);
  form.append("output_width", params.output_width ?? 64);
  form.append("output_height", params.output_height ?? 64);
  form.append("remove_bg", params.remove_bg ?? true);
  form.append("use_ref_only", params.use_ref_only ?? true);
  form.append("sheet_cols", params.sheet_cols ?? 0);
  form.append("sheet_rows", params.sheet_rows ?? 1);
  form.append("row_index", params.row_index ?? 0);
  form.append("skel_is_lineart", params.skel_is_lineart ?? false);

  const { data } = await api.post("ai/animate", form, {
    timeout: 600_000,
  });
  return data;
}

export async function generateSingle(params) {
  const form = new FormData();
  form.append("reference_photo", params.reference_photo);
  form.append("sd_url", params.sd_url || INTERNAL_SD_WEBUI_DEFAULT);
  form.append("extra_prompt", params.extra_prompt || "");
  form.append("lora_pixel", params.lora_pixel || "pixel_art");
  form.append("lora_chibi", params.lora_chibi || "chibi_style");
  form.append("lora_weight", params.lora_weight ?? 1.0);
  form.append("steps", params.steps ?? 25);
  form.append("remove_bg", params.remove_bg ?? true);

  const { data } = await api.post("ai/generate", form, {
    timeout: 120_000,
  });
  return data;
}

// ─── Step 1b: Upload manually bg-removed canvas PNG ─────────────────────────

export async function uploadBgRemoved(file) {
  const form = new FormData();
  form.append("file", file);
  const { data } = await api.post("upload/bg-removed", form);
  return data;
}

// ─── Step 2: Pixelate ────────────────────────────────────────────────────────

export async function pixelateImage({
  file_id,
  filename,
  pixel_size,
  num_colors,
  preview_scale,
  auto_remove_bg = false,
  bg_model = "human",
}) {
  const { data } = await api.post("pixel", {
    file_id,
    filename,
    pixel_size: pixel_size ?? 16,
    num_colors: num_colors ?? 16,
    preview_scale: preview_scale ?? 8,
    auto_remove_bg,
    bg_model,
  });
  return data;
}

// ─── Step 3a: Chromakey ──────────────────────────────────────────────────────

export async function applyChromakey({
  source_path,
  color = "green",
  tolerance = 30,
  spill_reduction = true,
  feather_radius = 1,
  custom_rgb = null,
}) {
  const { data } = await api.post("chromakey", {
    source_path,
    color,
    tolerance,
    spill_reduction,
    feather_radius,
    custom_rgb,
  });
  return data;
}

// ─── Step 3b: AI Transform ───────────────────────────────────────────────────

export async function aiTransform({ source_path, prompt, strength = 0.75 }) {
  const { data } = await api.post("ai", { source_path, prompt, strength });
  return data;
}

// ─── Step 4: Animation ───────────────────────────────────────────────────────

export async function createAnimation({ source_path, motion = "walk", frame_count = 0 }) {
  const { data } = await api.post("animation", { source_path, motion, frame_count });
  return data;
}

export async function fetchMotions() {
  const { data } = await api.get("animation/motions");
  return data.motions;
}

// ─── Step 5: Export ──────────────────────────────────────────────────────────

export async function exportSpriteSheet({
  source_path,
  character_name = "Character",
  action = "walk",
  cell_size = 64,
  frame_count = 0,
}) {
  const { data } = await api.post("export", {
    source_path,
    character_name,
    action,
    cell_size,
    frame_count,
  });
  return data;
}

// ─── Video: Upload + Frame Extraction ───────────────────────────────────────

export async function uploadVideo(file, onProgress) {
  const form = new FormData();
  form.append("file", file);
  const { data } = await api.post("video/upload", form, {
    onUploadProgress: (e) => {
      if (onProgress) onProgress(Math.round((e.loaded * 100) / e.total));
    },
  });
  return data;
}

export async function extractVideoFrames({
  filename,
  max_frames = 8,
  frame_interval = 1,
  apply_pixelate = false,
  pixel_size = 32,
  num_colors = 24,
  background_removal = false,
  character_name = "Character",
  action = "walk",
  cell_size = 64,
  auto_build_sheet = true,
}) {
  const { data } = await api.post("video/extract", {
    filename,
    max_frames,
    frame_interval,
    apply_pixelate,
    pixel_size,
    num_colors,
    background_removal,
    character_name,
    action,
    cell_size,
    auto_build_sheet,
  });
  return data;
}

// ─── ZIP Download ─────────────────────────────────────────────────────────────

export async function downloadZip({
  source_path,
  character_name = "Character",
  action = "walk",
  cell_size = 64,
  frame_count = 0,
}) {
  const response = await api.post(
    "export/zip",
    { source_path, character_name, action, cell_size, frame_count },
    { responseType: "blob" }
  );
  const url = URL.createObjectURL(response.data);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${character_name}_${action}_unity.zip`;
  a.click();
  URL.revokeObjectURL(url);
}
