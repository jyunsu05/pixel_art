import axios from "axios";

/** Backend origin only; no trailing slash or trailing `/api` (axios uses `/api/...`). */
function normalizeApiOrigin(raw) {
  if (raw == null || raw === "") return "";
  let s = String(raw).trim();
  s = s.replace(/\/api\/?$/i, "");
  return s.replace(/\/+$/, "");
}

const BASE_URL = normalizeApiOrigin(
  import.meta.env.VITE_API_BASE_URL ||
    import.meta.env.REACT_APP_AI_URL ||
    import.meta.env.REACT_APP_API_URL ||
    ""
);

/** Same origin as axios API when env is set (e.g. split frontend hosting). */
export function resolveAppUrl(path) {
  if (!path || !path.startsWith("/")) return path;
  const origin = BASE_URL.replace(/\/$/, "");
  return origin ? `${origin}${path}` : path;
}

const api = axios.create({
  baseURL: `${BASE_URL}/api`,
  timeout: 120_000,
});

// ─── Step 1: Upload ──────────────────────────────────────────────────────────

export async function uploadImage(file, onProgress) {
  const form = new FormData();
  form.append("file", file);
  const { data } = await api.post("/upload", form, {
    headers: { "Content-Type": "multipart/form-data" },
    onUploadProgress: (e) => {
      if (onProgress) onProgress(Math.round((e.loaded * 100) / e.total));
    },
  });
  return data; // { file_id, filename, url, ... }
}

// ─── AI Status ───────────────────────────────────────────────────────────────

export async function getAiStatus() {
  const { data } = await api.get("/ai/status");
  return data;
}

export async function checkSdStatus(sdUrl) {
  const { data } = await api.get(`/ai/sd/status?url=${encodeURIComponent(sdUrl)}`);
  return data;
}

export async function generateAnimation(params) {
  const form = new FormData();
  form.append("skeleton_sheet",  params.skeleton_sheet);
  form.append("reference_photo", params.reference_photo);
  form.append("sd_url",          params.sd_url          || "http://127.0.0.1:7860");
  form.append("num_frames",      params.num_frames       ?? 8);
  form.append("extra_prompt",    params.extra_prompt     || "");
  form.append("lora_pixel",      params.lora_pixel       || "pixel_art");
  form.append("lora_chibi",      params.lora_chibi       || "chibi_style");
  form.append("lora_weight",     params.lora_weight      ?? 1.0);
  form.append("steps",           params.steps            ?? 25);
  form.append("cfg_scale",       params.cfg_scale        ?? 7.5);
  form.append("canny_weight",    params.canny_weight     ?? 1.0);
  form.append("ref_weight",      params.ref_weight       ?? 0.8);
  form.append("output_width",    params.output_width     ?? 64);
  form.append("output_height",   params.output_height    ?? 64);
  form.append("remove_bg",       params.remove_bg        ?? true);
  form.append("use_ref_only",    params.use_ref_only     ?? true);
  form.append("sheet_cols",      params.sheet_cols       ?? 0);
  form.append("sheet_rows",      params.sheet_rows       ?? 1);
  form.append("row_index",       params.row_index        ?? 0);
  form.append("skel_is_lineart", params.skel_is_lineart  ?? false);

  const { data } = await api.post("/ai/animate", form, {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 600_000,  // 10 min for 8-frame generation
  });
  return data;
}

export async function generateSingle(params) {
  const form = new FormData();
  form.append("reference_photo", params.reference_photo);
  form.append("sd_url",          params.sd_url        || "http://127.0.0.1:7860");
  form.append("extra_prompt",    params.extra_prompt  || "");
  form.append("lora_pixel",      params.lora_pixel    || "pixel_art");
  form.append("lora_chibi",      params.lora_chibi    || "chibi_style");
  form.append("lora_weight",     params.lora_weight   ?? 1.0);
  form.append("steps",           params.steps         ?? 25);
  form.append("remove_bg",       params.remove_bg     ?? true);

  const { data } = await api.post("/ai/generate", form, {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 120_000,
  });
  return data;
}

// ─── Step 1b: Upload manually bg-removed canvas PNG ─────────────────────────

export async function uploadBgRemoved(file) {
  const form = new FormData();
  form.append("file", file);
  const { data } = await api.post("/upload/bg-removed", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data; // { file_id, filename, url }
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
  const { data } = await api.post("/pixel", {
    file_id,
    filename,
    pixel_size: pixel_size ?? 16,
    num_colors: num_colors ?? 16,
    preview_scale: preview_scale ?? 8,
    auto_remove_bg,
    bg_model,
  });
  return data; // { pixel_id, preview_url, raw_url, bg_removed_url, ... }
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
  const { data } = await api.post("/chromakey", {
    source_path,
    color,
    tolerance,
    spill_reduction,
    feather_radius,
    custom_rgb,
  });
  return data; // { chroma_id, result_url, ... }
}

// ─── Step 3b: AI Transform ───────────────────────────────────────────────────

export async function aiTransform({ source_path, prompt, strength = 0.75 }) {
  const { data } = await api.post("/ai", { source_path, prompt, strength });
  return data; // { ai_id, result_url, provider, ... }
}

// ─── Step 4: Animation ───────────────────────────────────────────────────────

export async function createAnimation({ source_path, motion = "walk", frame_count = 0 }) {
  const { data } = await api.post("/animation", { source_path, motion, frame_count });
  return data; // { session_id, frame_urls, ... }
}

export async function fetchMotions() {
  const { data } = await api.get("/animation/motions");
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
  const { data } = await api.post("/export", {
    source_path,
    character_name,
    action,
    cell_size,
    frame_count,
  });
  return data; // { sheet_url, json_url, frame_urls, metadata, ... }
}

// ─── Video: Upload + Frame Extraction ───────────────────────────────────────

export async function uploadVideo(file, onProgress) {
  const form = new FormData();
  form.append("file", file);
  const { data } = await api.post("/video/upload", form, {
    headers: { "Content-Type": "multipart/form-data" },
    onUploadProgress: (e) => {
      if (onProgress) onProgress(Math.round((e.loaded * 100) / e.total));
    },
  });
  return data; // { file_id, filename, url, info: { total_frames, fps, width, height } }
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
  const { data } = await api.post("/video/extract", {
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
  return data; // { session_id, frame_count, frame_urls, sheet_url, json_url, metadata }
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
    "/export/zip",
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
