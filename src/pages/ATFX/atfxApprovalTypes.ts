export const LAZY_PAGE_SIZE = 12;

export type ArticleGenNotice = {
  variant: "success" | "error";
  title: string;
  detail: string;
  topicLabel: string;
  articleId?: string | null;
  titleEn?: string;
  titleTc?: string;
  thumbnailImagePrompt?: string;
  thumbnailImageModel?: string;
  thumbnailUrl?: string;
};

/** News drawer category toggles (same values as News page / Airtable). */
export const DRAWER_NEWS_CATEGORIES = ["FX", "Global", "Commodities"] as const;

export const RECENT_TOPIC_EXCLUDE_LIMIT = 16;
