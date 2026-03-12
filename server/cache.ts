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
    const str = JSON.stringify(data);
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
export const CACHE_KEYS = {
  NEWS: "news",
  NEWS_SOURCES: "news:sources",
  CAPITAL_KEYWORDS: "capital:keywords",
  CAPITAL_ARTICLES: "capital:articles",
  CAPITAL_ARTICLE: (id: string) => `capital:article:${id}`,
  ADMIN_GROUPS: "admin:groups",
  ADMIN_INVITATIONS: "admin:invitations",
  ADMIN_USERS: "admin:users",
} as const;

// TTL values in seconds
export const CACHE_TTL = {
  NEWS: 60,           // 1 minute
  NEWS_SOURCES: 300,  // 5 minutes
  CAPITAL: 120,       // 2 minutes
  ADMIN: 60,          // 1 minute
} as const;
