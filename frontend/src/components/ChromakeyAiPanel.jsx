/**
 * AI 픽셀 아트 생성 패널
 *
 * 파이프라인:
 *  1. 사용자가 Colab SD WebUI URL 입력
 *  2. 뼈대 시트 (기본값 자동 로드) — ControlNet Canny 가이드
 *  3. 캐릭터 사진 업로드 — Reference-only 색감 추출
 *  4. 그리드 레이아웃 + 행 선택 (4×4 시트 지원)
 *  5. LoRA / 프롬프트 설정
 *  6. "생성" → N프레임 + 스프라이트 시트 반환
 */

import { useState, useRef, useEffect } from "react";
import {
  Sparkles, RefreshCw, CheckCircle, AlertCircle,
  Link, Upload, Download, ChevronDown, ChevronUp,
  Grid, Settings,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { checkSdStatus, generateAnimation, resolveAppUrl } from "../services/api";

/** Served by FastAPI — never rely on missing /public/skeleton_base.png (SPA would return HTML). */
const DEFAULT_SKELETON_URL = resolveAppUrl("/api/ai/skeleton-default");
const DEFAULT_SD_URL      = "http://127.0.0.1:7860";

async function fetchUrlAsImageFile(url, filename = "image.png") {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const blob = await resp.blob();
  if (!blob.size) throw new Error("empty body");
  const ct = (resp.headers.get("content-type") || blob.type || "").toLowerCase();
  if (ct.includes("text/html")) {
    throw new Error("received HTML instead of an image (wrong URL or SPA fallback)");
  }
  return new File([blob], filename, { type: blob.type || "image/png" });
}

// Direction labels for each row of the default 4×4 skeleton sheet
const ROW_LABELS = ["정면 (앞)", "3/4 뷰", "뒷면 (뒤)", "측면 (옆)"];

export default function ChromakeyAiPanel({
  uploadedUrl,
  onAiTransform,
  disabled,
  hideOuterTitle = false,
}) {
  // ── Connection ────────────────────────────────────────────────────────
  const [sdUrl,    setSdUrl]    = useState(DEFAULT_SD_URL);
  const [sdStatus, setSdStatus] = useState(null);
  const [checking, setChecking] = useState(false);

  // ── Skeleton sheet ────────────────────────────────────────────────────
  const [skeletonFile,    setSkeletonFile]    = useState(null);
  const [skeletonPreview, setSkeletonPreview] = useState(DEFAULT_SKELETON_URL);
  const [useDefaultSkel,  setUseDefaultSkel]  = useState(true);

  // Grid layout (for the default 4×4 sheet)
  const [isGrid,     setIsGrid]     = useState(true);
  const [sheetCols,  setSheetCols]  = useState(4);
  const [sheetRows,  setSheetRows]  = useState(4);
  const [rowIndex,   setRowIndex]   = useState(0);

  // ── Reference photo ───────────────────────────────────────────────────
  const [refPhotoFile,    setRefPhotoFile]    = useState(null);
  const [refPhotoPreview, setRefPhotoPreview] = useState(uploadedUrl || null);

  // ── LoRA ──────────────────────────────────────────────────────────────
  const [loraPixel,  setLoraPixel]  = useState("pixel_art");
  const [loraChibi,  setLoraChibi]  = useState("chibi_style");
  const [loraWeight, setLoraWeight] = useState(1.0);

  // ── Generation settings ───────────────────────────────────────────────
  const [extraPrompt, setExtraPrompt] = useState("");
  const [steps,       setSteps]       = useState(25);
  const [cfgScale,    setCfgScale]    = useState(7.5);
  const [cannyWeight,     setCannyWeight]     = useState(1.8);
  const [refWeight,       setRefWeight]       = useState(0.7);
  const [skelIsLineart,   setSkelIsLineart]   = useState(false);
  const [numFrames,   setNumFrames]   = useState(4);
  const [outputSize,  setOutputSize]  = useState(64);
  const [removeBg,    setRemoveBg]    = useState(true);
  const [useRefOnly,  setUseRefOnly]  = useState(true);
  const [advanced,    setAdvanced]    = useState(false);

  // ── Result ────────────────────────────────────────────────────────────
  const [result, setResult] = useState(null);
  const [busy,   setBusy]   = useState(false);
  const [error,  setError]  = useState(null);

  const skeletonInputRef = useRef();
  const refInputRef      = useRef();

  // Auto-load uploaded/bg-removed image into reference photo slot
  useEffect(() => {
    if (!uploadedUrl) return;
    setRefPhotoPreview(uploadedUrl);
    const refFetchUrl =
      uploadedUrl.startsWith("/") ? resolveAppUrl(uploadedUrl) : uploadedUrl;
    fetchUrlAsImageFile(refFetchUrl, "reference.png")
      .then((file) => setRefPhotoFile(file))
      .catch((err) => {
        console.warn("reference image fetch:", err?.message || err);
        setRefPhotoFile(null);
      });
  }, [uploadedUrl]);

  useEffect(() => {
    const t = setTimeout(() => handleCheckConnection(), 1200);
    return () => clearTimeout(t);
  }, [sdUrl]);

  // ── Helpers ───────────────────────────────────────────────────────────

  const handleCheckConnection = async () => {
    setChecking(true);
    try {
      const r = await checkSdStatus(sdUrl);
      setSdStatus(r);
    } catch {
      setSdStatus({ connected: false });
    } finally {
      setChecking(false);
    }
  };

  const handleSkeletonChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setSkeletonFile(file);
    setSkeletonPreview(URL.createObjectURL(file));
    setUseDefaultSkel(false);
  };

  const handleResetSkeleton = () => {
    setSkeletonFile(null);
    setSkeletonPreview(DEFAULT_SKELETON_URL);
    setUseDefaultSkel(true);
  };

  const handleRefChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setRefPhotoFile(file);
    setRefPhotoPreview(URL.createObjectURL(file));
  };

  const handleGenerate = async () => {
    if (!refPhotoFile) {
      setError("캐릭터 사진을 업로드해주세요.");
      return;
    }
    if (!useDefaultSkel && !skeletonFile) {
      setError("뼈대 시트를 업로드해주세요.");
      return;
    }

    // When using the default skeleton, fetch it as a Blob first
    let skelFile = skeletonFile;
    if (useDefaultSkel) {
      try {
        skelFile = await fetchUrlAsImageFile(DEFAULT_SKELETON_URL, "skeleton_base.png");
      } catch {
        setError("기본 뼈대 시트를 불러오지 못했습니다. 백엔드(8000)가 켜져 있는지 확인하거나 뼈대를 직접 업로드하세요.");
        return;
      }
    }

    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const data = await generateAnimation({
        skeleton_sheet:  skelFile,
        reference_photo: refPhotoFile,
        sd_url:          sdUrl,
        num_frames:      numFrames,
        extra_prompt:    extraPrompt,
        lora_pixel:      loraPixel,
        lora_chibi:      loraChibi,
        lora_weight:     loraWeight,
        steps,
        cfg_scale:       cfgScale,
        canny_weight:    cannyWeight,
        ref_weight:      refWeight,
        output_width:    outputSize,
        output_height:   outputSize,
        remove_bg:       removeBg,
        use_ref_only:    useRefOnly,
        sheet_cols:      isGrid ? sheetCols : 0,
        sheet_rows:      isGrid ? sheetRows : 1,
        row_index:       isGrid ? rowIndex  : 0,
        skel_is_lineart: skelIsLineart,
      });
      setResult(data);
      // Notify parent so the step shows as completed
      if (onAiTransform) onAiTransform(data);
    } catch (e) {
      setError(e.response?.data?.detail || e.message || "생성 실패");
    } finally {
      setBusy(false);
    }
  };

  const handleDownloadSheet = () => {
    if (!result?.sprite_sheet_url) return;
    const a = document.createElement("a");
    a.href = result.sprite_sheet_url;
    a.download = "sprite_sheet.png";
    a.click();
  };

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">

      {!hideOuterTitle && (
      <div className="flex items-center gap-3">
        <div className="step-badge bg-cyan-900 text-cyan-300 ring-2 ring-cyan-500">
          <Sparkles size={13} />
        </div>
        <div>
          <h2 className="text-lg font-bold text-gray-100">AI 도트 애니메이션 생성</h2>
          <p className="text-xs text-dark-400 font-mono">SD WebUI + ControlNet Canny + LoRA</p>
        </div>
      </div>
      )}

      {/* ── 1. SD WebUI URL ──────────────────────────────────────────── */}
      <div className="glass-card p-4 space-y-3">
        <p className="text-xs font-bold text-gray-300 flex items-center gap-1.5">
          <Link size={12} /> Stable Diffusion WebUI 주소
        </p>
        <div className="flex gap-2">
          <input
            type="text" value={sdUrl}
            onChange={(e) => setSdUrl(e.target.value)}
            placeholder="https://xxxx.ngrok-free.app 또는 http://127.0.0.1:7860"
            className="flex-1 bg-dark-700 border border-dark-500 rounded-lg px-3 py-2
                       text-sm text-gray-200 font-mono placeholder-dark-400 outline-none
                       focus:border-cyan-500 transition"
          />
          <button onClick={handleCheckConnection} disabled={checking}
            className="px-3 py-2 bg-dark-600 hover:bg-dark-500 border border-dark-500
                       rounded-lg text-xs font-semibold text-gray-300 transition whitespace-nowrap">
            {checking ? <RefreshCw size={13} className="animate-spin" /> : "연결 확인"}
          </button>
        </div>
        {sdStatus && (
          <div className={`flex flex-col gap-2 text-xs px-3 py-2 rounded-lg ${
            sdStatus.connected
              ? "bg-green-900/30 border border-green-700/40 text-green-300"
              : "bg-red-900/30 border border-red-700/40 text-red-300"
          }`}>
            <div className="flex items-center gap-2">
              {sdStatus.connected ? <CheckCircle size={13}/> : <AlertCircle size={13}/>}
              {sdStatus.connected
                ? `연결됨 — ${sdStatus.model || "unknown"}${sdStatus.rembg ? " · rembg ✓" : ""}`
                : "연결 실패"}
            </div>
            {!sdStatus.connected && sdStatus.error && (
              <p className="text-[10px] font-mono text-red-200/90 break-all pl-5 border-l border-red-700/50 ml-1">
                {sdStatus.error}
              </p>
            )}
            {!sdStatus.connected && (
              <ul className="text-[10px] text-dark-300 space-y-1 list-disc pl-5 mt-1">
                <li>Stability Matrix에서 WebUI <strong className="text-gray-200">Launch</strong> 후 브라우저 주소창 포트 확인 (보통 7860)</li>
                <li>실행 인수에 <code className="text-yellow-400">--api</code> 포함 여부 확인</li>
                <li>방화벽·VPN 끄고 재시도 · 회사 PC는 시스템 프록시가 localhost를 막을 수 있음 (백엔드에서 우회 적용함)</li>
              </ul>
            )}
          </div>
        )}
        <p className="text-[10px] text-dark-400">
          연결 확인은 이 앱의 FastAPI 서버가 위 주소로 직접 요청합니다. 브라우저만 열려 있으면 안 되고 WebUI 프로세스가 떠 있어야 합니다.
        </p>
      </div>

      {/* ── 2. Skeleton sheet ────────────────────────────────────────── */}
      <div className="glass-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold text-gray-300 flex items-center gap-1.5">
            <Grid size={12}/> 뼈대 시트 (ControlNet Canny 가이드)
          </p>
          {!useDefaultSkel && (
            <button onClick={handleResetSkeleton}
              className="text-[10px] text-cyan-400 hover:text-cyan-300 underline transition">
              기본값으로 초기화
            </button>
          )}
        </div>

        {/* Preview + upload */}
        <div className="flex gap-3 items-start">
          <div
            onClick={() => skeletonInputRef.current?.click()}
            className="image-checkerboard rounded-lg flex-1 h-28 flex items-center justify-center
                       cursor-pointer hover:opacity-80 transition overflow-hidden border-2
                       border-dashed border-dark-500 hover:border-cyan-600"
          >
            <img src={skeletonPreview} alt="skeleton"
              className="w-full h-full object-contain pixel-render"
              style={{ imageRendering: "pixelated" }} />
          </div>
          <input ref={skeletonInputRef} type="file" accept="image/*" hidden
            onChange={handleSkeletonChange} />

          <div className="shrink-0 space-y-2 text-[10px] text-dark-300">
            {useDefaultSkel && (
              <div className="bg-cyan-900/30 border border-cyan-700/40 text-cyan-300
                              px-2 py-1 rounded-lg text-[10px]">
                기본 뼈대 사용 중
              </div>
            )}
            <p className="text-dark-400">클릭하면 교체 가능</p>
          </div>
        </div>

        {/* Grid toggle */}
        <div className="flex items-center gap-3">
          <Toggle label="그리드 레이아웃" value={isGrid} onChange={setIsGrid}/>
          {isGrid && (
            <span className="text-[10px] text-dark-400 font-mono">
              {sheetCols}열 × {sheetRows}행
            </span>
          )}
        </div>

        {/* Grid config */}
        <AnimatePresence>
          {isGrid && (
            <motion.div initial={{height:0,opacity:0}} animate={{height:"auto",opacity:1}}
              exit={{height:0,opacity:0}} className="overflow-hidden">
              <div className="space-y-3 pt-1">
                <div className="grid grid-cols-2 gap-3">
                  <SliderRow label="열 수 (columns)" value={sheetCols} min={1} max={8} step={1}
                    display={sheetCols} unit="열" onChange={setSheetCols}/>
                  <SliderRow label="행 수 (rows)" value={sheetRows} min={1} max={8} step={1}
                    display={sheetRows} unit="행" onChange={setSheetRows}/>
                </div>

                {/* Row selector */}
                <div className="space-y-1.5">
                  <p className="text-[10px] text-dark-400">사용할 행 (애니메이션 방향)</p>
                  <div className="flex flex-wrap gap-1.5">
                    {Array.from({length: sheetRows}, (_, i) => (
                      <button key={i} onClick={() => setRowIndex(i)}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold transition border ${
                          rowIndex === i
                            ? "bg-cyan-700 border-cyan-500 text-white"
                            : "bg-dark-700 border-dark-500 text-dark-300 hover:border-cyan-600"
                        }`}>
                        {ROW_LABELS[i] ?? `행 ${i}`}
                      </button>
                    ))}
                  </div>
                  <p className="text-[10px] text-cyan-400 font-mono">
                    → 행 {rowIndex} 사용 ({sheetCols}프레임)
                  </p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── 3. Reference photo ───────────────────────────────────────── */}
      <div className="glass-card p-4 space-y-2">
        <p className="text-xs font-bold text-gray-300 flex items-center gap-1.5">
          <Upload size={12}/> 캐릭터 사진 (Reference-only 색감 추출)
        </p>
        <div
          onClick={() => refInputRef.current?.click()}
          className="image-checkerboard rounded-lg h-28 flex items-center justify-center
                     cursor-pointer hover:opacity-80 transition overflow-hidden border-2
                     border-dashed border-dark-500 hover:border-cyan-600"
        >
          {refPhotoPreview
            ? <img src={refPhotoPreview} alt="reference" className="w-full h-full object-contain" />
            : <div className="text-center text-dark-400 text-xs p-2">
                <Upload size={18} className="mx-auto mb-1" />
                클릭하여 캐릭터 사진 업로드
              </div>
          }
        </div>
        <input ref={refInputRef} type="file" accept="image/*" hidden onChange={handleRefChange} />
      </div>

      {/* ── 4. LoRA ───────────────────────────────────────────────────── */}
      <div className="glass-card p-4 space-y-3">
        <p className="text-xs font-bold text-gray-300 flex items-center gap-1.5">
          <Sparkles size={12} /> LoRA 설정
        </p>
        <div className="grid grid-cols-[1fr_1fr_80px] gap-2">
          <div className="space-y-1">
            <label className="text-[10px] text-dark-400">픽셀 아트 LoRA</label>
            <input value={loraPixel} onChange={(e) => setLoraPixel(e.target.value)}
              className="w-full bg-dark-700 border border-dark-500 rounded-lg px-2 py-1.5
                         text-xs text-gray-200 font-mono outline-none focus:border-cyan-500" />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] text-dark-400">치비 LoRA</label>
            <input value={loraChibi} onChange={(e) => setLoraChibi(e.target.value)}
              className="w-full bg-dark-700 border border-dark-500 rounded-lg px-2 py-1.5
                         text-xs text-gray-200 font-mono outline-none focus:border-cyan-500" />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] text-dark-400">가중치</label>
            <input type="number" value={loraWeight} min={0} max={1.5} step={0.1}
              onChange={(e) => setLoraWeight(Number(e.target.value))}
              className="w-full bg-dark-700 border border-dark-500 rounded-lg px-2 py-1.5
                         text-xs text-gray-200 font-mono outline-none focus:border-cyan-500" />
          </div>
        </div>
        <div className="bg-dark-700/40 text-[10px] font-mono text-cyan-400 px-2 py-1.5 rounded-lg">
          &lt;lora:{loraPixel}:{loraWeight.toFixed(1)}&gt;, &lt;lora:{loraChibi}:{loraWeight.toFixed(1)}&gt;
        </div>
        <div className="space-y-1">
          <label className="text-[10px] text-dark-400">추가 프롬프트 (선택)</label>
          <input value={extraPrompt} onChange={(e) => setExtraPrompt(e.target.value)}
            placeholder="예: blue hair, red clothes, sword"
            className="w-full bg-dark-700 border border-dark-500 rounded-lg px-3 py-2
                       text-xs text-gray-200 placeholder-dark-500 outline-none focus:border-cyan-500" />
        </div>
      </div>

      {/* ── 5. Advanced ───────────────────────────────────────────────── */}
      <div className="glass-card overflow-hidden">
        <button onClick={() => setAdvanced(v => !v)}
          className="w-full flex items-center justify-between px-4 py-3 text-xs font-semibold text-gray-400 hover:text-gray-200 transition">
          <span className="flex items-center gap-1.5"><Settings size={12}/> 고급 설정</span>
          {advanced ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}
        </button>
        <AnimatePresence>
          {advanced && (
            <motion.div initial={{height:0,opacity:0}} animate={{height:"auto",opacity:1}}
              exit={{height:0,opacity:0}} className="overflow-hidden">
              <div className="px-4 pb-4 pt-3 border-t border-dark-600 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <SliderRow label="프레임 수" value={numFrames} min={1} max={sheetCols || 8} step={1}
                    display={numFrames} unit="프레임" onChange={setNumFrames}/>
                  <SliderRow label="출력 크기" value={outputSize} min={32} max={128} step={16}
                    display={`${outputSize}×${outputSize}`} unit="px" onChange={setOutputSize}/>
                  <SliderRow label="샘플링 스텝" value={steps} min={10} max={50} step={5}
                    display={steps} unit="" onChange={setSteps}/>
                  <SliderRow label="CFG Scale" value={cfgScale} min={1} max={15} step={0.5}
                    display={cfgScale} unit="" onChange={setCfgScale}/>
                  <SliderRow label="ControlNet Canny" value={cannyWeight} min={0} max={2} step={0.05}
                    display={cannyWeight.toFixed(2)} unit="" onChange={setCannyWeight}/>
                  <SliderRow label="Reference 강도" value={refWeight} min={0} max={1} step={0.05}
                    display={refWeight.toFixed(2)} unit="" onChange={setRefWeight}/>
                </div>
                <div className="flex flex-col gap-2">
                  <Toggle label="배경 자동 제거 (rembg)" value={removeBg} onChange={setRemoveBg}/>
                  <Toggle label="Reference-only 사용 (색감 추출)" value={useRefOnly} onChange={setUseRefOnly}/>
                  <Toggle
                    label="뼈대가 이미 라인아트/실루엣 → 전처리 건너뜀 (module=none)"
                    value={skelIsLineart}
                    onChange={setSkelIsLineart}
                  />
                </div>
                <div className="bg-dark-700/40 text-[10px] font-mono text-yellow-400 px-3 py-2 rounded-lg">
                  ControlNet mode: <strong>2 (ControlNet is more important)</strong>
                  &nbsp;· weight: <strong>{cannyWeight.toFixed(2)}</strong>
                  &nbsp;· module: <strong>{skelIsLineart ? "none (lineart)" : "canny"}</strong>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Error ─────────────────────────────────────────────────────── */}
      {error && (
        <div className="bg-red-900/30 border border-red-700/40 rounded-lg px-3 py-2 text-xs text-red-300 flex items-center gap-2">
          <AlertCircle size={13}/>{error}
        </div>
      )}

      {/* ── Generate button ───────────────────────────────────────────── */}
      <button
        onClick={handleGenerate}
        disabled={busy || !refPhotoFile || disabled}
        className="w-full flex items-center justify-center gap-2 px-5 py-3
                   bg-gradient-to-r from-cyan-700 to-pixel-700 hover:from-cyan-600 hover:to-pixel-600
                   text-white font-bold rounded-xl transition-all active:scale-95
                   disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {busy ? <RefreshCw size={16} className="animate-spin"/> : <Sparkles size={16}/>}
        {busy
          ? `프레임 생성 중... (${numFrames}장 × SD API 호출)`
          : `${numFrames}프레임 픽셀 아트 생성`}
      </button>

      {busy && (
        <p className="text-[11px] text-center text-dark-400 animate-pulse">
          프레임 1장당 약 20-40초 소요 · SD WebUI가 열려있는 동안 유지됩니다
        </p>
      )}

      {/* ── Result ───────────────────────────────────────────────────── */}
      {result && (
        <motion.div initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} className="space-y-4">
          <div className="glass-card p-3 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-green-300 flex items-center gap-1.5">
                <CheckCircle size={13}/> 스프라이트 시트 완성 ({result.frame_count}프레임 · {result.frame_size}px)
              </p>
              <button onClick={handleDownloadSheet}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-pixel-700 hover:bg-pixel-600
                           text-white text-xs font-bold rounded-lg transition">
                <Download size={13}/> Unity용 PNG 다운로드
              </button>
            </div>
            <div className="image-checkerboard rounded-lg p-2 overflow-x-auto">
              <img src={result.sprite_sheet_url} alt="sprite sheet"
                className="pixel-render h-24 object-contain" style={{imageRendering:"pixelated"}}/>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold text-gray-400">개별 프레임</p>
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
              {result.frame_urls.map((url, i) => (
                <div key={i} className="space-y-0.5">
                  <div className="image-checkerboard rounded-lg overflow-hidden aspect-square">
                    <img src={url} alt={`frame ${i}`}
                      className="w-full h-full object-contain pixel-render"
                      style={{imageRendering:"pixelated"}}/>
                  </div>
                  <p className="text-[9px] text-dark-500 text-center font-mono">{i}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-dark-700/40 border border-dark-500/40 rounded-lg p-3 text-[11px] text-dark-300 space-y-1">
            <p className="font-semibold text-dark-200">🎮 Unity 사용 방법</p>
            <p>1. PNG를 Unity Assets에 드래그</p>
            <p>2. Sprite Mode → <strong className="text-white">Multiple</strong> 설정</p>
            <p>3. Sprite Editor → Slice → Grid by Cell Size →{" "}
              <strong className="text-white">
                {result.frame_size?.split("×")[0] || outputSize}×{result.frame_size?.split("×")[1] || outputSize}
              </strong></p>
            <p>4. Animator에서 각 슬라이스로 애니메이션 클립 생성</p>
          </div>
        </motion.div>
      )}
    </div>
  );
}

function SliderRow({ label, value, min, max, step, display, unit, onChange }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[10px]">
        <span className="text-dark-300">{label}</span>
        <span className="text-cyan-400 font-mono">{display} {unit}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1.5 bg-dark-500 rounded-full appearance-none cursor-pointer
                   [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3
                   [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full
                   [&::-webkit-slider-thumb]:bg-cyan-500 [&::-webkit-slider-thumb]:cursor-pointer"/>
    </div>
  );
}

function Toggle({ label, value, onChange }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none">
      <div onClick={() => onChange(!value)}
        className={`w-8 h-4 rounded-full transition-colors relative shrink-0 ${value ? "bg-cyan-600" : "bg-dark-500"}`}>
        <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${value ? "translate-x-4" : "translate-x-0.5"}`}/>
      </div>
      <span className="text-[11px] text-gray-400">{label}</span>
    </label>
  );
}
