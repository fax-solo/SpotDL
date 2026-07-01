# Architecture Audit Report — Spotify Downloader v1.5.x

> Generated: 2026-07-01 | Auditor: opencode | Tier: Full-stack (Python + Cloudflare + React)

---

## Executive Summary

This monorepo is a functional but organically-grown system with significant architectural debt. The core value proposition (downloading Spotify/Deezer tracks via yt-dlp + Deezer decryption) works, but the codebase exhibits **triple duplication** of core business logic, **non-standard security practices**, and **fuzzy module boundaries** between Python and Cloudflare/Workers tiers.

**Overall Architecture Health Score: 4/10**

| Category | Score | Key Issues |
|---|---|---|
| Separation of Concerns | 4 | 3 tiers doing Spotify metadata; auth duplicated; no clear service layer |
| Security | 3 | Custom SHA-256 "JWT" (not real JWT); unsalted password hashing; no token revocation |
| Data Consistency | 5 | Schema drift between SQLite+D1; no migrations; soft/hard delete conflict |
| Error Handling | 5 | Inconsistent response shapes; no structured error types across tiers |
| Test Coverage | 2 | 1 test file for a 100+ file codebase; stale test scripts in root |
| Build/Deploy | 5 | No .dockerignore; duplicate D1 binding; no CI/CD config tracked |
| Performance | 6 | Reasonable caching; some N+1 risks in admin endpoints |
| **Overall** | **4** | |

---

## 1. Tier Architecture & Data Flow

### Three-Tier Deployment

```
┌─────────────────────────────────────────────────────────────────────┐
│  FRONTEND (React + Vite + Capacitor)                                │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────────────────┐ │
│  │  Pages   │  │  Hooks   │  │  Lib     │  │  Functions (CF)     │ │
│  │  (20)    │──│  (15)    │──│  (27)    │  │  (serverless)       │ │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┬──────────┘ │
│                                                       │             │
│  Vite Dev Proxy: /api/* ──────┬──────────────────────┘             │
│                                │ HTTP                                │
└────────────────────────────────┼────────────────────────────────────┘
                                 │
              ┌──────────────────┼──────────────────┐
              ▼                  ▼                   ▼
    ┌─────────────────┐ ┌──────────────┐  ┌──────────────────┐
    │  Python FastAPI  │ │  CF Workers  │  │  External APIs    │
    │  localhost:8000  │ │  localhost:9999│ │  - Spotify       │
    │                  │ │  (D1, KV)    │  │  - Deezer         │
    │  - yt-dlp        │ │  - Search    │  │  - YouTube        │
    │  - Deezer decrypt│ │  - Metadata  │  │  - Piped          │
    │  - Mutagen tag   │ │  - Auth      │  │  - Invidious      │
    │  - Sync service  │ │  - Admin     │  │  - JioSaavn       │
    │  - SQLite        │ │  - Lyrics    │  │  - Jamendo        │
    └─────────────────┘ └──────────────┘  └──────────────────┘
```

### Data Flow

1. **Download flow**: Frontend → Python API (`POST /api/download`) → resolves sources → yt-dlp downloads → mutagen tags → returns path
2. **Search/Browse flow**: Frontend → Cloudflare Functions → external APIs (Spotify, Deezer, YouTube) → returns normalized results
3. **Auth flow**: Frontend → Cloudflare Functions → D1 → custom JWT token → returned to frontend → stored in localStorage
4. **Player flow**: Frontend local state (usePlayer hook) → optionally fetches Cloudflare lyrics → plays via `<audio>` or YouTube embed
5. **Sync flow**: Mobile app → Python API (`WebSocket` or HTTP) → sync library between devices

### Key Finding: No API Gateway Pattern

Frontend code must know which tier handles which route. Vite proxy `/api/*` sends to both `localhost:8000` (Python) and `localhost:9999` (Cloudflare) based on path prefixes. This is fragile and not documented — a developer adding a new route must know which tier owns it.

---

## 2. Logic Duplication Analysis

### Spotify Metadata: Triple Implementation

