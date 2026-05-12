import { useState, useCallback } from "react";
import {
  uploadImage,
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
  pixel: null,
  chroma: null,
  ai: null,
  animation: null,
  export: null,
  // Video pipeline state
  videoFile: null,        // { name, size, info } — client-side file meta
  videoUpload: null,      // server response after video upload
  videoExtract: null,     // frame extraction result
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

  // ── Step 2 ──────────────────────────────────────────────────────────────────
  const handlePixelate = useCallback(
    async ({ pixel_size = 16, num_colors = 16, preview_scale = 8 } = {}) => {
      if (!state.upload) return;
      setLoading(true);
      try {
        const data = await pixelateImage({
          file_id: state.upload.file_id,
          filename: state.upload.filename,
          pixel_size,
          num_colors,
          preview_scale,
        });
        setState((s) => ({ ...s, pixel: data, currentStep: 2, loading: false }));
        return data;
      } catch (e) {
        setError(e.response?.data?.detail || e.message);
      }
    },
    [state.upload]
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
