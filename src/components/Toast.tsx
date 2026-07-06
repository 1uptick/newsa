import React from "react";
import { motion, AnimatePresence } from "motion/react";
import { Check, Info, AlertCircle, X } from "lucide-react";

export interface ToastProps {
  message: string | null;
  onClose?: () => void;
  variant?: "success" | "error" | "info";
  duration?: number;
}

export function Toast({ message, onClose, variant = "success", duration = 3000 }: ToastProps) {
  React.useEffect(() => {
    if (message && duration > 0 && onClose) {
      const timer = setTimeout(onClose, duration);
      return () => clearTimeout(timer);
    }
  }, [message, duration, onClose]);

  const variants = {
    success: {
      bg: "bg-white/90 dark:bg-slate-900/90",
      border: "border-emerald-500/20",
      iconBg: "bg-emerald-500",
      icon: <Check className="w-4 h-4 text-white" />,
      text: "text-slate-900 dark:text-white",
      shadow: "shadow-emerald-500/10",
    },
    error: {
      bg: "bg-white/90 dark:bg-slate-900/90",
      border: "border-red-500/20",
      iconBg: "bg-red-500",
      icon: <AlertCircle className="w-4 h-4 text-white" />,
      text: "text-slate-900 dark:text-white",
      shadow: "shadow-red-500/10",
    },
    info: {
      bg: "bg-white/90 dark:bg-slate-900/90",
      border: "border-blue-500/20",
      iconBg: "bg-blue-500",
      icon: <Info className="w-4 h-4 text-white" />,
      text: "text-slate-900 dark:text-white",
      shadow: "shadow-blue-500/10",
    },
  };

  const style = variants[variant];

  return (
    <AnimatePresence>
      {message && (
        <motion.div
          initial={{ opacity: 0, y: -12, x: 20, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, x: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8, x: 20, scale: 0.96 }}
          transition={{ type: "spring", damping: 25, stiffness: 350 }}
          className={`fixed top-20 right-6 z-[100] flex items-center gap-3.5 pl-3.5 pr-2.5 py-2.5 rounded-2xl ${style.bg} ${style.text} text-sm font-semibold shadow-[0_8px_30px_rgb(0,0,0,0.12)] border ${style.border} backdrop-blur-xl max-w-[min(24rem,calc(100vw-2rem))]`}
        >
          <div className={`flex items-center justify-center w-8 h-8 rounded-xl ${style.iconBg} shrink-0 shadow-lg shadow-black/5`}>
            {style.icon}
          </div>
          <span className="flex-1 leading-tight tracking-tight py-1">{message}</span>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-white/5 transition-colors shrink-0 text-slate-400 hover:text-slate-600 dark:hover:text-white"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