| Concern | Python (`api/spotify.py`) | CF (`spotify.js`) | CF (`spotify-partner.js`) |
|---|---|---|---|
| Auth method | OAuth → Client Credentials → embed → yt-dlp | Client Credentials + refresh | Reverse-engineered Partner API |
| Track fetching | Full fallback chain | Direct API call | Partner API call |
| Album/Playlist | Yes | Yes | No |
| Search | Via Spotify API | Via Spotify API | No |
| Caching | dict (memory) | Map (memory) | None |
| Error handling | Custom exceptions | Return null/err | Return null |
| Lines of code | ~300 | ~400+ | ~100+ |

**Impact**: Adding a new metadata endpoint (e.g., artist recommendations) requires changes in 2-3 places. Bug fixes in one may not propagate.

### Authentication Logic: Triple Implementation

| Concern | Python (`auth.py`) | CF (`_lib.ts`) | Frontend (`useAuth.ts`) |
|---|---|---|---|
| Token creation | `sha256(payload+secret)` | Web Crypto `sha256(payload+secret)` | N/A (calls server) |
| Token verification | Same algorithm | Same algorithm | N/A |
| Password hashing | `sha256(password+secret)` | `sha256(password+secret)` | N/A |
| Admin check | `is_admin` DB column | `is_admin` DB column | Checks token + redirect |
| Response shape | `{"error":"..."}` | `{"detail":"..."}` | Handles both? |

**Impact**: Inconsistent error response shapes between tiers. JWT_SECRET used for both token signing and password hashing (security anti-pattern).

### Download Logic: Duplicated

| Concern | Python (`downloader.py`) | Frontend (`useDownloads.ts`) |
|---|---|---|
| Queue management | Server-side semaphore (4 concurrent) | Client-side queue (localStorage) |
| Quality selection | Defaults to 128kbps | UI for quality, but no override hook? |
| Status tracking | DB `download_logs` | Local state + polling |

**Impact**: No server push for download progress. Frontend polls or relies on local state. User sees stale status on page refresh.

---

## 3. Authentication & Authorization

### Current Architecture

```
Sign Up → sha256(password + secret) stored in D1 users.password
Login → verify sha256, create token: `${userId}:${expiry}:${sha256(userId:expiry:secret)}`
Verify → split token, recompute hash, compare, check expiry
```

### Security Issues (Critical)

| Issue | Severity | Description |
|---|---|---|
| **No salt for passwords** | CRITICAL | Single-iteration SHA-256 of `password + JWT_SECRET` means identical passwords produce identical hashes. No bcrypt/argon2/PBKDF2. |
| **JWT_SECRET = password pepper** | HIGH | Same secret used for token signing and password hashing. Rotating secret invalidates all passwords. |
| **Not real JWT** | HIGH | No standard claims (iss, sub, jti, iat). No standard header. Any JWT library cannot parse these tokens. |
| **No token revocation** | HIGH | No jti/jti blocklist. Tokens valid for 72 hours with no way to revoke. Logout is client-side only. |
| **No rate limiting on auth** | MEDIUM | Login/signup endpoints have no rate limiting or account lockout. |
| **Password in response** | LOW | `formatUser` returns `password` field (hashed, but still unnecessary exposure). |
| **No MFA** | INFO | No 2FA options. |

### Admin Authorization

Admin check is a simple `is_admin = 1` column in D1. `requireAdmin` wraps `requireUser` + checks column. No audit logging of admin actions. No elevated session for admin actions.

---

## 4. Database Schema Analysis

### SQLite (Python) vs D1 (Cloudflare)

**Users table:**

| Column | Python SQLite | D1 (Cloudflare) | Issue |
|---|---|---|---|
| id | INT AUTOINCREMENT | INTEGER PRIMARY KEY AUTOINCREMENT | Compatible |
| username | TEXT UNIQUE | TEXT UNIQUE | Compatible |
| email | TEXT | TEXT | Compatible |
| password_hash | TEXT (called `password_hash`) | TEXT (called `password`) | **Name mismatch** |
| is_admin | INTEGER DEFAULT 0 | INTEGER DEFAULT 0 | Compatible |
| created_at | DateTime(timezone=True) | TEXT (`2024-01-15T10:30:00.000Z`) | **Type mismatch** |
| avatar_url | TEXT | TEXT | Compatible |
| bio | TEXT | TEXT | Compatible |
| google_id | TEXT (Python only, nullable) | — | **Column only in Python** |
| guest_expires | — | INTEGER (D1 only) | **Column only in D1** |
| settings_json | — | TEXT DEFAULT '{}' | **Column only in D1** |

