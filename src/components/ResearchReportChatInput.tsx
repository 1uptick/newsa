import React, { useCallback, useMemo, useRef } from "react";
import { Send, Square } from "lucide-react";
import { sanitizeHtml } from "../lib/html";

const SEND_DEBOUNCE_MS = 1500;

type ResearchReportChatInputProps = {
  value: string;
  htmlPreview?: string | null;
  onChange: (value: string) => void;
  onClearHtmlPreview?: () => void;
  onSend: () => void;
  onKill?: () => void;
  busy?: boolean;
  disabled?: boolean;
  placeholder?: string;
  inputRef?: React.RefObject<HTMLTextAreaElement | null>;
};

export function ResearchReportChatInput({
  value,
  htmlPreview,
  onChange,
  onClearHtmlPreview,
  onSend,
  onKill,
  busy = false,
  disabled = false,
  placeholder,
  inputRef,
}: ResearchReportChatInputProps) {
  const safeHtml = useMemo(
    () => (htmlPreview?.trim() ? sanitizeHtml(htmlPreview) : ""),
    [htmlPreview]
  );
  const inputDisabled = disabled || busy;
  const lastSubmitAtRef = useRef(0);

  const trySend = useCallback(() => {
    if (inputDisabled || !value.trim()) return;
    const now = Date.now();
    if (now - lastSubmitAtRef.current < SEND_DEBOUNCE_MS) return;
    lastSubmitAtRef.current = now;
    onSend();
  }, [inputDisabled, onSend, value]);

  const onEnterSend = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key !== "Enter" || e.shiftKey) return;
      e.preventDefault();
      e.stopPropagation();
      trySend();
    },
    [trySend]
  );

  return (
    <div
      className="research-chat-input-shell relative flex-1 min-w-0 flex flex-col rounded-xl border border-[#ff7900] bg-white focus-within:ring-2 focus-within:ring-[#ff7900] focus-within:border-[#ff7900] overflow-hidden min-h-[4.75rem]"
    >
        {safeHtml ? (
          <div className="relative shrink-0 border-b border-slate-200 bg-slate-50/80 pb-10">
            <div
              className="research-chat-input-html html-content px-3 py-2.5 text-sm text-slate-800 max-h-[min(35vh,320px)] overflow-y-auto overflow-x-hidden"
              dangerouslySetInnerHTML={{ __html: safeHtml }}
            />
            {onClearHtmlPreview ? (
              <button
                type="button"
                onClick={onClearHtmlPreview}
                disabled={disabled}
                className="absolute top-2 right-2 px-2 py-0.5 rounded-md text-[10px] font-semibold text-slate-500 bg-white/90 border border-slate-200 hover:text-slate-800 hover:bg-white disabled:opacity-50"
              >
                Plain text
              </button>
            ) : null}
          </div>
        ) : null}
        {!safeHtml ? (
          <textarea
            ref={inputRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={onEnterSend}
            rows={3}
            placeholder={placeholder}
            disabled={inputDisabled}
            className={`w-full resize-none overflow-y-auto bg-white px-3 py-2 text-sm text-slate-900 outline-none disabled:opacity-50 min-h-[4.75rem] border-0 pr-12 ${busy && onKill ? "pb-10" : ""}`}
          />
        ) : (
          <textarea
            ref={inputRef}
            value={value}
            readOnly
            tabIndex={0}
            aria-label="Research prompt preview"
            onKeyDown={onEnterSend}
            className="sr-only"
          />
        )}
      {busy && onKill ? (
        <button
          type="button"
          onClick={onKill}
          className="absolute bottom-2 right-2 flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wide text-white bg-red-600 hover:bg-red-700 shadow-sm transition-colors"
          aria-label="Stop generation"
        >
          <Square className="w-3 h-3 fill-current" />
          Stop
        </button>
      ) : (
        <button
          type="button"
          onClick={trySend}
          disabled={inputDisabled || !value.trim()}
          className="absolute bottom-2 right-2 flex items-center justify-center w-9 h-9 rounded-lg bg-[#ff7900] text-white hover:bg-[#e66d00] disabled:opacity-50 disabled:pointer-events-none transition-colors shadow-sm"
          aria-label="Send message"
        >
          <Send className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
