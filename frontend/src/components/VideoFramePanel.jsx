/**
 * VideoFramePanel — 영상에서 본 핵심 기능:
 * "영상을 프레임별로 쪼개서 스프라이트 시트가 자동으로 생성됩니다"
 *
 * Flow:
 *  1. AI로 생성된 애니메이션 동영상(mp4/gif/webm)을 업로드
 *  2. 프레임 추출 옵션 설정 (최대 프레임 수, 픽셀화 여부 등)
 *  3. 추출 실행 → 프레임 시퀀스 + 스프라이트 시트 자동 생성
 *  4. 결과물을 Unity로 바로 사용 가능
 */

import { useCallback, useState, useRef, useEffect } from "react";
import { useDropzone } from "react-dropzone";
import { Film, Upload, Play, Pause, RefreshCw, CheckCircle2, Download, FileJson, Grid, AlertCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const ACCEPTED_VIDEO = {
  "video/mp4": [".mp4"],
  "video/webm": [".webm"],
  "video/quicktime": [".mov"],
  "video/x-msvideo": [".avi"],
  "image/gif": [".gif"],
};

export default function VideoFramePanel({
  onVideoUpload,
  onExtractFrames,
  videoFile,
  extractResult,
  loading,
}) {
  const [maxFrames, setMaxFrames] = useState(8);
  const [applyPixelate, setApplyPixelate] = useState(false);
  const [pixelSize, setPixelSize] = useState(32);
  const [numColors, setNumColors] = useState(24);
  const [bgRemoval, setBgRemoval] = useState(false);
  const [characterName, setCharacterName] = useState("Character");
  const [action, setAction] = useState("walk");
  const [cellSize, setCellSize] = useState(64);
  const [dragError, setDragError] = useState(null);

  // Animation preview state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [fps, setFps] = useState(8);
  const intervalRef = useRef(null);
  const frames = extractResult?.frame_urls || [];

  useEffect(() => {
    if (isPlaying && frames.length > 0) {
      intervalRef.current = setInterval(() => {
        setCurrentFrame((f) => (f + 1) % frames.length);
      }, 1000 / fps);
    } else {
      clearInterval(intervalRef.current);
    }
    return () => clearInterval(intervalRef.current);
  }, [isPlaying, frames.length, fps]);

  useEffect(() => {
    if (extractResult) {
      setCurrentFrame(0);
      setIsPlaying(true);
    }
  }, [extractResult]);

  const onDrop = useCallback(
    (accepted, rejected) => {
      setDragError(null);
      if (rejected.length > 0) {
        setDragError("지원하지 않는 형식이거나 파일이 너무 큽니다 (최대 100MB).");
        return;
      }
      if (accepted.length > 0) onVideoUpload(accepted[0]);
    },
    [onVideoUpload]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED_VIDEO,
    maxFiles: 1,
    maxSize: 100 * 1024 * 1024,
  });

  const ACTIONS = ["idle", "walk", "attack", "jump", "hurt", "run"];
  const CELL_SIZES = [32, 48, 64, 96, 128];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="step-badge bg-violet-900 text-violet-300 ring-2 ring-violet-500">
          <Film size={14} />
        </div>
        <div>
          <h2 className="text-lg font-bold text-gray-100">비디오 → 스프라이트 시트</h2>
          <p className="text-xs text-dark-400 font-mono">Video Frame Extraction</p>
        </div>
        <span className="ml-auto text-[10px] bg-violet-900/60 text-violet-300 px-2 py-1 rounded-full font-mono">
          영상 참고 기능
        </span>
      </div>

      {/* Description */}
      <div className="bg-violet-900/20 border border-violet-700/40 rounded-lg p-3 text-xs text-violet-200 font-mono space-y-1">
        <p className="font-semibold text-violet-300">📽️ 이 기능은?</p>
        <p>ComfyUI, Kling AI 등으로 생성한 <span className="text-white">애니메이션 동영상(mp4/gif)</span>을 업로드하면</p>
        <p>프레임을 자동으로 분해하여 <span className="text-white">Unity용 스프라이트 시트</span>를 즉시 생성합니다.</p>
      </div>

      {/* Video Upload Zone */}
      <div
        {...getRootProps()}
        className={`
          rounded-xl border-2 border-dashed transition-all duration-200 cursor-pointer
          min-h-[140px] flex flex-col items-center justify-center gap-3 p-6
          ${isDragActive ? "border-violet-500 bg-violet-700/10" : "border-dark-500 hover:border-violet-600 bg-dark-700/50"}
        `}
      >
        <input {...getInputProps()} />
        {videoFile ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center gap-2 text-center"
          >
            <CheckCircle2 size={32} className="text-violet-400" />
            <p className="font-semibold text-gray-200 text-sm">{videoFile.name}</p>
            <p className="text-xs text-dark-400 font-mono">
              {(videoFile.size / (1024 * 1024)).toFixed(2)} MB
              {videoFile.info && ` · ${videoFile.info.total_frames}프레임 · ${videoFile.info.fps}fps · ${videoFile.info.width}×${videoFile.info.height}`}
            </p>
            <p className="text-xs text-violet-400">클릭하여 다른 파일 선택</p>
          </motion.div>
        ) : (
          <div className="flex flex-col items-center gap-2 text-center pointer-events-none">
            <motion.div
              animate={{ y: [0, -5, 0] }}
              transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
            >
              <Film size={36} className="text-dark-400" />
            </motion.div>
            <p className="font-semibold text-gray-400">애니메이션 동영상을 드래그하거나 클릭하여 업로드</p>
            <p className="text-xs text-dark-400">MP4 · WebM · MOV · AVI · GIF · 최대 100MB</p>
          </div>
        )}
        {dragError && <p className="text-xs text-red-400">{dragError}</p>}
      </div>

      {/* Options */}
      {videoFile && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card p-4 space-y-4"
        >
          {/* Max frames */}
          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="font-semibold text-gray-300">추출할 최대 프레임 수</span>
              <span className="text-violet-400 font-mono">{maxFrames} frames</span>
            </div>
            <input
              type="range" min={2} max={24} step={1} value={maxFrames}
              onChange={(e) => setMaxFrames(Number(e.target.value))}
              className="w-full h-1.5 bg-dark-500 rounded-full appearance-none cursor-pointer
                         [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4
                         [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full
                         [&::-webkit-slider-thumb]:bg-violet-500 [&::-webkit-slider-thumb]:cursor-pointer"
            />
            <p className="text-xs text-dark-400">스프라이트 시트의 총 프레임 수 (권장: 6~12)</p>
          </div>

          {/* Pixelate toggle */}
          <div className="space-y-3">
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <div
                onClick={() => setApplyPixelate((v) => !v)}
                className={`w-10 h-5 rounded-full transition-colors relative ${applyPixelate ? "bg-violet-600" : "bg-dark-500"}`}
              >
                <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${applyPixelate ? "translate-x-5" : "translate-x-0.5"}`} />
              </div>
              <div>
                <span className="text-sm font-semibold text-gray-200">프레임 픽셀화 적용</span>
                <p className="text-xs text-dark-400">각 프레임에 OpenCV 도트 변환 적용</p>
              </div>
            </label>

            {applyPixelate && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                className="pl-4 space-y-3 border-l-2 border-violet-700"
              >
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-300">픽셀 크기</span>
                    <span className="text-violet-400 font-mono">{pixelSize}px</span>
                  </div>
                  <input type="range" min={8} max={64} step={4} value={pixelSize}
                    onChange={(e) => setPixelSize(Number(e.target.value))}
                    className="w-full h-1.5 bg-dark-500 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-violet-500 [&::-webkit-slider-thumb]:cursor-pointer"
                  />
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-300">색상 수</span>
                    <span className="text-violet-400 font-mono">{numColors}</span>
                  </div>
                  <input type="range" min={4} max={64} step={4} value={numColors}
                    onChange={(e) => setNumColors(Number(e.target.value))}
                    className="w-full h-1.5 bg-dark-500 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-violet-500 [&::-webkit-slider-thumb]:cursor-pointer"
                  />
                </div>
              </motion.div>
            )}
          </div>

          {/* Background removal */}
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <div
              onClick={() => setBgRemoval((v) => !v)}
              className={`w-10 h-5 rounded-full transition-colors relative ${bgRemoval ? "bg-violet-600" : "bg-dark-500"}`}
            >
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${bgRemoval ? "translate-x-5" : "translate-x-0.5"}`} />
            </div>
            <div>
              <span className="text-sm font-semibold text-gray-200">어두운 배경 자동 제거</span>
              <p className="text-xs text-dark-400">검정/어두운 배경을 투명으로 변환</p>
            </div>
          </label>

          {/* Unity export options */}
          <div className="border-t border-dark-600 pt-3 space-y-3">
            <p className="text-xs font-semibold text-gray-300">Unity 내보내기 설정</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-gray-400">캐릭터 이름</label>
                <input
                  value={characterName}
                  onChange={(e) => setCharacterName(e.target.value.replace(/[^a-zA-Z0-9_]/g, ""))}
                  className="w-full bg-dark-800 border border-dark-500 rounded-lg px-3 py-1.5 text-xs text-gray-200 font-mono focus:outline-none focus:border-violet-500"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-gray-400">액션</label>
                <select
                  value={action}
                  onChange={(e) => setAction(e.target.value)}
                  className="w-full bg-dark-800 border border-dark-500 rounded-lg px-3 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-violet-500"
                >
                  {ACTIONS.map((a) => (
                    <option key={a} value={a}>{a}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-gray-400">셀 크기 (Cell Size)</p>
              <div className="flex gap-2">
                {CELL_SIZES.map((s) => (
                  <button
                    key={s}
                    onClick={() => setCellSize(s)}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all border ${
                      cellSize === s
                        ? "bg-violet-800/60 border-violet-500 text-violet-200"
                        : "bg-dark-700 border-dark-500 text-dark-400 hover:border-dark-400"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <p className="text-xs text-dark-400 font-mono">
              출력: {characterName || "Character"}_{action}_00.png · 시트 셀 {cellSize}×{cellSize}px
            </p>
          </div>

          {/* Extract button */}
          <button
            className="w-full flex items-center justify-center gap-2 px-5 py-3
                       bg-violet-700 hover:bg-violet-600 text-white font-bold rounded-lg
                       transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
            onClick={() =>
              onExtractFrames({
                max_frames: maxFrames,
                apply_pixelate: applyPixelate,
                pixel_size: pixelSize,
                num_colors: numColors,
                background_removal: bgRemoval,
                character_name: characterName,
                action,
                cell_size: cellSize,
              })
            }
            disabled={loading}
          >
            {loading ? (
              <RefreshCw size={16} className="animate-spin" />
            ) : (
              <Film size={16} />
            )}
            {loading ? "프레임 추출 중..." : "프레임 추출 & 스프라이트 시트 생성"}
          </button>
        </motion.div>
      )}

      {/* Result */}
      <AnimatePresence>
        {extractResult && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-card p-4 space-y-4"
          >
            <div className="flex items-center gap-2 text-violet-400">
              <CheckCircle2 size={18} />
              <span className="font-bold text-sm">
                {extractResult.frame_count}개 프레임 추출 완료!
              </span>
            </div>

            {/* Animated preview */}
            <div className="space-y-2">
              <p className="text-xs text-dark-400 font-mono">애니메이션 미리보기</p>
              <div className="image-checkerboard rounded-xl flex items-center justify-center" style={{ minHeight: 180 }}>
                {frames[currentFrame] && (
                  <img
                    key={currentFrame}
                    src={frames[currentFrame]}
                    alt={`frame ${currentFrame}`}
                    className="pixel-render max-h-44 object-contain"
                    style={{ imageRendering: "pixelated" }}
                  />
                )}
              </div>

              {/* Player controls */}
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <button
                    className="px-4 py-2 rounded-lg bg-violet-700 hover:bg-violet-600 text-white
                               flex items-center gap-2 text-sm font-semibold transition"
                    onClick={() => setIsPlaying((v) => !v)}
                  >
                    {isPlaying ? <Pause size={14} /> : <Play size={14} />}
                    {isPlaying ? "일시정지" : "재생"}
                  </button>
                  <span className="text-xs text-dark-400 font-mono">
                    {currentFrame + 1} / {frames.length}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-dark-400">FPS</span>
                  <input
                    type="range" min={2} max={24} step={1} value={fps}
                    onChange={(e) => setFps(Number(e.target.value))}
                    className="w-20 h-1.5 bg-dark-500 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-violet-500 [&::-webkit-slider-thumb]:cursor-pointer"
                  />
                  <span className="text-xs text-violet-400 font-mono w-8">{fps}</span>
                </div>
              </div>

              {/* Frame strip */}
              <div className="flex gap-1 overflow-x-auto pb-1">
                {frames.map((url, i) => (
                  <button
                    key={i}
                    onClick={() => { setCurrentFrame(i); setIsPlaying(false); }}
                    className={`shrink-0 rounded border-2 transition-all overflow-hidden ${
                      i === currentFrame ? "border-violet-400" : "border-dark-500 hover:border-dark-400"
                    }`}
                    style={{ width: 48, height: 48 }}
                  >
                    <img src={url} alt={`f${i}`} className="pixel-render w-full h-full object-contain" style={{ imageRendering: "pixelated" }} />
                  </button>
                ))}
              </div>
            </div>

            {/* Sprite sheet */}
            {extractResult.sheet_url && (
              <div className="space-y-2">
                <p className="text-xs text-dark-400 font-mono">스프라이트 시트 (Sprite Sheet)</p>
                <div className="image-checkerboard rounded-lg p-3 overflow-x-auto">
                  <img
                    src={extractResult.sheet_url}
                    alt="Sprite sheet"
                    className="pixel-render object-contain"
                    style={{ height: 80, imageRendering: "pixelated", minWidth: "max-content" }}
                  />
                </div>
              </div>
            )}

            {/* Unity import guide */}
            {extractResult.metadata && (
              <div className="bg-dark-800 rounded-lg p-3 text-xs font-mono text-gray-300 space-y-1">
                <p className="text-violet-300 font-semibold mb-2">📋 Unity Import 설정</p>
                <p>• Texture Type: <span className="text-amber-300">Sprite (2D and UI)</span></p>
                <p>• Sprite Mode: <span className="text-amber-300">Multiple</span></p>
                <p>• Filter Mode: <span className="text-amber-300">Point (no filter)</span></p>
                <p>• Compression: <span className="text-amber-300">None</span></p>
                <p>• Slice By Cell Size: <span className="text-amber-300">{extractResult.metadata.cell_size}×{extractResult.metadata.cell_size}</span></p>
                <p>• Total Frames: <span className="text-amber-300">{extractResult.metadata.frame_count}</span></p>
              </div>
            )}

            {/* Download links */}
            <div className="grid grid-cols-2 gap-2">
              {extractResult.sheet_url && (
                <a
                  href={extractResult.sheet_url} download
                  className="flex items-center justify-center gap-2 px-3 py-2 bg-dark-600 hover:bg-dark-500
                             rounded-lg text-xs font-semibold text-gray-200 transition border border-dark-500"
                >
                  <Download size={13} /> Sheet PNG
                </a>
              )}
              {extractResult.json_url && (
                <a
                  href={extractResult.json_url} download
                  className="flex items-center justify-center gap-2 px-3 py-2 bg-dark-600 hover:bg-dark-500
                             rounded-lg text-xs font-semibold text-gray-200 transition border border-dark-500"
                >
                  <FileJson size={13} /> Meta JSON
                </a>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