**download_logs table:**

| Column | Python SQLite | D1 (Cloudflare) | Issue |
|---|---|---|---|
| id | INT AUTOINCREMENT | INTEGER PRIMARY KEY AUTOINCREMENT | Compatible |
| user_id | INT (FK to users.id) | INTEGER (NO FK constraint) | **Missing FK in D1** |
| track_id | TEXT | TEXT | Compatible |
| track_name | TEXT | TEXT | Compatible |
| artist_name | TEXT | TEXT | Compatible |
| status | TEXT | TEXT | Compatible |
| quality | TEXT | TEXT | Compatible |
| file_path | TEXT | TEXT | Compatible |
| error_message | TEXT | TEXT | Compatible |
| downloaded_at | DateTime(timezone=True) | TEXT | **Type mismatch** |
| source | TEXT (Python only) | — | **Column only in Python** |
| platform | TEXT (Python only) | — | **Column only in Python** |
| deleted | — | INTEGER DEFAULT 0 | **Soft delete in D1 only** |

**D1-only tables:**

- `sync_queue` — pending sync operations
- `sync_devices` — registered devices
- `lyrics_cache` — cached lyrics
- `liked_tracks` — user likes
- `recently_played` — listening history
- `playlists` + `playlist_tracks` — user playlists
- `admin_logs` — audit log
- `login_attempts` — rate limiting
- `pending_users` — pre-activated accounts
- `invite_codes` — invite system
- `cached_responses` — generic cache

### Critical Issues

1. **No migrations**: Schema created on app startup (`init_db()` in Python). D1 schema inferred from query patterns.
2. **Soft delete inconsistency**: D1 `download_logs` uses `deleted=0` flag. Python hard-deletes. Data loss risk on tier switching.
3. **Missing FK constraint**: D1 `download_logs.user_id` has no foreign key to `users.id`.
4. **No indexes defined**: Neither tier defines indexes on frequently-queried columns (`user_id`, `created_at`, `status`). Performance will degrade with scale.
5. **SQLite `check_same_thread=False`**: Python uses `connect_args={"check_same_thread": False}` — potential race condition under concurrent API requests.

---

## 5. Module Boundaries & Dependencies

### Python API (`api/`)

```
index.py (routes, ~400 lines)
  ├── auth.py (auth helpers)
  ├── spotify.py (Spotify metadata)
  ├── deezer.py (Deezer download/decrypt)
  ├── downloader.py (yt-dlp + tagging)
  ├── models.py (SQLAlchemy models)
  ├── piped.py (Piped API)
  ├── jinadapter.py (JioSaavn API)
  └── sync/ (sync service)
       └── sync_server.py
```

**Issues:**
- `index.py` is too large (~400 lines) — routes, middleware, config, startup all in one file
- No service layer — route handlers call external APIs directly
- No dependency injection — everything is module-level global state
- `downloader.py` imports `spotify.py` only for `NO_CREDITS_WARNINGS`

### Cloudflare Functions (`functions/api/`)

```
auth/ (9 handlers — login, signup, logout, google, profile, guest, etc.)
admin/ (3 handlers — users, logs, stats)
avatars/ ([filename].ts — avatar serving)
download/log.ts
search.js (unified search)
spotify.js (~400 lines, Spotify metadata)
spotify-partner.js (~100 lines, Partner API)
deezer.js (Deezer search)
bandcamp.js (Bandcamp search)
jamendo.js (Jamendo search)
youtube.js (YouTube search)
youtube-dl.js (YouTube download info)
lyrics.js (lyrics fetch)
lyrics-oversapi.js (OVERS API lyrics)
health.js
_lib.ts (`_lib.ts` — shared auth, CORS, helpers)
```

**Issues:**
- No shared lib for Spotify/Deezer/YouTube calls — each file does its own fetch
- Error handling is per-handler rather than centralized
- `_lib.ts` is a god file — auth, formatting, validation, CORS all in one place

### Frontend (`src/`)

