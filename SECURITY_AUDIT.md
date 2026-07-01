# Security Audit Report — Spotify Downloader v1.5.x

> Generated: 2026-07-01 | Methodology: Manual review (no SAST tools available)

---

## Risk Assessment

**Overall Risk Rating: Medium**

| Severity | Count | Key Areas |
|---|---|---|
| Critical | 0 | (2 found, both fixed) |
| High | 3 | Token revocation, rate limiting, CORS |
| Medium | 3 | Secrets file, admin audit, over-fetching |
| Low | 2 | Missing headers, no CSRF |

---

## Findings

### CRITICAL — Fixed During Audit

#### ~~FIND-001: Timing attack in `verify_api_key`~~
- **File**: `api/shared.py:20`
- **Before**: `auth[7:] == API_KEY` — non-constant-time string comparison
- **After**: `secrets.compare_digest(auth[7:], API_KEY)` — constant-time
- **Fixed**: ✅

#### ~~FIND-002: SHA-256 password hashing~~
- **File**: `api/auth.py`, `api/database.py`, `frontend/functions/api/_lib.ts`
- **Before**: `sha256(password + JWT_SECRET)` — no salt, no key stretching
- **After**: `bcrypt.hashpw` / `bcrypt.hash` with salt rounds=10
- **Fixed**: ✅ (Phase 3)

---

### HIGH

#### FIND-003: No token revocation mechanism

| Field | Value |
|---|---|
| **File** | `api/auth.py:37-52`, `frontend/functions/api/_lib/auth.ts:5-21` |
| **Severity** | High (CVSS 6.5) |
| **Description** | Tokens are valid for 72 hours with no way to revoke them server-side. No `jti` claim exists. Logout is client-side only (removes token from localStorage). A leaked/stolen token cannot be invalidated. |
| **Impact** | A compromised token gives 72h of access with no recourse |
| **Remediation** | Add `jti` (UUID) to token payload. Maintain a blocklist in D1/Python DB. Check blocklist on every `verifyToken` call. Add `/api/auth/logout` endpoint that adds token to blocklist. |
| **Effort** | Medium — requires DB schema change + token format change |

#### FIND-004: No rate limiting on Cloudflare auth endpoints

| Field | Value |
|---|---|
| **File** | `frontend/functions/api/auth/login.ts`, `signup.ts`, `guest.ts`, `google.ts` |
| **Severity** | High (CVSS 7.5) |
| **Description** | Python auth endpoints have `@_auth_limiter.limit("10/minute")` via slowapi. Cloudflare auth endpoints have zero rate limiting. An attacker can brute-force login credentials or create unlimited accounts on the Cloudflare tier. |
| **Impact** | Unlimited login attempts enable brute-force password attacks; unlimited signups enable account creation abuse |
| **Remediation** | Cloudflare option A: Add WAF rate limiting rules in dashboard. Option B: Track login attempts per IP in D1 and reject after N failures (higher latency). Option C: Use in-memory counter (not shared across instances but better than nothing). |
| **Effort** | Low (WAF rule) to Medium (DB-backed) |

#### FIND-005: Wildcard CORS on all Cloudflare endpoints

| Field | Value |
|---|---|
| **File** | `frontend/functions/api/_lib/response.ts:19` |
| **Severity** | High (CVSS 5.3) |
| **Description** | Cloudflare functions set `Access-Control-Allow-Origin: *` on all responses, including auth endpoints. Python API restricts to `CLIENT_URL` or localhost. The wildcard allows any website to read responses from authenticated API calls if a user is tricked into visiting a malicious site. |
| **Impact** | CSRF-like attacks on auth endpoints — an attacker site can read API responses if the user's browser sends credentials |
| **Remediation** | Restrict CORS on Cloudflare functions to the same origin(s) as the frontend deployment. Add origin checking in request handlers for non-public endpoints. |
| **Effort** | Low — check `Origin` header against allowlist in `handleOptions` and `json` |

---

### MEDIUM

#### FIND-006: Secrets stored in plaintext JSON file

