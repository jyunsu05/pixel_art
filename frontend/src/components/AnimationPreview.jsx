import { useState, useEffect, useRef } from "react";
import { Play, Pause, SkipBack, RefreshCw, Film } from "lucide-react";
import { motion } from "framer-motion";

const MOTIONS = ["idle", "walk", "attack", "jump", "hurt"];
const MOTION_LABELS = {
  idle: "대기 (Idle)",
  walk: "걷기 (Walk)",
  attack: "공격 (Attack)",
  jump: "점프 (Jump)",
  hurt: "피격 (Hurt)",
};

export default function AnimationPreview({ onAnimate, animationData, loading, disabled }) {
  const [selectedMotion, setSelectedMotion] = useState("walk");
  const [frameCount, setFrameCount] = useState(6);   // actual frames to generate
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [fps, setFps] = useState(8);
  const intervalRef = useRef(null);

  const frames = animationData?.frame_urls || [];
  const totalFrames = frames.length;

  useEffect(() => {
    if (isPlaying && totalFrames > 0) {
      intervalRef.current = setInterval(() => {
        setCurrentFrame((f) => (f + 1) % totalFrames);
      }, 1000 / fps);
    } else {
      clearInterval(intervalRef.current);
    }
    return () => clearInterval(intervalRef.current);
  }, [isPlaying, totalFrames, fps]);

  useEffect(() => {
    setCurrentFrame(0);
    setIsPlaying(true);
  }, [animationData]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="step-badge bg-amber-900 text-amber-300 ring-2 ring-amber-500">4</div>
        <div>
          <h2 className="text-lg font-bold text-gray-100">애니메이션 프리뷰</h2>
          <p className="text-xs text-dark-400 font-mono">Animation Preview</p>
        </div>
      </div>

      <div className="glass-card p-4 space-y-4">
        {/* Motion selector */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-gray-300">모션 선택</p>
          <div className="flex flex-wrap gap-2">
            {MOTIONS.map((m) => (
              <button
                key={m}
                onClick={() => setSelectedMotion(m)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
                  selectedMotion === m
                    ? "bg-amber-700/60 border-amber-500 text-amber-200"
                    : "bg-dark-700 border-dark-500 text-dark-400 hover:border-dark-400"
                }`}
              >
                {MOTION_LABELS[m]}
              </button>
            ))}
          </div>
        </div>

        {/* Frame COUNT — 실제 생성할 프레임 수 */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs">
            <div>
              <span className="text-gray-300 font-semibold">프레임 수 (Frame Count)</span>
              <span className="text-dark-400 ml-2 font-mono text-[10px]">생성할 장수</span>
            </div>
            <span className="text-amber-400 font-mono font-bold">{frameCount} frames</span>
          </div>
          <input
            type="range" min={2} max={12} step={1} value={frameCount}
            onChange={(e) => setFrameCount(Number(e.target.value))}
            className="w-full h-1.5 bg-dark-500 rounded-full appearance-none cursor-pointer
                       [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4
                       [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full
                       [&::-webkit-slider-thumb]:bg-amber-500 [&::-webkit-slider-thumb]:cursor-pointer"
          />
          <div className="flex justify-between text-[10px] text-dark-400 font-mono">
            <span>2 (짧은 루프)</span><span>12 (부드러운 모션)</span>
          </div>
        </div>

        {/* FPS — 미리보기 재생 속도만 조절 */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs">
            <div>
              <span className="text-gray-300 font-semibold">미리보기 FPS</span>
              <span className="text-dark-400 ml-2 font-mono text-[10px]">재생 속도만</span>
            </div>
            <span className="text-pixel-400 font-mono">{fps} fps</span>
          </div>
          <input
            type="range" min={2} max={24} step={1} value={fps}
            onChange={(e) => setFps(Number(e.target.value))}
            className="w-full h-1.5 bg-dark-500 rounded-full appearance-none cursor-pointer
                       [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4
                       [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full
                       [&::-webkit-slider-thumb]:bg-amber-500 [&::-webkit-slider-thumb]:cursor-pointer"
          />
        </div>

        <button
          className="btn-primary w-full flex items-center justify-center gap-2 bg-amber-700 hover:bg-amber-600 focus:ring-amber-400"
          onClick={() => onAnimate({ motion: selectedMotion, frame_count: frameCount })}
          disabled={loading || disabled}
        >
          {loading ? <RefreshCw size={16} className="animate-spin" /> : <Film size={16} />}
          {loading ? "프레임 생성 중..." : `${frameCount}프레임 애니메이션 생성`}
        </button>
      </div>

      {/* Player */}
      {totalFrames > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card p-4 space-y-4"
        >
          {/* Main frame display */}
          <div className="image-checkerboard rounded-xl flex items-center justify-center" style={{ minHeight: 200 }}>
            <img
              key={currentFrame}
              src={frames[currentFrame]}
              alt={`Frame ${currentFrame}`}
              className="pixel-render max-h-48 object-contain"
              style={{ imageRendering: "pixelated" }}
            />
          </div>

          {/* Controls */}
          <div className="flex items-center justify-center gap-3">
            <button
              className="p-2 rounded-lg bg-dark-600 hover:bg-dark-500 text-gray-300 transition"
              onClick={() => { setCurrentFrame(0); setIsPlaying(false); }}
            >
              <SkipBack size={16} />
            </button>
            <button
              className="px-5 py-2 rounded-lg bg-amber-700 hover:bg-amber-600 text-white font-semibold
                         flex items-center gap-2 text-sm transition"
              onClick={() => setIsPlaying((v) => !v)}
            >
              {isPlaying ? <Pause size={16} /> : <Play size={16} />}
              {isPlaying ? "일시정지" : "재생"}
            </button>
          </div>

          {/* Frame strip */}
          <div className="flex gap-1 overflow-x-auto pb-1">
            {frames.map((url, i) => (
              <button
                key={i}
                onClick={() => { setCurrentFrame(i); setIsPlaying(false); }}
                className={`shrink-0 rounded border-2 transition-all overflow-hidden ${
                  i === currentFrame ? "border-amber-400" : "border-dark-500 hover:border-dark-400"
                }`}
                style={{ width: 48, height: 48 }}
              >
                <img
                  src={url}
                  alt={`Frame ${i}`}
                  className="pixel-render w-full h-full object-contain"
                  style={{ imageRendering: "pixelated" }}
                />
              </button>
            ))}
          </div>

          <p className="text-xs text-dark-400 font-mono text-center">
            Frame {currentFrame + 1} / {totalFrames} · {selectedMotion} · {fps}fps
          </p>
        </motion.div>
      )}
    </div>
  );
}
