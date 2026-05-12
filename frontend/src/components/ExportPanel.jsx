import { useState } from "react";
import { Download, Package, FileJson, Grid, RefreshCw, CheckCircle2, ExternalLink } from "lucide-react";
import { motion } from "framer-motion";

const ACTIONS = ["idle", "walk", "attack", "jump", "hurt"];
const CELL_SIZES = [16, 32, 48, 64, 96, 128];

export default function ExportPanel({ onExport, onDownloadZip, exportData, loading, disabled }) {
  const [characterName, setCharacterName] = useState("Character");
  const [action, setAction] = useState("walk");
  const [cellSize, setCellSize] = useState(64);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="step-badge bg-rose-900 text-rose-300 ring-2 ring-rose-500">5</div>
        <div>
          <h2 className="text-lg font-bold text-gray-100">유니티용 내보내기</h2>
          <p className="text-xs text-dark-400 font-mono">Unity Sprite Sheet Export</p>
        </div>
      </div>

      <div className="glass-card p-4 space-y-4">
        {/* Character name */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-gray-300">캐릭터 이름</label>
          <input
            value={characterName}
            onChange={(e) => setCharacterName(e.target.value.replace(/[^a-zA-Z0-9_]/g, ""))}
            placeholder="Character"
            className="w-full bg-dark-800 border border-dark-500 rounded-lg px-3 py-2
                       text-sm text-gray-200 font-mono focus:outline-none focus:border-rose-500"
          />
          <p className="text-xs text-dark-400 font-mono">
            출력 파일명: {characterName || "Character"}_{action}_00.png
          </p>
        </div>

        {/* Action */}
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-gray-300">액션 (Action)</p>
          <div className="flex flex-wrap gap-2">
            {ACTIONS.map((a) => (
              <button
                key={a}
                onClick={() => setAction(a)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border capitalize ${
                  action === a
                    ? "bg-rose-800/60 border-rose-500 text-rose-200"
                    : "bg-dark-700 border-dark-500 text-dark-400 hover:border-dark-400"
                }`}
              >
                {a}
              </button>
            ))}
          </div>
        </div>

        {/* Cell size */}
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-gray-300">셀 크기 (Cell Size)</p>
          <div className="flex flex-wrap gap-2">
            {CELL_SIZES.map((s) => (
              <button
                key={s}
                onClick={() => setCellSize(s)}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all border ${
                  cellSize === s
                    ? "bg-rose-800/60 border-rose-500 text-rose-200"
                    : "bg-dark-700 border-dark-500 text-dark-400 hover:border-dark-400"
                }`}
              >
                {s}×{s}
              </button>
            ))}
          </div>
          <p className="text-xs text-dark-400">유니티 Cell Size Slicing 기준값</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button
            className="btn-primary flex items-center justify-center gap-2 text-sm bg-rose-700 hover:bg-rose-600 focus:ring-rose-400"
            onClick={() => onExport({ character_name: characterName, action, cell_size: cellSize })}
            disabled={loading || disabled}
          >
            {loading ? <RefreshCw size={14} className="animate-spin" /> : <Grid size={14} />}
            시트 생성
          </button>
          <button
            className="btn-secondary flex items-center justify-center gap-2 text-sm"
            onClick={() => onDownloadZip({ character_name: characterName, action, cell_size: cellSize })}
            disabled={loading || disabled}
          >
            <Package size={14} />
            ZIP 다운로드
          </button>
        </div>
      </div>

      {/* Export result */}
      {exportData && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card p-4 space-y-4"
        >
          <div className="flex items-center gap-2 text-pixel-400">
            <CheckCircle2 size={18} />
            <span className="font-bold text-sm">내보내기 완료!</span>
          </div>

          {/* Sprite sheet preview */}
          <div className="space-y-1.5">
            <p className="text-xs text-dark-400 font-mono">스프라이트 시트 (Sprite Sheet)</p>
            <div className="image-checkerboard rounded-lg p-3 overflow-x-auto">
              <img
                src={exportData.sheet_url}
                alt="Sprite sheet"
                className="pixel-render h-20 object-contain"
                style={{ imageRendering: "pixelated", minWidth: "max-content" }}
              />
            </div>
          </div>

          {/* Metadata */}
          <div className="bg-dark-800 rounded-lg p-3 text-xs font-mono text-gray-300 space-y-1">
            <p className="text-pixel-400 font-semibold mb-2">📋 Unity Import 설정</p>
            <p>• Texture Type: <span className="text-amber-300">Sprite (2D and UI)</span></p>
            <p>• Sprite Mode: <span className="text-amber-300">Multiple</span></p>
            <p>• Filter Mode: <span className="text-amber-300">Point (no filter)</span></p>
            <p>• Compression: <span className="text-amber-300">None</span></p>
            <p>• Pixels Per Unit: <span className="text-amber-300">{exportData.cell_size}</span></p>
            <p>• Slice By: <span className="text-amber-300">Cell Size {exportData.cell_size}×{exportData.cell_size}</span></p>
          </div>

          {/* Download links */}
          <div className="grid grid-cols-2 gap-2">
            <a
              href={exportData.sheet_url}
              download
              className="flex items-center justify-center gap-2 px-3 py-2 bg-dark-600 hover:bg-dark-500
                         rounded-lg text-xs font-semibold text-gray-200 transition border border-dark-500"
            >
              <Download size={13} />
              Sheet PNG
            </a>
            <a
              href={exportData.json_url}
              download
              className="flex items-center justify-center gap-2 px-3 py-2 bg-dark-600 hover:bg-dark-500
                         rounded-lg text-xs font-semibold text-gray-200 transition border border-dark-500"
            >
              <FileJson size={13} />
              Meta JSON
            </a>
          </div>

          {/* Frame list */}
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-gray-300">
              개별 프레임 ({exportData.frame_count}개)
            </p>
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {exportData.frame_urls.map((url, i) => (
                <a
                  key={i}
                  href={url}
                  download
                  className="shrink-0 rounded border border-dark-500 hover:border-pixel-500 overflow-hidden transition"
                  style={{ width: 48, height: 48 }}
                  title={`${exportData.character_name}_${exportData.action}_${String(i).padStart(2, "0")}.png`}
                >
                  <img
                    src={url}
                    alt={`Frame ${i}`}
                    className="pixel-render w-full h-full object-contain"
                    style={{ imageRendering: "pixelated" }}
                  />
                </a>
              ))}
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}
