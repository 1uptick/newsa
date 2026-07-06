export interface AtfxArticleItem {
  id: string;
  createdDate: string;
  titleTC: string;
  excerptTC: string;
  titleEN: string;
  excerptEN: string;
  /** Retail / institutional etc. from Airtable Category when configured. */
  category?: string;
  comments?: string;
}

export type AtfxArticleDetail = {
  titleTC: string;
  titleEN: string;
  excerptTC: string;
  excerptEN: string;
  contentTC: string;
  contentEN: string;
  /** Public image URL stored in Airtable (thumbnail field). */
  thumbnailUrl?: string;
};

export const proseArticleClass =
  "prose prose-slate max-w-none prose-headings:text-slate-900 prose-p:text-slate-700 prose-a:text-primary prose-strong:text-slate-900 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_table]:border [&_table]:border-slate-200 [&_img]:max-w-full [&_img]:h-auto";
