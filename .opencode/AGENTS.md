# Spotify Downloader

## Structure
- `frontend/` — React SPA (Vite + TypeScript + Tailwind)
- `api/` — FastAPI backend (Python)
- `frontend/functions/` — Cloudflare Pages Functions (TypeScript, auth + API routes)

## Key commands
- `deploy` — Build and deploy frontend to Cloudflare Pages
- `frontend/npm run build` — Build the frontend
- `frontend/npm run cf:deploy` — Deploy to Cloudflare Pages

## Env vars needed for Cloudflare deployment
The following env vars should be set in the Cloudflare Pages dashboard:
- `JWT_SECRET` — JWT signing secret
- `GOOGLE_CLIENT_ID` — Google OAuth client ID for PKCE flow
- `GOOGLE_CLIENT_SECRET` — Google OAuth client secret
- `ADMIN_USERNAME` — Admin login username
- `ADMIN_PASSWORD` — Admin login password

The following frontend env vars are inlined at build time (set in `.env` or CI):
- `VITE_GOOGLE_CLIENT_ID` — Google OAuth client ID
- `VITE_API_URL` — API base URL (empty for same-origin)

## MCP servers configured
- `gcloud` — Google Cloud via gcloud CLI (needs `gcloud auth login`)
- `cloudflare-bindings` — Cloudflare Workers/D1/KV/R2 (needs OAuth login on first use)
- `cloudflare-observability` — Cloudflare logs
- `cloudflare-builds` — Cloudflare Workers Builds

## Release APK signing

### One-time keystore setup (manual)
```bash
keytool -genkey -v -keystore release.keystore -alias spotdl \
  -keyalg RSA -keysize 2048 -validity 10000 -storetype JKS
```
Save the keystore file, its password, key alias, and key password in a password manager. Then base64-encode and add as GitHub secrets:

| Secret | Value |
|---|---|
| `RELEASE_KEYSTORE_B64` | `base64 -w0 release.keystore` output |
| `RELEASE_KEYSTORE_PASSWORD` | keystore password |
| `RELEASE_KEY_ALIAS` | `spotdl` |
| `RELEASE_KEY_PASSWORD` | key password (same as keystore password unless you specified `-keypass`) |

**Important:** Use `-storetype JKS` when creating the keystore. If you already created a PKCS12 keystore (default in Java 9+), the CI will attempt an automatic conversion, but JKS is preferred for Android tooling compatibility. If the CI build fails with "Tag number over 30", re-create with `-storetype JKS`.

Never commit the `.keystore` file or its passwords to the repo.

## Important notes
- The `functions/` directory contains CF Pages Functions served at `/api/*`
- After making changes, run `deploy` to build and push to Cloudflare Pages
- The FastAPI backend (`api/`) handles downloads while auth/API routes use CF Functions
