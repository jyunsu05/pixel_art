import { useState, useCallback } from "react";
import {
  uploadImage,
  uploadBgRemoved,
  pixelateImage,
  applyChromakey,
  aiTransform,
  createAnimation,
  exportSpriteSheet,
  downloadZip,
  uploadVideo,
  extractVideoFrames,
} from "../services/api";

const INITIAL_STATE = {
  currentStep: 0,
  upload: null,
  bgRemoved: null,        // manual bg removal result (from canvas tool)
  pixel: null,
  chroma: null,
  ai: null,
  animation: null,
  export: null,
  // Video pipeline state
  videoFile: null,
  videoUpload: null,
  videoExtract: null,
  loading: false,
  error: null,
  uploadProgress: 0,
};

export function usePixelConverter() {
  const [state, setState] = useState(INITIAL_STATE);

  const setLoading = (loading) => setState((s) => ({ ...s, loading, error: null }));
  const setError = (error) => setState((s) => ({ ...s, loading: false, error }));

  // ── Step 1 ──────────────────────────────────────────────────────────────────
  const handleUpload = useCallback(async (file) => {
    setLoading(true);
    setState((s) => ({ ...s, uploadProgress: 0 }));
    try {
      const data = await uploadImage(file, (pct) =>
        setState((s) => ({ ...s, uploadProgress: pct }))
      );
      setState((s) => ({ ...s, upload: data, currentStep: 1, loading: false }));
      return data;
    } catch (e) {
      setError(e.response?.data?.detail || e.message);
    }
  }, []);

  // ── Step 1b: Upload canvas bg-removed PNG ────────────────────────────────
  const handleBgRemovedConfirm = useCallback(async (file) => {
    setLoading(true);
    try {
      const data = await uploadBgRemoved(file);
      setState((s) => ({ ...s, bgRemoved: data, currentStep: 2, loading: false }));
      return data;
    } catch (e) {
      setError(e.response?.data?.detail || e.message);
    }
  }, []);

  // ── Step 2 ──────────────────────────────────────────────────────────────────
  const handlePixelate = useCallback(
    async ({ pixel_size = 16, num_colors = 16, preview_scale = 8, auto_remove_bg = false, bg_model = "human" } = {}) => {
      if (!state.upload) return;
      setLoading(true);
      try {
        // If manual bg-removal was done, use that image (already has transparency)
        // Skip auto_remove_bg in that case
        const useBgRemoved = !!state.bgRemoved;
        const fileId = useBgRemoved ? state.bgRemoved.file_id : state.upload.file_id;
        const filename = useBgRemoved
          ? state.bgRemoved.filename
          : state.upload.filename;
        const data = await pixelateImage({
          file_id: fileId,
          filename,
          pixel_size,
          num_colors,
          preview_scale,
          auto_remove_bg: useBgRemoved ? false : auto_remove_bg,
          bg_model,
        });
        setState((s) => ({ ...s, pixel: data, currentStep: 2, loading: false }));
        return data;
      } catch (e) {
        setError(e.response?.data?.detail || e.message);
      }
    },
    [state.upload, state.bgRemoved]
  );

  // ── Step 3a: Chromakey ───────────────────────────────────────────────────────
  const handleChromakey = useCallback(
    async (options = {}) => {
      const sourcePath = state.pixel?.raw_url || state.upload?.url;
      if (!sourcePath) return;
      setLoading(true);
      try {
        const data = await applyChromakey({ source_path: sourcePath, ...options });
        setState((s) => ({ ...s, chroma: data, currentStep: 3, loading: false }));
        return data;
      } catch (e) {
        setError(e.response?.data?.detail || e.message);
      }
    },
    [state.pixel, state.upload]
  );

  // ── Step 3b: AI Transform ────────────────────────────────────────────────────
  const handleAiTransform = useCallback(
    async (options = {}) => {
      const sourcePath =
        state.chroma?.result_url ||
        state.pixel?.raw_url ||
        state.upload?.url;
      if (!sourcePath) return;
      setLoading(true);
      try {
        const data = await aiTransform({ source_path: sourcePath, ...options });
        setState((s) => ({ ...s, ai: data, currentStep: 3, loading: false }));
        return data;
      } catch (e) {
        setError(e.response?.data?.detail || e.message);
      }
    },
    [state.chroma, state.pixel, state.upload]
  );

  // ── Step 4: Animation ────────────────────────────────────────────────────────
  const handleAnimate = useCallback(
    async ({ motion = "walk", frame_count = 0 } = {}) => {
      const sourcePath =
        state.ai?.result_url ||
        state.chroma?.result_url ||
        state.pixel?.raw_url ||
        state.upload?.url;
      if (!sourcePath) return;
      setLoading(true);
      try {
        const data = await createAnimation({ source_path: sourcePath, motion, frame_count });
        setState((s) => ({ ...s, animation: data, currentStep: 4, loading: false }));
        return data;
      } catch (e) {
        setError(e.response?.data?.detail || e.message);
      }
    },
    [state.ai, state.chroma, state.pixel, state.upload]
  );

  // ── Step 5: Export ────────────────────────────────────────────────────────────
  const handleExport = useCallback(
    async ({ character_name = "Character", action = "walk", cell_size = 64 } = {}) => {
      const sourcePath =
        state.ai?.result_url ||
        state.chroma?.result_url ||
        state.pixel?.raw_url ||
        state.upload?.url;
      if (!sourcePath) return;
      setLoading(true);
      try {
        const data = await exportSpriteSheet({
          source_path: sourcePath,
          character_name,
          action,
          cell_size,
        });
        setState((s) => ({ ...s, export: data, currentStep: 5, loading: false }));
        return data;
      } catch (e) {
        setError(e.response?.data?.detail || e.message);
      }
    },
    [state.ai, state.chroma, state.pixel, state.upload]
  );

  const handleDownloadZip = useCallback(
    async ({ character_name = "Character", action = "walk", cell_size = 64 } = {}) => {
      const sourcePath =
        state.ai?.result_url ||
        state.chroma?.result_url ||
        state.pixel?.raw_url ||
        state.upload?.url;
      if (!sourcePath) return;
      try {
        await downloadZip({ source_path: sourcePath, character_name, action, cell_size });
      } catch (e) {
        setError(e.response?.data?.detail || e.message);
      }
    },
    [state.ai, state.chroma, state.pixel, state.upload]
  );

  // ── Video Upload ──────────────────────────────────────────────────────────
  const handleVideoUpload = useCallback(async (file) => {
    setLoading(true);
    setState((s) => ({ ...s, uploadProgress: 0, videoFile: { name: file.name, size: file.size } }));
    try {
      const data = await uploadVideo(file, (pct) =>
        setState((s) => ({ ...s, uploadProgress: pct }))
      );
      setState((s) => ({
        ...s,
        videoUpload: data,
        videoFile: { name: file.name, size: file.size, info: data.info },
        loading: false,
      }));
      return data;
    } catch (e) {
      setError(e.response?.data?.detail || e.message);
    }
  }, []);

  // ── Frame Extraction ─────────────────────────────────────────────────────
  const handleExtractFrames = useCallback(
    async (options = {}) => {
      if (!state.videoUpload) return;
      setLoading(true);
      try {
        const data = await extractVideoFrames({
          filename: state.videoUpload.filename,
          ...options,
        });
        setState((s) => ({ ...s, videoExtract: data, loading: false }));
        return data;
      } catch (e) {
        setError(e.response?.data?.detail || e.message);
      }
    },
    [state.videoUpload]
  );

  const reset = useCallback(() => setState(INITIAL_STATE), []);

  return {
    ...state,
    handleUpload,
    handleBgRemovedConfirm,
    handlePixelate,
    handleChromakey,
    handleAiTransform,
    handleAnimate,
    handleExport,
    handleDownloadZip,
    handleVideoUpload,
    handleExtractFrames,
    reset,
  };
}
