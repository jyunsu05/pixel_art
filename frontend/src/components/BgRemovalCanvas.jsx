/**
 * BgRemovalCanvas — Magic Wand background removal tool.
 *
 * User clicks any background area on the image → that color region
 * is flood-filled transparent (client-side, instant preview).
 * Multiple clicks accumulate. "되돌리기" undoes the last click.
 * "도트 변환" sends the cleaned image to the backend.
 */

import { useRef, useEffect, useState, useCallback } from "react";
import { Wand2, RotateCcw, Trash2, Download, ArrowRight, RefreshCw } from "lucide-react";
import { motion } from "framer-motion";

export default function BgRemovalCanvas({ uploadedUrl, onConfirm, loading }) {
  const canvasRef = useRef(null);
  const historyRef = useRef([]); // stack of ImageData snapshots for undo
  const [tolerance, setTolerance] = useState(30);
  const [isReady, setIsReady] = useState(false);
  const [clickCount, setClickCount] = useState(0);

  // Load uploaded image onto canvas
  useEffect(() => {
    if (!uploadedUrl) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = uploadedUrl;
    img.onload = () => {
      // Fit to max display size while keeping aspect ratio
      const MAX = 480;
      const scale = Math.min(1, MAX / Math.max(img.width, img.height));
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      historyRef.current = [];
      setClickCount(0);
      setIsReady(true);
    };
  }, [uploadedUrl]);

  // Magic wand: flood-fill starting at (px, py) with given tolerance
  const floodFill = useCallback((px, py, tol) => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const { width, height } = canvas;

    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;

    // Save snapshot before modification
    historyRef.current.push(ctx.getImageData(0, 0, width, height));

    const idx = (x, y) => (y * width + x) * 4;
    const target = data.slice(idx(px, py), idx(px, py) + 4);

    // If clicked pixel is already transparent, skip
    if (target[3] < 10) {
      historyRef.current.pop();
      return;
    }

    const colorMatch = (i) => {
      const dr = data[i] - target[0];
      const dg = data[i + 1] - target[1];
      const db = data[i + 2] - target[2];
      return Math.sqrt(dr * dr + dg * dg + db * db) <= tol;
    };

    // BFS flood fill
    const visited = new Uint8Array(width * height);
    const stack = [[px, py]];
    visited[py * width + px] = 1;

    while (stack.length > 0) {
      const [x, y] = stack.pop();
      const i = idx(x, y);

      // Make transparent
      data[i] = 0;
      data[i + 1] = 0;
      data[i + 2] = 0;
      data[i + 3] = 0;

      const neighbors = [
        [x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1],
      ];
      for (const [nx, ny] of neighbors) {
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const ni = ny * width + nx;
        if (visited[ni]) continue;
        visited[ni] = 1;
        const nIdx = ni * 4;
        if (data[nIdx + 3] > 0 && colorMatch(nIdx)) {
          stack.push([nx, ny]);
        }
      }
    }

    ctx.putImageData(imageData, 0, 0);
    setClickCount((c) => c + 1);
  }, []);

  const handleCanvasClick = useCallback(
    (e) => {
      if (!isReady) return;
      const canvas = canvasRef.current;
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const px = Math.round((e.clientX - rect.left) * scaleX);
      const py = Math.round((e.clientY - rect.top) * scaleY);
      floodFill(px, py, tolerance);
    },
    [isReady, tolerance, floodFill]
  );

  const handleUndo = () => {
    if (historyRef.current.length === 0) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const prev = historyRef.current.pop();
    ctx.putImageData(prev, 0, 0);
    setClickCount((c) => Math.max(0, c - 1));
  };

  const handleReset = () => {
    if (historyRef.current.length === 0) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const first = historyRef.current[0];
    historyRef.current = [];
    ctx.putImageData(first, 0, 0);
    setClickCount(0);
  };

  // Export canvas as PNG blob and call parent
  const handleConfirm = () => {
    const canvas = canvasRef.current;
    canvas.toBlob((blob) => {
      const file = new File([blob], "bg_removed.png", { type: "image/png" });
      onConfirm(file);
    }, "image/png");
  };

  // Local PNG download
  const handleDownload = () => {
    const canvas = canvasRef.current;
    const link = document.createElement("a");
    link.download = "bg_removed.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="step-badge bg-teal-900 text-teal-300 ring-2 ring-teal-500">
          <Wand2 size={14} />
        </div>
        <div>
          <h2 className="text-lg font-bold text-gray-100">배경 직접 제거</h2>
          <p className="text-xs text-dark-400 font-mono">Magic Wand — Click to Remove</p>
        </div>
      </div>

      {/* How-to */}
      <div className="bg-teal-900/20 border border-teal-700/40 rounded-lg p-3 text-xs text-teal-200 space-y-0.5">
        <p className="font-semibold text-teal-300 mb-1">🖱️ 사용 방법</p>
        <p>1. 아래 이미지의 <span className="text-white font-semibold">배경 부분을 클릭</span>하면 해당 색상이 제거됩니다.</p>
        <p>2. 여러 번 클릭해서 남은 배경을 모두 지울 수 있습니다.</p>
        <p>3. 허용 범위를 높이면 비슷한 색상까지 한 번에 제거됩니다.</p>
        <p>4. 완료 후 <span className="text-white font-semibold">"도트 변환 진행"</span> 버튼을 누르세요.</p>
      </div>

      {/* Tolerance */}
      <div className="glass-card p-3 space-y-1.5">
        <div className="flex justify-between text-xs">
          <span className="font-semibold text-gray-300">색상 허용 범위 (Tolerance)</span>
          <span className="text-teal-400 font-mono font-bold">{tolerance}</span>
        </div>
        <input
          type="range" min={5} max={100} step={5} value={tolerance}
          onChange={(e) => setTolerance(Number(e.target.value))}
          className="w-full h-1.5 bg-dark-500 rounded-full appearance-none cursor-pointer
                     [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4
                     [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full
                     [&::-webkit-slider-thumb]:bg-teal-500 [&::-webkit-slider-thumb]:cursor-pointer"
        />
        <div className="flex justify-between text-[10px] text-dark-400 font-mono">
          <span>낮음 (정밀 선택)</span><span>높음 (넓게 제거)</span>
        </div>
      </div>

      {/* Canvas area */}
      {uploadedUrl ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="space-y-2"
        >
          <div
            className="image-checkerboard rounded-xl overflow-hidden flex items-center justify-center relative cursor-crosshair"
            style={{ minHeight: 200 }}
          >
            <canvas
              ref={canvasRef}
              onClick={handleCanvasClick}
              style={{
                maxWidth: "100%",
                imageRendering: "pixelated",
                display: "block",
              }}
            />
            {/* Click hint overlay */}
            {clickCount === 0 && isReady && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="bg-dark-900/70 text-white text-xs px-3 py-2 rounded-lg font-semibold">
                  배경을 클릭해서 제거하세요
                </div>
              </div>
            )}
          </div>

          {/* Action bar */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleUndo}
              disabled={historyRef.current?.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-dark-600 hover:bg-dark-500
                         text-xs font-semibold text-gray-300 border border-dark-500 transition
                         disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <RotateCcw size={13} />
              되돌리기
            </button>
            <button
              onClick={handleReset}
              disabled={clickCount === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-dark-600 hover:bg-dark-500
                         text-xs font-semibold text-gray-300 border border-dark-500 transition
                         disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Trash2 size={13} />
              전체 초기화
            </button>
            <button
              onClick={handleDownload}
              disabled={!isReady}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-dark-600 hover:bg-dark-500
                         text-xs font-semibold text-gray-300 border border-dark-500 transition ml-auto"
            >
              <Download size={13} />
              PNG 저장
            </button>
          </div>

          {clickCount > 0 && (
            <p className="text-xs text-teal-400 font-mono text-center">
              {clickCount}번 제거 완료 · 추가로 클릭하거나 아래 버튼으로 진행하세요
            </p>
          )}

          <button
            className="w-full flex items-center justify-center gap-2 px-5 py-3
                       bg-teal-700 hover:bg-teal-600 text-white font-bold rounded-xl
                       transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
            onClick={handleConfirm}
            disabled={loading}
          >
            {loading ? (
              <RefreshCw size={16} className="animate-spin" />
            ) : (
              <ArrowRight size={16} />
            )}
            {loading ? "처리 중..." : "이 이미지로 도트 변환 진행"}
          </button>
        </motion.div>
      ) : (
        <div className="image-checkerboard rounded-xl h-48 flex items-center justify-center text-dark-400 text-sm">
          먼저 1단계에서 이미지를 업로드해주세요
        </div>
      )}
    </div>
  );
}