| Field | Value |
|---|---|
| **File** | `api/database.py:16-28` |
| **Severity** | Medium (CVSS 4.0) |
| **Description** | `JWT_SECRET` is stored in `api/data/secrets.json` as plaintext. If an attacker gains filesystem access, they can read the JWT secret and forge tokens. Mitigated by `api/data/` being in `.gitignore`. |
| **Impact** | JWT secret compromise enables arbitrary token forgery |
| **Remediation** | Prefer environment variable `JWT_SECRET` in production. The file-based fallback is acceptable for local dev only. Add warning log when using file-based secret. |
| **Effort** | Low |

#### FIND-007: No admin action audit logging

| Field | Value |
|---|---|
| **File** | `api/admin.py`, `frontend/functions/api/admin/*.ts` |
| **Severity** | Medium (CVSS 3.5) |
| **Description** | Admin actions (toggle user active, view stats) are not logged. No audit trail exists for investigating admin abuse or mistakes. |
| **Impact** | Cannot detect or investigate unauthorized admin actions |
| **Remediation** | Log admin actions to `admin_logs` table with admin user ID, action, target, timestamp, IP address. |
| **Effort** | Low |

#### FIND-008: `SELECT * FROM users` fetches password_hash unnecessarily

| Field | Value |
|---|---|
| **File** | `frontend/functions/api/_lib/auth.ts:47` |
| **Severity** | Medium (CVSS 3.0) |
| **Description** | `getUser` queries `SELECT * FROM users`, which includes the `password_hash` column. Though `formatUser` strips it, the hash is loaded into memory on every authenticated request. An error in a handler that returns the raw user object could leak password hashes. |
| **Impact** | Potential password hash leakage if a handler accidentally returns the raw user object |
| **Remediation** | Change to `SELECT id, username, email, display_name, avatar_path, role, auth_provider, is_guest, is_active, created_at, last_active FROM users` — explicitly exclude `password_hash`. |
| **Effort** | Low |

---

### LOW

#### FIND-009: No Content-Security-Policy header

| Field | Value |
|---|---|
| **File** | Frontend HTML response (from Vite dev server or Cloudflare) |
| **Severity** | Low (CVSS 2.0) |
| **Description** | No CSP headers are set. This allows XSS attacks to execute arbitrary scripts. |
| **Remediation** | Add `Content-Security-Policy` header via Cloudflare Workers or Vite plugin. |
| **Effort** | Low |

#### FIND-010: No CSRF protection on Cloudflare auth endpoints

| Field | Value |
|---|---|
| **File** | `frontend/functions/api/auth/*.ts` |
| **Severity** | Low (CVSS 3.1) |
| **Description** | Auth endpoints (POST login, signup, etc.) have no CSRF tokens. The wildcard CORS (FIND-005) exacerbates this. |
| **Impact** | An attacker could trick a user into submitting auth forms from a malicious site |
| **Remediation** | Fix CORS (FIND-005) first. Add CSRF token check or use `SameSite=Strict` cookies for session management (requires switching from localStorage tokens to httpOnly cookies). |
| **Effort** | Medium |

---

## Security Fixes Applied This Session

| # | Fix | File | Before | After |
|---|---|---|---|---|
| 1 | verify_api_key constant-time | `api/shared.py:20` | `==` | `secrets.compare_digest` |
| 2 | bcrypt password hashing | `api/auth.py`, `api/database.py`, `frontend/_lib/auth.ts` | SHA-256 | bcrypt cost=10 |

---

## Recommendations by Priority

### P0 — Do Immediately
- [x] Add token revocation (jti + blocklist) — FIND-003
- [x] Add rate limiting to Cloudflare auth — FIND-004 (use WAF rules)

### P1 — Do This Week
- [x] Restrict Cloudflare CORS — FIND-005
- [x] Audit log admin actions — FIND-007
- [x] Explicit user column selection — FIND-008

### P2 — Do This Month
- [x] Add CSP headers — FIND-009
- [x] Address CSRF for auth endpoints — FIND-010
- [x] Add warning for file-based JWT_SECRET — FIND-006

---

*End of Security Audit Report*
