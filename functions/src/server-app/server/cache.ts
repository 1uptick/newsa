/**
 * Simple in-memory cache with TTL and manual invalidation.
 * - Cached data is returned until TTL expires or cache is invalidated
 * - Mutations (POST/PATCH/DELETE) invalidate relevant cache keys
 * - Client can force refresh with Cache-Control: no-cache header
 */

type CacheEntry<T> = {
  data: T;
  expiresAt: number;
  etag: string;
};

class AppCache {
  private cache = new Map<string, CacheEntry<unknown>>();
  private version = 0; // Global version for cache busting

  /** Generate a simple ETag based on data hash */
  private generateEtag(data: unknown): string {
    let str: string;
    try {
      str = JSON.stringify(data);
    } catch {
      return `"${this.version}-etag-fallback"`;
    }
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return `"${this.version}-${Math.abs(hash).toString(36)}"`;
  }

  /** Get cached data if valid, or null if expired/missing */
  get<T>(key: string): { data: T; etag: string } | null {
    const entry = this.cache.get(key) as CacheEntry<T> | undefined;
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    return { data: entry.data, etag: entry.etag };
  }

  /** Store data in cache with TTL (in seconds) */
  set<T>(key: string, data: T, ttlSeconds: number): string {
    const etag = this.generateEtag(data);
    this.cache.set(key, {
      data,
      expiresAt: Date.now() + ttlSeconds * 1000,
      etag,
    });
    return etag;
  }

  /** Invalidate a specific cache key */
  invalidate(key: string): void {
    this.cache.delete(key);
  }

  /** Invalidate all keys matching a prefix */
  invalidatePrefix(prefix: string): void {
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
      }
    }
  }

  /** Invalidate all cache entries */
  invalidateAll(): void {
    this.cache.clear();
    this.version++;
  }

  /** Check if client's ETag matches (for 304 responses) */
  matches(key: string, clientEtag: string | undefined): boolean {
    if (!clientEtag) return false;
    const entry = this.cache.get(key);
    return entry?.etag === clientEtag;
  }

  /** Get cache stats for debugging */
  stats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
    };
  }
}

export const cache = new AppCache();

// Cache key constants
// Use :data for row/list data (shorter TTL, invalidated on mutations).
// Use :structure for table metadata/headers (longer TTL, rarely invalidated) so responses can be built faster.
export const CACHE_KEYS = {
  NEWS: "news",
  NEWS_SOURCES: "news:sources",
  CAPITAL_KEYWORDS: "capital:keywords",
  CAPITAL_KEYWORDS_DATA: "capital:keywords:data",
  CAPITAL_KEYWORDS_STRUCTURE: "capital:keywords:structure",
  CAPITAL_DASHBOARD: "capital:dashboard",
  CAPITAL_DASHBOARD_DATA: "capital:dashboard:data",
  CAPITAL_DASHBOARD_STRUCTURE: "capital:dashboard:structure",
  CAPITAL_PENDING: "capital:pending",
  CAPITAL_APPROVED: "capital:approved",
  CAPITAL_STATS: "capital:stats",
  CAPITAL_ARTICLES: "capital:articles",
  /** Bumped when Capital articles list filter / shape changes (invalidates old server cache). */
  CAPITAL_ARTICLES_DATA: "capital:articles:data:v2",
  CAPITAL_ARTICLES_STRUCTURE: "capital:articles:structure",
  CAPITAL_ARTICLE: (id: string) => `capital:article:${id}`,
  ATFX_DASHBOARD_DATA: "atfx:dashboard:data",
  ATFX_DASHBOARD_STRUCTURE: "atfx:dashboard:structure",
  ATFX_PENDING: "atfx:pending",
  ATFX_APPROVED: "atfx:approved",
  /** Bumped when ATFX dashboard stats shape / queries change (invalidates old server cache). */
  ATFX_STATS: "atfx:stats:v7",
  ATFX_DASHBOARD_WORKSPACE: (uid: string) => `atfx:dashboard:workspace:${uid}`,
  ATFX_ARTICLES: "atfx:articles",
  ATFX_ARTICLES_DATA: "atfx:articles:data",
  ATFX_ARTICLES_STRUCTURE: "atfx:articles:structure",
  ATFX_ARTICLE: (id: string) => `atfx:article:${id}`,
  ATFX_MARKET_MAP: "atfx:market-map:latest",
  ATFX_QUICK_ANALYSIS: (symbol: string) => `atfx:quick-analysis:${symbol.trim().toUpperCase()}`,
  ONEUPTICK_ARTICLES_DATA: "oneuptick:articles:data",
  ONEUPTICK_TRADING_VIEW_DATA: "oneuptick:trading-view:data:v5",
  /** Bumped when SEO list filter logic changes (invalidates old cached lists). */
  ONEUPTICK_SEO_ARTICLES_DATA: "oneuptick:seo:articles:data:v8",
  TRENDING_TOPICS: "trending:topics",
  ADMIN_GROUPS: "admin:groups",
  ADMIN_INVITATIONS: "admin:invitations",
  ADMIN_USERS: "admin:users",
} as const;

// TTL values in seconds
export const CACHE_TTL = {
  NEWS: 60,            // 1 minute
  NEWS_SOURCES: 300,   // 5 minutes
  CAPITAL: 120,        // 2 minutes (data)
  CAPITAL_STRUCTURE: 600, // 10 minutes (table structure / field list)
  ATFX_DASHBOARD_WORKSPACE: 60, // 1 minute (per-user group history bundle)
  ADMIN: 60,           // 1 minute
} as const;
