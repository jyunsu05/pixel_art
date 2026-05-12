/**
 * ChromakeyAiPanel — Step 3
 * Focuses on AI-powered pixel art style transformation.
 * Also retains the chromakey tool for manual color removal.
 */

import { useState, useEffect } from "react";
import { Wand2, Sparkles, RefreshCw, ExternalLink, CheckCircle, AlertCircle, Key } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { getAiStatus } from "../services/api";

const PROVIDER_INFO = {
  replicate: {
    label: "Replicate API",
    model: "fofr/sdxl-pixel-art",
    quality: "최상급",
    badge: "bg-purple-800 text-purple-200",
    signupUrl: "https://replicate.com",
    tokenEnv: "REPLICATE_API_TOKEN",
    description: "SDXL 기반 픽셀 아트 전용 모델. 가장 높은 품질.",
  },
  huggingface: {
    label: "HuggingFace API",
    model: "timbrooks/instruct-pix2pix",
    quality: "상급",
    badge: "bg-yellow-800 text-yellow-200",
    signupUrl: "https://huggingface.co",
    tokenEnv: "HF_API_TOKEN",
    description: "InstructPix2Pix 이미지 변환 모델. 무료 토큰 사용 가능.",
  },
  local: {
    label: "로컬 (API 키 없음)",
    model: "cv2.stylization",
    quality: "기본",
    badge: "bg-dark-600 text-dark-300",
    description: "API 키 없이 사용 가능. 도트 느낌은 다소 약할 수 있음.",
  },
};

