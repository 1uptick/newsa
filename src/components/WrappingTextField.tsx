import React from "react";

const baseClass =
  "w-full px-3 py-2 text-sm border border-slate-300 rounded-lg resize-y disabled:opacity-50 whitespace-pre-wrap break-words [field-sizing:content] min-h-[2.5rem]";

/** Textarea that wraps long lines and grows with content (where supported). */
export function WrappingTextField({
  className = "",
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`${baseClass} ${className}`.trim()} {...props} />;
}
