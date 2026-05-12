import { Check } from "lucide-react";
import { motion } from "framer-motion";

const STEPS = [
  { label: "업로드", sublabel: "Upload" },
  { label: "도트 생성", sublabel: "Pixelate" },
  { label: "크로마키 · AI", sublabel: "Chroma & AI" },
  { label: "애니메이션", sublabel: "Animation" },
  { label: "비디오→시트", sublabel: "Video Extract" },
  { label: "유니티 내보내기", sublabel: "Export" },
];

export default function StepIndicator({ currentStep }) {
  return (
    <div className="flex items-center justify-center gap-0 w-full overflow-x-auto pb-2">
      {STEPS.map((step, idx) => {
        const stepNum = idx + 1;
        const isDone = currentStep > idx;
        const isActive = currentStep === idx;
        const isFuture = currentStep < idx;

        return (
          <div key={idx} className="flex items-center">
            {/* Connector */}
            {idx > 0 && (
              <div
                className={`h-0.5 w-8 sm:w-14 transition-colors duration-500 ${
                  isDone ? "bg-pixel-500" : "bg-dark-500"
                }`}
              />
            )}

            {/* Step circle + label */}
            <div className="flex flex-col items-center gap-1.5">
              <motion.div
                className={`step-badge transition-colors duration-300 ${
                  isDone
                    ? "bg-pixel-600 text-white"
                    : isActive
                    ? "bg-pixel-700 text-pixel-300 ring-2 ring-pixel-400"
                    : "bg-dark-600 text-dark-400"
                }`}
                animate={isActive ? { scale: [1, 1.1, 1] } : { scale: 1 }}
                transition={{ repeat: isActive ? Infinity : 0, duration: 2 }}
              >
                {isDone ? <Check size={14} /> : stepNum}
              </motion.div>

              <div className="text-center hidden sm:block">
                <p
                  className={`text-[10px] font-semibold leading-tight ${
                    isDone
                      ? "text-pixel-400"
                      : isActive
                      ? "text-gray-100"
                      : "text-dark-400"
                  }`}
                >
                  {step.label}
                </p>
                <p className="text-[9px] text-dark-400 font-mono">{step.sublabel}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