```
pages/ (20 components)
components/ (17 components)
hooks/ (15 hooks)
lib/ (27 modules)
```

**Issues:**
- `lib/sources.ts` is a god module — source resolution, format detection, fallback logic
- `lib/api.ts` and `lib/apiHelpers.ts` overlap significantly
- `lib/format.ts` mixes UI formatting with data transformation — should be split
- `pages/AdminDashboard.tsx` has fetch logic inline instead of using a hook
- `components/TrackList.tsx` fetches its own data as a side effect rather than receiving it as props

---

## 6. Architectural Anti-Patterns

### Critical

| Anti-pattern | Location | Description |
|---|---|---|
| **Triple business logic** | spotify.js, spotify.py, spotify-partner.js | Same Spotify metadata logic rewritten 3× |
| **Duplicate auth** | auth.py, _lib.ts | Same token/hashing algorithm in 2 languages |
| **God files** | _lib.ts (~300 lines), sources.ts, index.py (~400 lines) | Multiple unrelated concerns in single file |
| **No migration system** | Both DBs | Schema-on-startup and inferred schemas |

### High

| Anti-pattern | Location | Description |
|---|---|---|
| **Wrangler dead config** | wrangler.toml | Two D1 bindings (`sinc_db` + `DB`) to same DB |
| **Version drift** | VERSION vs lib/version.ts | 1.5.0 vs 1.5.1 |
| **Stale test files** | test-info.js, test-piped.js | Root-level test scripts referencing old APIs |
| **Module-level mutable state** | useDownloads.ts | `processing` boolean shared across imports |
| **No `.dockerignore`** | Python Dockerfile | Copies `__pycache__`, `.env`, `data/` into image |
| **Empty assets dir** | frontend/src/assets/ | README references non-existent images |

### Medium

| Anti-pattern | Location | Description |
|---|---|---|
| **Inline styles** | Multiple frontend components | No CSS module or styled-components pattern |
| **Magic strings** | Multiple files | API routes, storage keys, quality levels hardcoded |
| **No error boundary** | Frontend | No React Error Boundary wrapper |
| **No request validation** | Python API | No Pydantic schemas for request bodies |
| **Mixed sync/async** | Cloudflare functions | Some handlers `await` unnecessarily |
| **Direct DOM access** | pages/PlayerScreen.tsx | Uses `document.getElementById` |

---

## 7. Build & Deployment Architecture

### Docker Build

```
api/
├── Dockerfile          # python:3.11-slim, installs yt-dlp + ffmpeg
├── requirements.txt    # fastapi, uvicorn, yt-dlp, mutagen, httpx, etc.
├── .env.example
└── render.yaml         # Render.com blueprint
```

**Issues:**
- No `.dockerignore` — bloated context
- Pin versions missing in requirements.txt for some deps
- Single-stage build — could be optimized with multi-stage

### Cloudflare Deployment

```
wrangler.toml
├── D1: `sinc_db` + `DB` (duplicate, same UUID)
├── Env vars: JWT_SECRET, SPOTIFY_CLIENT_ID, etc.
└── Route: /api/* to functions
```

**Issues:**
- Duplicate D1 binding
- No environment-specific config (dev/prod separation is manual)

### Frontend Build

```
vite.config.ts → Vite build → dist/ directory
Vitest for testing
Capacitor for Android/iOS builds
```

**Issues:**
- No CI/CD pipeline defined in repo
- No build caching configuration
- No bundle analysis or size budgets

---

## 8. Prioritized Remediation Roadmap

### P0 — Security (Do First)

1. **Add password salting** — Switch to bcrypt/argon2 with per-user salt
2. **Separate JWT_SECRET from password hashing** — Use distinct secrets
3. **Add standard JWT claims** — Include `jti` for token revocation
4. **Remove password from API responses** — `formatUser` should exclude password
5. **Add rate limiting** — Login attempts, download requests

### P1 — Codebase Integrity

1. **Fix wrangler D1 binding** — Remove dead `sinc_db` binding
2. **Sync version numbers** — Reconcile `1.5.0` vs `1.5.1`
3. **Add `.dockerignore`** — Exclude `__pycache__`, `.env`, `data/`
4. **Clean up stale test scripts** — Remove `test-info.js`, `test-piped.js`
5. **Write DB migrations** — Add Alembic (Python) and D1 migrations