export default function ChromakeyAiPanel({
  pixelatedUrl,
  onAiTransform,
  aiData,
  loading,
  disabled,
}) {
  const [strength, setStrength] = useState(0.8);
  const [provider, setProvider]   = useState(null);
  const [showKeyGuide, setShowKeyGuide] = useState(false);

  useEffect(() => {
    getAiStatus()
      .then((d) => setProvider(d.active))
      .catch(() => setProvider("local"));
  }, []);

  const info = PROVIDER_INFO[provider] || PROVIDER_INFO.local;

  const handleRun = () => {
    if (!pixelatedUrl) return;
    onAiTransform({ source_path: pixelatedUrl, strength });
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="step-badge bg-cyan-900 text-cyan-300 ring-2 ring-cyan-500">
          <Sparkles size={13} />
        </div>
        <div>
          <h2 className="text-lg font-bold text-gray-100">AI 픽셀 아트 변환</h2>
          <p className="text-xs text-dark-400 font-mono">AI Style Transfer → Game Sprite</p>
        </div>
      </div>

      {/* Provider Status */}
      {provider && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className={`rounded-lg border p-3 space-y-1 ${
            provider === "local"
              ? "bg-dark-700 border-dark-500"
              : "bg-pixel-900/20 border-pixel-700/50"
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {provider === "local" ? (
                <AlertCircle size={14} className="text-yellow-400" />
              ) : (
                <CheckCircle size={14} className="text-green-400" />
              )}
              <span className="text-xs font-bold text-gray-200">{info.label}</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${info.badge}`}>
                {info.quality}
              </span>
            </div>
            {provider === "local" && (
              <button
                onClick={() => setShowKeyGuide((v) => !v)}
                className="text-[10px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
              >
                <Key size={11} />
                API 키 설정하기
              </button>
            )}
          </div>
          <p className="text-[11px] text-dark-400">{info.description}</p>
          {info.model && (
            <p className="text-[10px] text-dark-500 font-mono">모델: {info.model}</p>
          )}
        </motion.div>
      )}

      {/* API Key Setup Guide */}
      <AnimatePresence>
        {showKeyGuide && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="bg-dark-800 border border-cyan-700/40 rounded-xl p-4 space-y-4 text-xs">
              <p className="font-bold text-cyan-300 text-sm">🔑 AI 키 설정 방법</p>

              {/* Option A: HuggingFace (Free) */}
              <div className="space-y-2">
                <p className="font-semibold text-yellow-300">
                  ✅ 추천 — HuggingFace (무료)
                </p>
                <ol className="text-dark-300 space-y-1 list-decimal pl-4">
                  <li>
                    <a href="https://huggingface.co/join" target="_blank"
                       className="text-cyan-400 underline flex items-center gap-1 inline-flex">
                      huggingface.co <ExternalLink size={10} />
                    </a>
                    &nbsp;에서 무료 회원가입
                  </li>
                  <li>Settings → Access Tokens → New Token 생성 (Read 권한)</li>
                  <li>
                    아래 파일을 메모장으로 열어서 수정:
                    <br />
                    <code className="bg-dark-600 px-1 rounded text-green-300 text-[10px]">
                      C:\Users\user\pixel-art-converter\backend\.env
                    </code>
                  </li>
                  <li>
                    <code className="bg-dark-600 px-1 rounded text-green-300 text-[10px]">
                      HF_API_TOKEN=hf_여기에붙여넣기
                    </code>
                    를 추가
                  </li>
                  <li>백엔드 서버 재시작</li>
                </ol>
              </div>

              {/* Option B: Replicate */}
              <div className="space-y-2">
                <p className="font-semibold text-purple-300">⭐ 최고 품질 — Replicate</p>
                <ol className="text-dark-300 space-y-1 list-decimal pl-4">
                  <li>
                    <a href="https://replicate.com" target="_blank"
                       className="text-cyan-400 underline flex items-center gap-1 inline-flex">
                      replicate.com <ExternalLink size={10} />
                    </a>
                    &nbsp;회원가입 (GitHub 로그인 가능)
                  </li>
                  <li>Account → API Tokens에서 토큰 복사</li>
                  <li>
                    .env 파일에
                    <code className="bg-dark-600 px-1 rounded text-green-300 text-[10px]">
                      {" "}REPLICATE_API_TOKEN=r8_xxxx
                    </code>
                    추가
                  </li>
                  <li>백엔드 서버 재시작</li>
                </ol>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Controls */}
      <div className="glass-card p-4 space-y-4">
        {/* Source preview */}
        {pixelatedUrl && (
          <div className="space-y-1">
            <p className="text-xs text-dark-400 font-mono">변환할 도트 이미지</p>
            <div className="image-checkerboard rounded-lg p-2 flex items-center justify-center"
                 style={{ minHeight: 80 }}>
              <img src={pixelatedUrl} alt="source" className="pixel-render max-h-28 object-contain" />
            </div>
          </div>
        )}

        {/* Strength */}
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs">
            <span className="font-semibold text-gray-300">변환 강도</span>
            <span className="text-pixel-400 font-mono font-bold">{Math.round(strength * 100)}%</span>
          </div>
          <input
            type="range" min={0.3} max={1.0} step={0.05} value={strength}
            onChange={(e) => setStrength(Number(e.target.value))}
            className="w-full h-1.5 bg-dark-500 rounded-full appearance-none cursor-pointer
                       [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4
                       [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full
                       [&::-webkit-slider-thumb]:bg-pixel-500 [&::-webkit-slider-thumb]:cursor-pointer"
          />
          <div className="flex justify-between text-[10px] text-dark-400 font-mono">
            <span>원본 유지</span><span>완전 재구성</span>
          </div>
        </div>

        <button
          className="w-full flex items-center justify-center gap-2 px-5 py-3
                     bg-gradient-to-r from-cyan-700 to-pixel-700 hover:from-cyan-600 hover:to-pixel-600
                     text-white font-bold rounded-xl transition-all active:scale-95
                     disabled:opacity-40 disabled:cursor-not-allowed"
          onClick={handleRun}
          disabled={loading || disabled || !pixelatedUrl}
        >
          {loading ? (
            <RefreshCw size={16} className="animate-spin" />
          ) : (
            <Sparkles size={16} />
          )}
          {loading
            ? "AI 변환 중..."
            : provider === "local"
            ? "로컬 스타일 변환"
            : "AI 픽셀 아트로 변환"}
        </button>

        {provider === "local" && !loading && (
          <p className="text-[11px] text-yellow-400/80 text-center">
            API 키를 설정하면 훨씬 좋은 결과를 얻을 수 있습니다
          </p>
        )}
      </div>

      {/* Result */}
      {aiData && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-3"
        >
          <div className="flex items-center gap-2">
            <CheckCircle size={14} className="text-green-400" />
            <p className="text-xs font-semibold text-green-300">
              AI 변환 완료 ({aiData.provider || provider})
            </p>
          </div>
          <div className="image-checkerboard rounded-xl p-3 flex items-center justify-center"
               style={{ minHeight: 160 }}>
            <img
              src={aiData.url || aiData.result_url}
              alt="AI pixel art"
              className="pixel-render max-h-64 object-contain"
            />
          </div>
        </motion.div>
      )}
    </div>
  );
}
