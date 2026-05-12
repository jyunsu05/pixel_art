import { useState } from "react";
import { Scissors, Sparkles, RefreshCw, ChevronDown, ChevronUp } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const CHROMA_COLORS = [
  { id: "green", label: "초록 (Green)", color: "#22c55e" },
  { id: "blue", label: "파랑 (Blue)", color: "#3b82f6" },
  { id: "red", label: "빨강 (Red)", color: "#ef4444" },
  { id: "magenta", label: "마젠타 (Magenta)", color: "#d946ef" },
];

export default function ChromakeyAiPanel({
  onChromakey,
  onAiTransform,
  chromaData,
  aiData,
  loading,
  disabled,
}) {
  const [chromaColor, setChromaColor] = useState("green");
  const [tolerance, setTolerance] = useState(30);
  const [feather, setFeather] = useState(1);
  const [spillReduction, setSpillReduction] = useState(true);
  const [aiPrompt, setAiPrompt] = useState(
    "pixel art game character sprite, 16-bit retro style, transparent background"
  );
  const [aiStrength, setAiStrength] = useState(0.75);
  const [showChroma, setShowChroma] = useState(true);
  const [showAi, setShowAi] = useState(true);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="step-badge bg-cyan-900 text-cyan-300 ring-2 ring-cyan-500">3</div>
        <div>
          <h2 className="text-lg font-bold text-gray-100">크로마키 · AI 변환</h2>
          <p className="text-xs text-dark-400 font-mono">Chromakey & AI Image-to-Image</p>
        </div>
      </div>

      {/* ── Chromakey section ──────────────────────────────────────────────── */}
      <div className="glass-card overflow-hidden">
        <button
          className="w-full flex items-center justify-between p-4 text-left hover:bg-dark-600/50 transition"
          onClick={() => setShowChroma((v) => !v)}
        >
          <div className="flex items-center gap-2">
            <Scissors size={16} className="text-cyan-400" />
            <span className="font-semibold text-sm">크로마키 배경 제거</span>
          </div>
          {showChroma ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>

        <AnimatePresence>
          {showChroma && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="px-4 pb-4 space-y-4">
                {/* Color preset */}
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-gray-300">배경 색상</p>
                  <div className="grid grid-cols-2 gap-2">
                    {CHROMA_COLORS.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => setChromaColor(c.id)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium
                          transition-all border ${
                            chromaColor === c.id
                              ? "border-white/40 bg-dark-500"
                              : "border-dark-500 bg-dark-700 hover:bg-dark-600"
                          }`}
                      >
                        <span
                          className="w-4 h-4 rounded-sm shrink-0"
                          style={{ backgroundColor: c.color }}
                        />
                        {c.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Tolerance slider */}
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-300 font-semibold">허용 범위 (Tolerance)</span>
                    <span className="text-pixel-400 font-mono">{tolerance}</span>
                  </div>
                  <input
                    type="range" min={0} max={80} step={5} value={tolerance}
                    onChange={(e) => setTolerance(Number(e.target.value))}
                    className="w-full h-1.5 bg-dark-500 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-cyan-500 [&::-webkit-slider-thumb]:cursor-pointer"
                  />
                </div>

                {/* Feather slider */}
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-300 font-semibold">경계 부드럽게 (Feather)</span>
                    <span className="text-pixel-400 font-mono">{feather}px</span>
                  </div>
                  <input
                    type="range" min={0} max={5} step={1} value={feather}
                    onChange={(e) => setFeather(Number(e.target.value))}
                    className="w-full h-1.5 bg-dark-500 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-cyan-500 [&::-webkit-slider-thumb]:cursor-pointer"
                  />
                </div>

                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <div
                    onClick={() => setSpillReduction((v) => !v)}
                    className={`w-10 h-5 rounded-full transition-colors relative ${
                      spillReduction ? "bg-pixel-600" : "bg-dark-500"
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                        spillReduction ? "translate-x-5" : "translate-x-0.5"
                      }`}
                    />
                  </div>
                  <span className="text-xs text-gray-300">스필 억제 (Spill Reduction)</span>
                </label>

                <button
                  className="btn-secondary w-full flex items-center justify-center gap-2 text-sm border-cyan-700 text-cyan-300 hover:bg-cyan-900/30"
                  onClick={() =>
                    onChromakey({ color: chromaColor, tolerance, spill_reduction: spillReduction, feather_radius: feather })
                  }
                  disabled={loading || disabled}
                >
                  {loading ? <RefreshCw size={14} className="animate-spin" /> : <Scissors size={14} />}
                  크로마키 적용
                </button>

                {chromaData && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                    <p className="text-xs text-dark-400 font-mono mb-1.5 text-center">결과 미리보기</p>
                    <div className="image-checkerboard rounded-lg p-2 flex items-center justify-center" style={{ minHeight: 100 }}>
                      <img src={chromaData.result_url} alt="Chroma result" className="pixel-render max-h-40 object-contain" />
                    </div>
                  </motion.div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── AI Transform section ───────────────────────────────────────────── */}
      <div className="glass-card overflow-hidden">
        <button
          className="w-full flex items-center justify-between p-4 text-left hover:bg-dark-600/50 transition"
          onClick={() => setShowAi((v) => !v)}
        >
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-purple-400" />
            <span className="font-semibold text-sm">AI 스타일 변환</span>
            <span className="text-[10px] bg-purple-900/60 text-purple-300 px-2 py-0.5 rounded-full font-mono">
              img2img
            </span>
          </div>
          {showAi ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>

        <AnimatePresence>
          {showAi && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="px-4 pb-4 space-y-4">
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-gray-300">프롬프트 (Prompt)</p>
                  <textarea
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    rows={3}
                    className="w-full text-xs bg-dark-800 border border-dark-500 rounded-lg p-3 text-gray-200
                               focus:outline-none focus:border-purple-500 resize-none font-mono placeholder-dark-400"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-300 font-semibold">변환 강도 (Strength)</span>
                    <span className="text-pixel-400 font-mono">{aiStrength.toFixed(2)}</span>
                  </div>
                  <input
                    type="range" min={0.1} max={1.0} step={0.05} value={aiStrength}
                    onChange={(e) => setAiStrength(Number(e.target.value))}
                    className="w-full h-1.5 bg-dark-500 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-purple-500 [&::-webkit-slider-thumb]:cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-dark-400 font-mono">
                    <span>원본 유지</span><span>완전 재생성</span>
                  </div>
                </div>

                <div className="bg-dark-800 border border-dark-600 rounded-lg p-3 text-xs text-dark-400 font-mono">
                  💡 API 키 없이 테스트 시 Mock 모드가 자동으로 사용됩니다.<br />
                  실제 AI 사용: 백엔드 .env에 REPLICATE_API_TOKEN 설정
                </div>

                <button
                  className="w-full flex items-center justify-center gap-2 px-5 py-2.5 
                             bg-purple-700 hover:bg-purple-600 text-white font-semibold rounded-lg
                             transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed text-sm"
                  onClick={() => onAiTransform({ prompt: aiPrompt, strength: aiStrength })}
                  disabled={loading || disabled}
                >
                  {loading ? <RefreshCw size={14} className="animate-spin" /> : <Sparkles size={14} />}
                  AI 변환 실행
                </button>

                {aiData && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                    <p className="text-xs text-dark-400 font-mono mb-1.5 text-center">
                      AI 결과 ({aiData.provider})
                    </p>
                    <div className="image-checkerboard rounded-lg p-2 flex items-center justify-center" style={{ minHeight: 100 }}>
                      <img src={aiData.result_url} alt="AI result" className="pixel-render max-h-40 object-contain" />
                    </div>
                  </motion.div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
