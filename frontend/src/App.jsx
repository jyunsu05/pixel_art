import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Gamepad2, RotateCcw, AlertCircle, ChevronRight, ChevronLeft } from "lucide-react";

import StepIndicator from "./components/StepIndicator";
import UploadZone from "./components/UploadZone";
import BgRemovalCanvas from "./components/BgRemovalCanvas";
import PixelPanel from "./components/PixelPanel";
import ChromakeyAiPanel from "./components/ChromakeyAiPanel";
import AnimationPreview from "./components/AnimationPreview";
import VideoFramePanel from "./components/VideoFramePanel";
import ExportPanel from "./components/ExportPanel";
import { usePixelConverter } from "./hooks/usePixelConverter";

const STEPS = ["upload", "pixel", "chromakey", "animation", "export"];

export default function App() {
  const {
    currentStep,
    upload,
    bgRemoved,
    pixel,
    chroma,
    ai,
    animation,
    export: exportData,
    videoFile,
    videoUpload,
    videoExtract,
    loading,
    error,
    uploadProgress,
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
  } = usePixelConverter();

  // For mobile: which panel is shown (same as currentStep but user can also navigate manually)
  const [visiblePanel, setVisiblePanel] = useState(0);

  const canGoNext = visiblePanel < 6 && currentStep > visiblePanel;
  const canGoPrev = visiblePanel > 0;

  return (
    <div className="min-h-screen flex flex-col">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <header className="border-b border-dark-600 bg-dark-800/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-pixel-700/60 flex items-center justify-center border border-pixel-600">
              <Gamepad2 size={20} className="text-pixel-400" />
            </div>
            <div>
              <h1 className="font-pixel text-sm text-gray-100 leading-none">
                Pixel Art Converter
              </h1>
              <p className="text-[10px] text-dark-400 font-mono mt-0.5">
                Unity Sprite Generator
              </p>
            </div>
          </div>

          <button
            onClick={reset}
            className="flex items-center gap-1.5 text-xs text-dark-400 hover:text-gray-300 transition px-3 py-1.5 rounded-lg hover:bg-dark-700"
          >
            <RotateCcw size={13} />
            초기화
          </button>
        </div>
      </header>

      {/* ── Step indicator ───────────────────────────────────────────────────── */}
      <div className="border-b border-dark-700 bg-dark-800/60 py-4 px-4">
        <div className="max-w-4xl mx-auto">
          <StepIndicator currentStep={currentStep} />
        </div>
      </div>

      {/* ── Error banner ────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="bg-red-900/40 border-b border-red-700/60 px-4 py-3"
          >
            <div className="max-w-4xl mx-auto flex items-center gap-2 text-red-300 text-sm">
              <AlertCircle size={16} className="shrink-0" />
              <span>{error}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Main layout ─────────────────────────────────────────────────────── */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-8">
        {/* Desktop: 2-column layout — left panel navigation + right content */}
        <div className="hidden lg:grid lg:grid-cols-[280px_1fr] gap-8">
          {/* Sidebar nav */}
          <aside className="space-y-2">
            {[
              { label: "업로드", desc: "이미지 업로드", step: 0, color: "pixel" },
              { label: "배경 제거", desc: "Magic Wand 클릭 선택", step: 1, color: "teal" },
              { label: "도트 생성", desc: "픽셀화 & 팔레트", step: 2, color: "indigo" },
              { label: "크로마키 · AI", desc: "AI 도트 재구성", step: 3, color: "cyan" },
              { label: "애니메이션", desc: "모션 프리뷰", step: 4, color: "amber" },
              { label: "비디오 → 시트", desc: "Video Frame Extraction", step: 5, color: "violet" },
              { label: "유니티 내보내기", desc: "Sprite Sheet + JSON", step: 6, color: "rose" },
            ].map((item) => {
              const isActive = visiblePanel === item.step;
              const isDone = currentStep > item.step;
              return (
                <button
                  key={item.step}
                  onClick={() => setVisiblePanel(item.step)}
                  className={`w-full text-left px-4 py-3 rounded-xl transition-all border
                    ${isActive ? "bg-dark-700 border-dark-500" : "border-transparent hover:bg-dark-800 hover:border-dark-600"}`}
                >
                  <div className="flex items-center gap-3">
                    <span className={`text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center
                      ${isDone ? "bg-pixel-600 text-white" : isActive ? "bg-dark-500 text-gray-300" : "bg-dark-700 text-dark-400"}`}>
                      {isDone ? "✓" : item.step + 1}
                    </span>
                    <div>
                      <p className={`text-sm font-semibold ${isActive ? "text-gray-100" : "text-gray-400"}`}>
                        {item.label}
                      </p>
                      <p className="text-xs text-dark-400 font-mono">{item.desc}</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </aside>

          {/* Panel content */}
          <div className="space-y-6">
            <AnimatePresence mode="wait">
              <motion.div
                key={visiblePanel}
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -16 }}
                transition={{ duration: 0.2 }}
              >
                <PanelContent
                  panel={visiblePanel}
                  upload={upload}
                  bgRemoved={bgRemoved}
                  pixel={pixel}
                  chroma={chroma}
                  ai={ai}
                  animation={animation}
                  exportData={exportData}
                  videoFile={videoFile}
                  videoUpload={videoUpload}
                  videoExtract={videoExtract}
                  loading={loading}
                  uploadProgress={uploadProgress}
                  currentStep={currentStep}
                  onUpload={handleUpload}
                  onBgRemovedConfirm={handleBgRemovedConfirm}
                  onPixelate={handlePixelate}
                  onChromakey={handleChromakey}
                  onAiTransform={handleAiTransform}
                  onAnimate={handleAnimate}
                  onExport={handleExport}
                  onDownloadZip={handleDownloadZip}
                  onVideoUpload={handleVideoUpload}
                  onExtractFrames={handleExtractFrames}
                />
              </motion.div>
            </AnimatePresence>

            {/* Next step hint */}
            {currentStep === visiblePanel + 1 && visiblePanel < 6 && (
              <motion.button
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center gap-2 text-sm text-pixel-400 hover:text-pixel-300 font-semibold transition"
                onClick={() => setVisiblePanel((v) => v + 1)}
              >
                다음 단계로 이동
                <ChevronRight size={16} />
              </motion.button>
            )}
          </div>
        </div>

        {/* Mobile: single column with prev/next navigation */}
        <div className="lg:hidden space-y-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={visiblePanel}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
            >
              <PanelContent
                panel={visiblePanel}
                upload={upload}
                bgRemoved={bgRemoved}
                pixel={pixel}
                chroma={chroma}
                ai={ai}
                animation={animation}
                exportData={exportData}
                videoFile={videoFile}
                videoUpload={videoUpload}
                videoExtract={videoExtract}
                loading={loading}
                uploadProgress={uploadProgress}
                currentStep={currentStep}
                onUpload={handleUpload}
                onBgRemovedConfirm={handleBgRemovedConfirm}
                onPixelate={handlePixelate}
                onChromakey={handleChromakey}
                onAiTransform={handleAiTransform}
                onAnimate={handleAnimate}
                onExport={handleExport}
                onDownloadZip={handleDownloadZip}
                onVideoUpload={handleVideoUpload}
                onExtractFrames={handleExtractFrames}
              />
            </motion.div>
          </AnimatePresence>

          <div className="flex justify-between">
            <button
              className="btn-secondary flex items-center gap-1.5 text-sm"
              onClick={() => setVisiblePanel((v) => v - 1)}
              disabled={!canGoPrev}
            >
              <ChevronLeft size={15} />
              이전
            </button>
            <button
              className="btn-primary flex items-center gap-1.5 text-sm"
              onClick={() => setVisiblePanel((v) => v + 1)}
              disabled={!canGoNext}
            >
              다음
              <ChevronRight size={15} />
            </button>
          </div>
        </div>
      </main>

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
      <footer className="border-t border-dark-700 py-4 px-4 text-center">
        <p className="text-xs text-dark-400 font-mono">
          Pixel Art Converter · FastAPI + React · Unity Ready
        </p>
      </footer>
    </div>
  );
}

function PanelContent({
  panel,
  upload, bgRemoved, pixel, chroma, ai, animation, exportData,
  videoFile, videoUpload, videoExtract,
  loading, uploadProgress, currentStep,
  onUpload, onBgRemovedConfirm, onPixelate, onChromakey, onAiTransform,
  onAnimate, onExport, onDownloadZip,
  onVideoUpload, onExtractFrames,
}) {
  switch (panel) {
    case 0:
      return (
        <UploadZone
          onUpload={onUpload}
          uploadedFile={upload}
          uploadProgress={uploadProgress}
          loading={loading && currentStep === 0}
        />
      );
    case 1:
      return (
        <BgRemovalCanvas
          uploadedUrl={upload?.url}
          onConfirm={onBgRemovedConfirm}
          loading={loading}
        />
      );
    case 2:
      return (
        <PixelPanel
          onPixelate={onPixelate}
          pixelData={pixel}
          loading={loading && currentStep === 2}
          disabled={!upload}
        />
      );
    case 3:
      return (
        <ChromakeyAiPanel
          onChromakey={onChromakey}
          onAiTransform={onAiTransform}
          chromaData={chroma}
          aiData={ai}
          loading={loading && currentStep <= 4}
          disabled={!upload}
        />
      );
    case 4:
      return (
        <AnimationPreview
          onAnimate={onAnimate}
          animationData={animation}
          loading={loading && currentStep === 5}
          disabled={!upload}
        />
      );
    case 5:
      return (
        <VideoFramePanel
          onVideoUpload={onVideoUpload}
          onExtractFrames={onExtractFrames}
          videoFile={videoFile}
          extractResult={videoExtract}
          loading={loading}
        />
      );
    case 6:
      return (
        <ExportPanel
          onExport={onExport}
          onDownloadZip={onDownloadZip}
          exportData={exportData}
          loading={loading && currentStep === 6}
          disabled={!upload}
        />
      );
    default:
      return null;
  }
}
