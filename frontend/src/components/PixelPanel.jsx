import { useState } from "react";
import { Sliders, Zap, RefreshCw } from "lucide-react";
import { motion } from "framer-motion";

export default function PixelPanel({ onPixelate, pixelData, loading, disabled }) {
  const [pixelSize, setPixelSize] = useState(16);
  const [numColors, setNumColors] = useState(16);
  const [previewScale, setPreviewScale] = useState(8);

  const handleRun = () => {
    onPixelate({ pixel_size: pixelSize, num_colors: numColors, preview_scale: previewScale });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="step-badge bg-indigo-800 text-indigo-300 ring-2 ring-indigo-500">2</div>
        <div>
          <h2 className="text-lg font-bold text-gray-100">기초 도트 생성</h2>
          <p className="text-xs text-dark-400 font-mono">Pixelate & Color Reduction</p>
        </div>
      </div>

      <div className="glass-card p-4 space-y-4">
        <SliderField
          label="픽셀 해상도"
          sublabel="Pixel Size"
          value={pixelSize}
          min={4}
          max={64}
          step={4}
          onChange={setPixelSize}
          unit="px"
          description={`가로 ${pixelSize}픽셀로 축소 후 재구성`}
        />
        <SliderField
          label="색상 수 제한"
          sublabel="Palette Size"
          value={numColors}
          min={2}
          max={64}
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
          max={16}
          step={1}
          onChange={setPreviewScale}
          unit="×"
          description={`출력 미리보기: ${pixelSize * previewScale}×${pixelSize * previewScale}px`}
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
          {loading ? "처리 중..." : "도트로 변환"}
        </button>
      </div>

      {/* Result preview */}
      {pixelData && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-2"
        >
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <p className="text-xs text-dark-400 font-mono text-center">원본 픽셀 (Raw)</p>
              <div className="image-checkerboard rounded-lg p-2 flex items-center justify-center" style={{ minHeight: 100 }}>
                <img
                  src={pixelData.raw_url}
                  alt="Raw pixel art"
                  className="pixel-render max-h-32 object-contain"
                />
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-dark-400 font-mono text-center">확대 미리보기</p>
              <div className="image-checkerboard rounded-lg p-2 flex items-center justify-center" style={{ minHeight: 100 }}>
                <img
                  src={pixelData.preview_url}
                  alt="Preview"
                  className="pixel-render max-h-32 object-contain"
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
          {value}
          {unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
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
