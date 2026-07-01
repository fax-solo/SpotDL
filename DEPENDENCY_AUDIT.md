# Dependency Audit — Spotify Downloader v1.5.x

> Generated: 2026-07-01

---

## Python API (`api/requirements.txt`)

**Status: 0 vulnerabilities. 1 issue (no version pins).**

### All 13 packages are used

| Package | Used In | Notes |
|---|---|---|
| `fastapi` | `index.py`, `auth.py`, `admin.py`, `routes/*.py` | Core web framework |
| `uvicorn[standard]` | CLI entrypoint | `[standard]` extras pull ~5 extra packages (websockets, httptools). Not needed — slim to `uvicorn` |
| `yt-dlp` | `downloader.py` | YouTube/streaming audio download |
| `mutagen` | `downloader.py` | ID3 tagging |
| `requests` | `auth.py`, `spotify.py`, `debug.py` | HTTP client |
| `pycryptodome` | `deezer.py` | Blowfish decryption (imported as `Cryptodome`) |
| `scrapling[fetchers]` | `scrapling_scraper.py` | Anti-bot scraping |
| `slowapi` | `index.py`, `auth.py` | Rate limiting |
| `cryptography` | `spotify.py` | Fernet token encryption |
| `bcrypt` | `auth.py`, `database.py` | Password hashing |
| `sqlalchemy` | `models.py`, `database.py`, `auth.py` | ORM |
| `python-multipart` | `auth.py` | File upload handling |
| `pydantic[email]` | `auth.py`, `routes/*.py` | Request validation |

### Issues

| ID | Severity | Finding | Recommendation |
|---|---|---|---|
| DEP-001 | Medium | **No version pins** | Pin all deps with `~=` or `==` for reproducible builds |
| DEP-002 | Low | `uvicorn[standard]` includes unneeded extras | Change to `uvicorn` unless WebSocket support is planned |
| DEP-003 | Low | `pycryptodome` unmaintained since 2023 | Replace with `pycryptodomex` fork or use `cryptography` Blowfish implementation |

---

## Frontend (`frontend/package.json`)

**Status: 0 vulnerabilities (`npm audit` clean). 9 packages behind latest.**

### Dependencies (22 total — 14 runtime, 8 dev)

All packages are actively used by the codebase. No unused deps detected.

### npm Audit: 0 vulnerabilities ✅

### Outdated Packages

| Package | Current | Latest | Type | Risk |
|---|---|---|---|---|
| `bcryptjs` | 2.4.3 | **3.0.3** | Runtime | **Major** — breaking changes likely |
| `browser-id3-writer` | 4.4.0 | **6.3.1** | Runtime | **Major** — breaking changes likely |
| `lucide-react` | 1.21.0 | 1.23.0 | Runtime | Minor — safe |
| `react-router-dom` | 7.18.0 | 7.18.1 | Runtime | Patch — safe |
| `@tailwindcss/vite` | 4.3.1 | 4.3.2 | Runtime | Patch — safe |
| `tailwindcss` | 4.3.1 | 4.3.2 | Runtime | Patch — safe |
| `vite` | 8.1.0 | 8.1.2 | Dev | Patch — safe |
| `wrangler` | 4.104.0 | 4.106.0 | Dev | Minor — safe |
| `@types/node` | 24.13.2 | 26.1.0 | Dev | Major — types only |

### Issues

| ID | Severity | Finding | Recommendation |
|---|---|---|---|
| DEP-004 | Low | `@types/node` far behind (24→26) | Update for latest Node.js types |
| DEP-005 | Info | `bcryptjs` 3.x available | Review changelog before upgrading (2.x→3.x breaking) |
| DEP-006 | Info | `browser-id3-writer` 6.x available | Review changelog before upgrading (4.x→6.x breaking) |

---

## Summary

| Tier | Deps | Unused | Vulns | Needs Pinning |
|---|---|---|---|---|
| Python API | 13 | 0 | 0 | ✅ Yes |
| Frontend | 22 | 0 | 0 | ✅ Yes (already in package.json) |

**Action items:**
1. Pin Python dependency versions for reproducible builds
2. Consider slimming `uvicorn[standard]` to `uvicorn`
3. Update safe minor/patch versions on frontend
