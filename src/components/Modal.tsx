import React from "react";
import { X } from "lucide-react";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  /** Optional footer (e.g. Cancel + Save). Omit for no footer. */
  footer?: React.ReactNode;
  /** Max width class (default max-w-2xl). Use e.g. max-w-4xl for wider. */
  maxWidth?: string;
  /** Min height class (optional). */
  minHeight?: string;
  /** Disable closing (e.g. while submitting). */
  closeDisabled?: boolean;
  /** aria-label for the dialog (defaults to title). */
  ariaLabel?: string;
  /** Backdrop click closes; set false to disable. */
  closeOnBackdrop?: boolean;
  /** Extra class for the inner panel. */
  panelClassName?: string;
  /** Rendered in the header row, right-aligned before the close button (e.g. download actions). */
  headerActions?: React.ReactNode;
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  maxWidth = "max-w-2xl",
  minHeight,
  closeDisabled = false,
  ariaLabel,
  closeOnBackdrop = true,
  panelClassName = "",
  headerActions,
}: ModalProps) {
  if (!open) return null;

  const handleBackdropClick = () => {
    if (closeOnBackdrop && !closeDisabled) onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[200] min-h-screen overflow-y-auto overflow-x-hidden p-4 flex justify-center items-start sm:items-center bg-black/60 backdrop-blur-sm"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel ?? title}
    >
      <div
        className={`bg-white rounded-xl shadow-2xl w-full flex flex-col overflow-hidden max-h-[90vh] min-h-0 ${maxWidth} ${minHeight ?? ""} ${panelClassName}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between shrink-0 gap-2 px-4 py-3 border-b border-slate-300 bg-slate-50">
          <h3 className="text-sm font-semibold text-slate-800 truncate min-w-0 flex-1">{title}</h3>
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {headerActions}
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-slate-200 text-slate-600 transition-colors disabled:opacity-50"
              aria-label="Close"
              disabled={closeDisabled}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto overflow-x-hidden min-h-0 overscroll-contain">{children}</div>
        {footer != null ? (
          <div className="shrink-0 flex items-center justify-end gap-2 px-4 py-3 border-t border-slate-200 bg-slate-50">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}
