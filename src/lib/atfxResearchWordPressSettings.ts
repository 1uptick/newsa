export type AtfxWordPressCategory = {
  id: string;
  /** Display label in the publish modal, e.g. "Forex — EN". */
  label: string;
  /** WordPress category slug or numeric ID. */
  categoryId: string;
};

export const ATFX_RESEARCH_WORDPRESS_CATEGORIES_STORAGE_KEY = "atfx.research.wordpressCategories";

function newCategoryId(): string {
  return `wp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function readStoredWordPressCategories(): AtfxWordPressCategory[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(ATFX_RESEARCH_WORDPRESS_CATEGORIES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const row = item as Record<string, unknown>;
        const categoryId = typeof row.categoryId === "string" ? row.categoryId.trim() : "";
        if (!categoryId) return null;
        return {
          id: typeof row.id === "string" && row.id.trim() ? row.id.trim() : newCategoryId(),
          label: typeof row.label === "string" ? row.label.trim() : "",
          categoryId,
        } satisfies AtfxWordPressCategory;
      })
      .filter((row): row is AtfxWordPressCategory => row != null);
  } catch {
    return [];
  }
}

export function writeStoredWordPressCategories(categories: AtfxWordPressCategory[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ATFX_RESEARCH_WORDPRESS_CATEGORIES_STORAGE_KEY, JSON.stringify(categories));
  } catch {
    /* ignore */
  }
}

export function createWordPressCategory(categoryId: string, label = ""): AtfxWordPressCategory {
  return {
    id: newCategoryId(),
    label: label.trim(),
    categoryId: categoryId.trim(),
  };
}

export function wordPressCategoryDisplayLabel(category: AtfxWordPressCategory): string {
  return category.label.trim() || category.categoryId;
}
