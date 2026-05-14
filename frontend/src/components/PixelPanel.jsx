import { useState } from "react";
import { Sliders, Zap, RefreshCw, Sparkles } from "lucide-react";
import { motion } from "framer-motion";
import ChromakeyAiPanel from "./ChromakeyAiPanel";

export default function PixelPanel({
  onPixelate,
  pixelData,
  loading,
  disabled,
  uploadedUrl,
  onSdGenerateComplete,
}) {
  const [mode, setMode] = useState("classic");

  const [pixelSize, setPixelSize] = useState(48);
  const [numColors, setNumColors] = useState(16);
  const [previewScale, setPreviewScale] = useState(6);

  const handleRun = () => {
    onPixelate({ pixel_size: pixelSize, num_colors: numColors, preview_scale: previewScale });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="step-badge bg-indigo-800 text-indigo-300 ring-2 ring-indigo-500">
          <Sliders size={13} />
        </div>
        <div>
          <h2 className="text-lg font-bold text-gray-100">도트 아트 생성</h2>
          <p className="text-xs text-dark-400 font-mono">
            일반 픽셀화 또는 AI(뼈대 시트 + SD WebUI)
          </p>
        </div>
      </div>

      {/* Mode tabs */}
      <div className="flex gap-1 p-1 bg-dark-800/95 rounded-xl border border-dark-600">
        <button
          type="button"
          onClick={() => setMode("classic")}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-xs font-bold transition
            ${mode === "classic"
              ? "bg-indigo-700 text-white shadow-md"
              : "text-dark-400 hover:text-gray-300 hover:bg-dark-700"}`}
        >
          <Sliders size={14} />
          일반 픽셀화
        </button>
        <button
          type="button"
          onClick={() => setMode("ai")}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-xs font-bold transition
            ${mode === "ai"
              ? "bg-cyan-800 text-cyan-50 ring-1 ring-cyan-500 shadow-md"
              : "text-dark-400 hover:text-gray-300 hover:bg-dark-700"}`}
        >
          <Sparkles size={14} />
          AI 도트 (뼈대+SD)
        </button>
      </div>

      {mode === "classic" && (
        <>
          <div className="bg-indigo-900/20 border border-indigo-700/40 rounded-lg p-3 text-xs text-indigo-200 space-y-0.5">
            <p className="font-semibold text-indigo-300 mb-1">일반 픽셀화</p>
            <p>배경 제거된 캐릭터를 아웃라인 + 플랫 컬러 도트로 재구성합니다. 서버에서 필터·팔레트 처리만 합니다.</p>
          </div>

          <div className="glass-card p-4 space-y-4">
            <SliderField
              label="픽셀 해상도"
              sublabel="Art Width (pixels)"
              value={pixelSize}
              min={16}
              max={96}
              step={8}
              onChange={setPixelSize}
              unit="px"
              description={`캐릭터 가로 ${pixelSize} 픽셀로 재구성`}
            />
            <SliderField
              label="색상 수"
              sublabel="Palette Size"
              value={numColors}
              min={4}
              max={32}
              step={2}
              onChange={setNumColors}
              unit="colors"
              description={`최대 ${numColors}가지 색상으로 양자화`}
            />
            <SliderField
              label="미리보기 배율"
              sublabel="Preview Scale"
              value={previewScale}
              min={2}
              max={12}
              step={1}
              onChange={setPreviewScale}
              unit="×"
              description={`미리보기 출력: ${pixelSize * previewScale}×${pixelSize * previewScale}px`}
            />

            <button
              className="btn-primary w-full flex items-center justify-center gap-2"
              onClick={handleRun}
              disabled={loading || disabled}
            >
              {loading ? (
                <RefreshCw size={16} className="animate-spin" />
              ) : (
                <Zap size={16} />
              )}
              {loading ? "변환 중..." : "도트 아트로 변환"}
            </button>
          </div>

          {pixelData && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-3"
            >
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <p className="text-xs text-dark-400 font-mono text-center">원본 픽셀 (Raw)</p>
                  <div
                    className="image-checkerboard rounded-lg p-2 flex items-center justify-center"
                    style={{ minHeight: 100 }}
                  >
                    <img
                      src={`${pixelData.raw_url}?t=${Date.now()}`}
                      alt="Raw pixel art"
                      className="pixel-render max-h-40 object-contain"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-dark-400 font-mono text-center">확대 미리보기</p>
                  <div
                    className="image-checkerboard rounded-lg p-2 flex items-center justify-center"
                    style={{ minHeight: 100 }}
                  >
                    <img
                      src={`${pixelData.preview_url}?t=${Date.now()}`}
                      alt="Preview"
                      className="pixel-render max-h-40 object-contain"
                    />
                  </div>
                </div>
              </div>
              <div className="flex gap-4 text-xs text-dark-400 font-mono justify-center">
                <span>크기: {pixelData.dimensions.width}×{pixelData.dimensions.height}px</span>
                <span>색상: {pixelData.num_colors}가지</span>
              </div>
            </motion.div>
          )}
        </>
      )}

      {mode === "ai" && (
        <div className="space-y-3">
          <div className="bg-cyan-900/20 border border-cyan-700/40 rounded-lg p-3 text-xs text-cyan-100 space-y-1">
            <p className="font-semibold text-cyan-300">AI 도트 (뼈대+SD)</p>
            <p>
              로컬 또는 Colab에서 <strong className="text-white">Stable Diffusion WebUI</strong>를{" "}
              <code className="text-yellow-300">--api</code> 로 실행해야 합니다. 기본 뼈대 시트로 포즈를 맞추고,
              위 단계에서 올린 캐릭터 이미지(배경 제거 권장)로 색감을 가져옵니다.
            </p>
          </div>
          <ChromakeyAiPanel
            uploadedUrl={uploadedUrl || undefined}
            onAiTransform={onSdGenerateComplete}
            disabled={disabled}
            hideOuterTitle
          />
        </div>
      )}
    </div>
  );
}

function SliderField({ label, sublabel, value, min, max, step, onChange, unit, description }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-sm font-semibold text-gray-200">{label}</span>
          <span className="text-xs text-dark-400 font-mono ml-2">{sublabel}</span>
        </div>
        <span className="text-sm font-bold text-pixel-400 font-mono tabular-nums">
          {value}{unit}
        </span>
      </div>
      <input
        type="range"
        min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1.5 bg-dark-500 rounded-full appearance-none cursor-pointer
                   [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4
                   [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full
                   [&::-webkit-slider-thumb]:bg-pixel-500 [&::-webkit-slider-thumb]:cursor-pointer
                   [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-dark-900"
      />
      <p className="text-xs text-dark-400">{description}</p>
    </div>
  );
}
