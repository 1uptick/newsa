import { useCallback, useDeferredValue, useMemo } from "react";
import {
  externalizeLinksInSanitizedHtml,
  getResearchReportCanvasHtml,
} from "../../../lib/html";
import { i18nTabLanguages, type ReportI18nContent, type ReportLanguage } from "../../../lib/atfxResearchReportOptions";
import { listReportSectionTitles } from "../../../lib/reportHtmlSections";
import {
  buildResearchReportDownloadDocument,
  researchReportDownloadFilename,
} from "../researchReportUtils";

export function useResearchReportCanvas(
  reportI18n: ReportI18nContent,
  activeLangTab: ReportLanguage,
  title: string
) {
  const canvasTabs = i18nTabLanguages(reportI18n);
  const activeBundle = reportI18n[activeLangTab];
  const activeHtml = activeBundle?.report_html ?? "";
  const deferredHtml = useDeferredValue(activeHtml);
  const activeTitle = activeBundle?.title || title;

  const displayHtml = useMemo(
    () =>
      deferredHtml
        ? externalizeLinksInSanitizedHtml(getResearchReportCanvasHtml(deferredHtml))
        : "",
    [deferredHtml]
  );

  const sectionTitles = useMemo(
    () => listReportSectionTitles(deferredHtml),
    [deferredHtml]
  );

  const downloadHtml = useCallback(() => {
    const raw = activeHtml.trim();
    if (!raw) return;
    const bodyHtml = externalizeLinksInSanitizedHtml(getResearchReportCanvasHtml(raw)).trim();
    if (!bodyHtml) return;

    const documentHtml = buildResearchReportDownloadDocument(activeTitle, bodyHtml);
    const blob = new Blob([documentHtml], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = researchReportDownloadFilename(activeTitle, activeLangTab);
    a.click();
    URL.revokeObjectURL(url);
  }, [activeHtml, activeLangTab, activeTitle]);

  return {
    canvasTabs,
    activeHtml,
    activeTitle,
    displayHtml,
    sectionTitles,
    downloadHtml,
  };
}