### P2 — Architecture Improvements

1. **Consolidate Spotify metadata** — Pick one canonical implementation (Python or CF)
2. **Standardize error responses** — Unified `{error, detail, code}` shape across tiers
3. **Add API gateway layer** — Single entry point routing to correct tier
4. **Add request validation** — Pydantic for Python, Zod for Cloudflare
5. **Extract service layer** — `index.py` should not have business logic

### P3 — Developer Experience

1. **Add CI/CD pipeline** — GitHub Actions for lint, test, build, deploy
2. **Increase test coverage** — Unit tests for shared logic, integration tests for API endpoints
3. **Add error boundaries** — React Error Boundary wrapper
4. **Define database indexes** — On user_id, created_at, status columns
5. **Add monitoring** — Request logging, error tracking, performance metrics

---

## 9. Recommendations by Tier

### Python API
- [ ] Replace `check_same_thread=False` with proper async connection pool
- [ ] Add Pydantic models for request/response validation
- [ ] Split `index.py` into routes/ directory with one file per resource
- [ ] Add Alembic migrations
- [ ] Add structured logging
- [ ] Pin all dependency versions

### Cloudflare Functions
- [ ] Consolidate `spotify.js` + `spotify-partner.js` into one module
- [ ] Add centralized error handling middleware
- [ ] Split `_lib.ts` — auth in one file, CORS in another, helpers in another
- [ ] Add Vitest tests for function handlers
- [ ] Remove dead `sinc_db` binding
- [ ] Add real JWT support with standard claims

### Frontend
- [ ] Split `lib/sources.ts` — source resolution separate from format detection
- [ ] Consolidate `api.ts` and `apiHelpers.ts`
- [ ] Move inline API calls out of `AdminDashboard` into a hook
- [ ] Make `TrackList` data-driven (props vs self-fetching)
- [ ] Add React Error Boundary
- [ ] Standardize on CSS modules or Tailwind

---

## Appendix A: File Inventory

### Python API (`api/`) — 10 files + config
| File | Lines | Purpose | Health |
|---|---|---|---|
| `index.py` | ~400 | FastAPI app, all routes, startup | 🔴 God file |
| `auth.py` | ~150 | SHA-256 auth, password hashing | 🔴 Security |
| `spotify.py` | ~300 | Spotify metadata fetch chain | 🟡 Duplicated |
| `deezer.py` | ~250 | Deezer download + Blowfish decrypt | 🟢 Specialized |
| `downloader.py` | ~200 | yt-dlp + mutagen tagging | 🟢 Focused |
| `models.py` | ~100 | SQLAlchemy models | 🟡 No migrations |
| `piped.py` | ~150 | Piped API client | 🟢 Focused |
| `jinadapter.py` | ~80 | JioSaavn API | 🟢 Focused |
| `sync/sync_server.py` | ~200 | Sync service | 🟡 No tests |

### Cloudflare Functions (`functions/api/`) — 19 files
| File | Lines | Purpose | Health |
|---|---|---|---|
| `_lib.ts` | ~300 | Shared auth, CORS, helpers | 🔴 God file |
| `spotify.js` | ~400 | Spotify metadata | 🔴 Duplicated |
| `spotify-partner.js` | ~100 | Partner API | 🟡 Duplicated |
| `search.js` | ~150 | Unified search | 🟢 Good |
| `youtube.js` | ~100 | YouTube search | 🟢 Good |
| `deezer.js` | ~80 | Deezer search | 🟢 Good |
| `lyrics.js` | ~60 | Lyrics orchestration | 🟢 Good |
| `auth/` (9 files) | ~50 each | Auth handlers | 🟡 Security |

### Frontend (`src/`) — 62+ files
| Directory | Count | Health |
|---|---|---|
| `pages/` | 20 | 🟡 Some god components (AdminDashboard) |
| `components/` | 17 | 🟢 Generally good |
| `hooks/` | 15 | 🟡 useDownloads has mutable state issue |
| `lib/` | 27 | 🔴 sources.ts god module, api.ts/apiHelpers overlap |

---

*End of Architecture Audit Report*
