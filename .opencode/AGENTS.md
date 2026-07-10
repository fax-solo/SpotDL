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

## Important notes
- The `functions/` directory contains CF Pages Functions served at `/api/*`
- After making changes, run `deploy` to build and push to Cloudflare Pages
- The FastAPI backend (`api/`) handles downloads while auth/API routes use CF Functions
