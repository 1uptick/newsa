# App Audit Report

Generated: March 2026

## Executive Summary

| Category | Critical | High | Medium | Low |
|----------|----------|------|--------|-----|
| **Security** | 1 (XSS) | 2 | 3 | 4 |
| **Performance** | 0 | 3 | 4 | 3 |
| **Stability** | 1 (fixed) | 2 | 3 | 3 |

---

## CRITICAL ISSUES

### 1. ~~`decoded` variable out of scope (FIXED)~~
**File:** `server.ts:777-804`  
**Status:** ✅ Fixed  
**Issue:** `decoded` was declared inside try block but used outside, causing `ReferenceError` on registration.

### 2. ~~Stored XSS via unsanitized HTML (FIXED)~~
**File:** `src/pages/Capital/capitalarticlePages.tsx`  
**Status:** ✅ Fixed  
**Fix:** Added DOMPurify with `sanitizeHtml()` function that sanitizes all HTML content before rendering.

---

## SECURITY ISSUES

### High Priority

| Issue | Location | Status |
|-------|----------|--------|
| ~~No rate limiting on auth endpoints~~ | `server.ts` | ✅ Fixed - Added `authLimiter` (20 req/15min) |
| ~~Email bombing via forgot-password~~ | `server.ts` | ✅ Fixed - Added `forgotPasswordLimiter` (5 req/hour) |

### Medium Priority

| Issue | Location | Status |
|-------|----------|--------|
| Missing email validation in admin invite | `server.ts:912` | Pending |
| No CORS for cross-origin setups | `server.ts` | Pending - Add if needed |
| ~~File upload type not validated~~ | `server.ts` | ✅ Fixed - Added mimetype check |

### Low Priority

| Issue | Location | Fix |
|-------|----------|-----|
| No Airtable ID format validation | `server.ts:1120, 1303` | Validate format `rec[a-zA-Z0-9]{14}` |
| Token revocation not checked | `server.ts:427` | Add `checkRevoked: true` to `verifyIdToken()` |

---

## PERFORMANCE ISSUES

### High Priority

| Issue | Location | Status |
|-------|----------|--------|
| N+1 Firebase getUser in admin users | `server.ts:949-972` | Pending |
| N+1 Airtable find in capital sync | `server.ts:1281-1336` | Pending |
| Lazy imports via barrel file | `src/App.tsx:25-35` | Pending |

### Medium Priority

| Issue | Location | Status |
|-------|----------|--------|
| ~~No API response caching~~ | `server.ts` | ✅ Fixed - Added Cache-Control for news/sources |
| ~~AuthContext value recreated each render~~ | `src/contexts/AuthContext.tsx` | ✅ Fixed - Added useMemo |
| Navbar not memoized | `src/App.tsx:86-305` | Pending |
| ~~No static asset caching~~ | `server.ts` | ✅ Fixed - Added 1y cache for /assets |

### Low Priority

| Issue | Location | Status |
|-------|----------|--------|
| No `loading="lazy"` on images | Dashboard, Capital pages | Pending |
| Missing image dimensions | Various | Pending |
| ~~motion not in manual chunks~~ | `vite.config.ts` | ✅ Fixed - Added motion, router, markdown chunks |

---

## STABILITY ISSUES

### High Priority

| Issue | Location | Fix |
|-------|----------|-----|
| EditModal has no error catch | `capitalkeywords.tsx:441-458` | Add try-catch with error state |
| Edit paragraph save silent fail | `capitalarticlePages.tsx:456-478` | Show error to user |

### Medium Priority

| Issue | Location | Fix |
|-------|----------|-----|
| No DB connection error handling | `server.ts:40-65` | Wrap in try-catch, add health check |
| Lazy imports lack error handling | `App.tsx:25-35` | Add `.catch()` or chunk retry logic |
| loadGroups errors not surfaced | `AdminPanelPage.tsx:56-65` | Add error state UI |

### Low Priority

| Issue | Location | Fix |
|-------|----------|-----|
| TypeScript strict mode disabled | `tsconfig.json` | Enable `"strict": true` |
| API error format inconsistent | Various | Standardize on `{ ok, error?, data? }` |
| Route-level error boundaries | `App.tsx` | Add per-route ErrorBoundary |

---

## INSTALLED PACKAGES

The following packages have been installed:
- `express-rate-limit` - Rate limiting for auth endpoints
- `dompurify` + `@types/dompurify` - XSS prevention
- `compression` + `@types/compression` - Gzip compression

---

## QUICK WINS - COMPLETED

1. ✅ **Add rate limiting** to `/api/auth/*` endpoints
2. ✅ **Add DOMPurify** for article content
3. ✅ **Memoize AuthContext value** with `useMemo`
4. ✅ **Add compression middleware** for responses
5. ✅ **Add `Cache-Control`** headers for news/sources APIs
6. Pending: **Add `loading="lazy"`** to images

---

## IMPLEMENTATION STATUS

### Phase 1: Critical Security ✅ DONE
- [x] Add DOMPurify for XSS prevention
- [x] Add rate limiting for auth endpoints
- [x] Add file upload type validation

### Phase 2: Performance (Partial)
- [ ] Fix N+1 queries (Firebase batch, Airtable)
- [x] Add API caching headers
- [x] Memoize AuthContext
- [x] Add compression middleware
- [x] Add static asset caching
- [x] Improve bundle splitting

### Phase 3: Stability (Pending)
- [ ] Add error states to all forms
- [ ] Enable TypeScript strict mode
- [ ] Add per-route error boundaries
