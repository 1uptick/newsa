import React, { useCallback, useEffect, useState } from "react";
import { ImageIcon, Loader2, X, ZoomIn } from "lucide-react";
import { BrandedSpinner } from "./BrandedSpinner";

type ResearchReportMetaPanelProps = {
  title?: string;
  seoExcerpt: string;
  thumbnailUrl: string;
  loading?: boolean;
};

export function ResearchReportMetaPanel({
  title = "",
  seoExcerpt,
  thumbnailUrl,
  loading = false,
}: ResearchReportMetaPanelProps) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const hasTitle = title.trim().length > 0;
  const hasExcerpt = seoExcerpt.trim().length > 0;
  const hasThumbnail = thumbnailUrl.trim().length > 0;

  const closeLightbox = useCallback(() => setLightboxOpen(false), []);

  useEffect(() => {
    if (!lightboxOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeLightbox();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [lightboxOpen, closeLightbox]);

  return (
    <>
      <div className="border-b border-slate-200 bg-slate-50/60 px-6 py-4 mb-2">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_220px] gap-4 items-start">
          <div className="min-w-0">
            {hasTitle ? (
              <>
                <p className="text-[10px] font-bold uppercase tracking-wider text-[#ff7900] mb-1.5">
                  Article Title
                </p>
                <h1 className="text-lg font-bold text-slate-900 leading-snug mb-3">{title}</h1>
              </>
            ) : null}
            <p className="text-[10px] font-bold uppercase tracking-wider text-[#ff7900] mb-1.5">
              SEO excerpt
            </p>
            {loading && !hasExcerpt ? (
              <p className="text-xs text-slate-500 flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                Generating SEO excerpt…
              </p>
            ) : hasExcerpt ? (
              <p className="text-sm text-slate-700 leading-relaxed">{seoExcerpt}</p>
            ) : (
              <p className="text-xs text-slate-400 italic">No excerpt yet.</p>
            )}
          </div>

          <div className="w-full max-w-[220px] md:justify-self-end">
            <p className="text-[10px] font-bold uppercase tracking-wider text-[#ff7900] mb-1.5">
              Thumbnail
            </p>
            <div className="relative aspect-[4/3] w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
              {loading && !hasThumbnail ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-slate-400">
                  <BrandedSpinner size="sm" />
                  <span className="text-[10px]">Generating…</span>
                </div>
              ) : hasThumbnail ? (
                <button
                  type="button"
                  onClick={() => setLightboxOpen(true)}
                  className="group absolute inset-0 h-full w-full cursor-zoom-in focus:outline-none focus-visible:ring-2 focus-visible:ring-[#ff7900] focus-visible:ring-offset-2"
                  aria-label="View thumbnail full size"
                >
                  <img
                    src={thumbnailUrl}
                    alt="Report thumbnail"
                    className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
                  />
                  <span className="pointer-events-none absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/10" />
                  <span className="pointer-events-none absolute bottom-2 right-2 flex items-center gap-1 rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
                    <ZoomIn className="w-3 h-3" aria-hidden />
                    View
                  </span>
                </button>
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-slate-300">
                  <ImageIcon className="w-8 h-8" />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {lightboxOpen && hasThumbnail ? (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
          onClick={closeLightbox}
          role="dialog"
          aria-modal="true"
          aria-label="Thumbnail preview"
        >
          <button
            type="button"
            onClick={closeLightbox}
            className="absolute top-4 right-4 z-10 rounded-lg bg-black/50 p-2 text-white transition-colors hover:bg-black/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
            aria-label="Close thumbnail preview"
          >
            <X className="w-5 h-5" />
          </button>
          <img
            src={thumbnailUrl}
            alt="Report thumbnail full size"
            className="max-h-[90vh] max-w-[min(92vw,720px)] rounded-lg object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      ) : null}
    </>
  );
}
