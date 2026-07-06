import React from "react";
import { Loader2, Trash2, X } from "lucide-react";
import { ContentAreaLoader } from "../../../components/ContentAreaLoader";
import {
  canDeleteOwnedHistoryItem,
  historyListTitle,
  historyOwnerLabel,
  type ReportListItem,
} from "../researchReportUtils";

type ResearchReportHistoryPanelProps = {
  open: boolean;
  loading?: boolean;
  reports: ReportListItem[];
  activeId: string | null;
  currentUserUid?: string | null;
  onClose: () => void;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
};

function ResearchReportHistoryPanelInner({
  open,
  loading = false,
  reports,
  activeId,
  currentUserUid = null,
  onClose,
  onSelect,
  onDelete,
}: ResearchReportHistoryPanelProps) {
  return (
    <>
      {open ? (
        <button
          type="button"
          className="absolute inset-0 z-20 bg-slate-900/20 transition-opacity"
          aria-label="Close history"
          onClick={onClose}
        />
      ) : null}

      <div
        id="report-history-panel"
        className={`absolute top-0 right-0 bottom-0 z-30 flex w-[80%] flex-col border-l border-slate-200 bg-white shadow-[8px_0_32px_rgba(15,23,42,0.12)] transition-transform duration-300 ease-out ${
          open ? "translate-x-0 pointer-events-auto" : "translate-x-full pointer-events-none"
        }`}
        aria-hidden={!open}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 shrink-0 bg-slate-50/90">
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-900">Group history</p>
            <p className="text-[11px] text-slate-500">Research articles from your ATFX team</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors shrink-0"
            aria-label="Close history"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto py-2">
          {loading && reports.length === 0 ? (
            <ContentAreaLoader variant="drawer" size="sm" message="Loading history…" pulseMessage={false} />
          ) : reports.length === 0 ? (
            <p className="px-4 py-3 text-sm text-slate-500">No saved reports</p>
          ) : (
            <>
              {loading ? (
                <p className="px-4 pb-2 text-[11px] text-slate-400 flex items-center gap-1.5">
                  <Loader2 className="w-3 h-3 animate-spin shrink-0" />
                  Refreshing…
                </p>
              ) : null}
              {reports.map((r) => {
                const ownerLabel = historyOwnerLabel(r.owner_email);
                const canDelete = canDeleteOwnedHistoryItem(r.owner_uid, currentUserUid);
                return (
                  <div
                    key={r.id}
                    className={`flex items-center gap-1 mx-2 px-2 py-1 rounded-lg hover:bg-slate-50 ${
                      r.id === activeId ? "bg-orange-50 ring-1 ring-[#ff7900]/20" : ""
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => onSelect(r.id)}
                      className="flex-1 text-left px-1 py-1.5 min-w-0"
                    >
                      <p className="text-sm font-medium text-slate-900 truncate">
                        {historyListTitle(r.title)}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {ownerLabel ? `${ownerLabel} · ` : ""}
                        {new Date(r.updated_at).toLocaleString()}
                      </p>
                    </button>
                    {canDelete ? (
                      <button
                        type="button"
                        onClick={() => onDelete(r.id)}
                        className="p-1.5 text-slate-400 hover:text-red-600 rounded"
                        aria-label="Delete report"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </>
          )}
        </div>
      </div>
    </>
  );
}

export const ResearchReportHistoryPanel = React.memo(ResearchReportHistoryPanelInner);
