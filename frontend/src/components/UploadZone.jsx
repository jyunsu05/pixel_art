import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { Upload, Image as ImageIcon, X, CheckCircle2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const ACCEPTED = {
  "image/png": [".png"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/webp": [".webp"],
  "image/bmp": [".bmp"],
};

export default function UploadZone({ onUpload, uploadedFile, uploadProgress, loading }) {
  const [preview, setPreview] = useState(null);
  const [dragError, setDragError] = useState(null);

  const onDrop = useCallback(
    (accepted, rejected) => {
      setDragError(null);
      if (rejected.length > 0) {
        setDragError("지원하지 않는 형식이거나 파일이 너무 큽니다 (최대 20MB).");
        return;
      }
      if (accepted.length === 0) return;
      const file = accepted[0];
      const objectUrl = URL.createObjectURL(file);
      setPreview(objectUrl);
      onUpload(file);
    },
    [onUpload]
  );

  const { getRootProps, getInputProps, isDragActive, isDragReject } = useDropzone({
    onDrop,
    accept: ACCEPTED,
    maxFiles: 1,
    maxSize: 20 * 1024 * 1024,
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="step-badge bg-pixel-700 text-pixel-300 ring-2 ring-pixel-500">1</div>
        <div>
          <h2 className="text-lg font-bold text-gray-100">이미지 업로드</h2>
          <p className="text-xs text-dark-400 font-mono">Drag & Drop / Click to Upload</p>
        </div>
      </div>

      <div
        {...getRootProps()}
        className={`
          relative rounded-xl border-2 border-dashed transition-all duration-200 cursor-pointer
          min-h-[200px] flex flex-col items-center justify-center gap-4 p-8
          ${isDragActive && !isDragReject ? "border-pixel-500 bg-pixel-700/10" : ""}
          ${isDragReject || dragError ? "border-red-500 bg-red-900/10" : ""}
          ${!isDragActive && !dragError ? "border-dark-500 hover:border-pixel-600 bg-dark-700/50 hover:bg-dark-700/80" : ""}
        `}
      >
        <input {...getInputProps()} />

        <AnimatePresence mode="wait">
          {loading ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center gap-3 w-full"
            >
              <div className="w-10 h-10 rounded-full border-4 border-pixel-600 border-t-transparent animate-spin" />
              <p className="text-sm text-gray-300">업로드 중... {uploadProgress}%</p>
              <div className="w-full max-w-xs h-2 bg-dark-600 rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-pixel-500 rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${uploadProgress}%` }}
                  transition={{ duration: 0.3 }}
                />
              </div>
            </motion.div>
          ) : uploadedFile ? (
            <motion.div
              key="uploaded"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center gap-3"
            >
              <CheckCircle2 size={36} className="text-pixel-400" />
              <div className="text-center">
                <p className="font-semibold text-gray-100 text-sm">{uploadedFile.original_name}</p>
                <p className="text-xs text-dark-400 font-mono mt-0.5">
                  {(uploadedFile.size / 1024).toFixed(1)} KB · {uploadedFile.content_type}
                </p>
              </div>
              <p className="text-xs text-pixel-400">클릭하여 다시 업로드</p>
            </motion.div>
          ) : (
            <motion.div
              key="idle"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center gap-3 text-center pointer-events-none"
            >
              <motion.div
                animate={{ y: [0, -6, 0] }}
                transition={{ repeat: Infinity, duration: 2.5, ease: "easeInOut" }}
              >
                <Upload size={40} className="text-dark-400" />
              </motion.div>
              <div>
                <p className="font-semibold text-gray-300">
                  이미지를 드래그하거나 클릭하여 선택
                </p>
                <p className="text-xs text-dark-400 mt-1">
                  PNG · JPEG · WEBP · BMP · 최대 20MB
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {dragError && (
          <p className="text-xs text-red-400 mt-2">{dragError}</p>
        )}
      </div>

      {/* Preview */}
      {preview && uploadedFile && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="image-checkerboard rounded-lg overflow-hidden flex items-center justify-center p-2"
          style={{ maxHeight: 220 }}
        >
          <img
            src={preview}
            alt="Preview"
            className="max-h-48 object-contain rounded"
            style={{ imageRendering: "auto" }}
          />
        </motion.div>
      )}
    </div>
  );
}
