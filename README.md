# SpotDL — Spotify to MP3 Downloader

Download any Spotify track, album, or playlist as high-quality audio — **no API key, no Premium subscription required**.

## How It Works

1. Paste a Spotify link → app scrapes public metadata (title, artist, album, cover art) from Spotify's embed page
2. Searches SoundCloud (or YouTube) for the best matching audio using yt-dlp
3. Downloads the best available audio (320kbps MP3 if ffmpeg is available)
4. Tags the file with ID3 metadata (title, artist, album, cover art)

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + TypeScript + Vite + Tailwind CSS v4 |
| Backend | FastAPI (Python 3.12+) — Docker container |
| Audio | yt-dlp + mutagen |
| Mobile | Capacitor 8 (Android APK) |

## Architecture

```
Android APK (Capacitor/React) ──HTTP──> Backend Server (FastAPI + yt-dlp)
```

The backend runs as a standalone server (Docker, Railway, Render, Fly.io, VPS).
The mobile app connects to it via API.

## Deploy Backend

### Option 1: Railway / Render / Fly.io (recommended)

```bash
# Connect your GitHub repo
# Set environment variables in the dashboard:
#   SPOTIFY_CLIENT_ID
#   SPOTIFY_CLIENT_SECRET
#   SPOTIFY_REDIRECT_URI  (e.g. spotdl://callback for mobile, or https://your-app.com/api/auth/spotify/callback for web)
#   CLIENT_URL            (e.g. https://your-app.com or spotdl:// for mobile)
# Deploy — Dockerfile is auto-detected
```

### Option 2: Docker (any VPS)

```bash
docker compose up -d
```

### Option 3: Manual

```bash
cd api
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn index:app --host 0.0.0.0 --port 8000
```

## Build Mobile APK

```bash
cd frontend
npm install
npm run build
npx cap add android
npx cap sync android
npx cap open android
```

Then in Android Studio: **Build → Build Bundle(s) / APK(s) → Build APK**

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SPOTIFY_CLIENT_ID` | Yes | — | Spotify API OAuth client ID |
| `SPOTIFY_CLIENT_SECRET` | Yes | — | Spotify API OAuth client secret |
| `SPOTIFY_REDIRECT_URI` | No | `http://localhost:8000/api/auth/spotify/callback` | OAuth redirect URI |
| `CLIENT_URL` | No | `http://localhost:5173` | Frontend URL for OAuth redirect |
| `VITE_API_URL` | For mobile APK | `''` (same-origin) | Backend API URL (set at build time) |

## Local Development

```bash
# Backend
cd api
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
uvicorn index:app --host 0.0.0.0 --port 8000

# Frontend (separate terminal)
cd frontend
npm install
VITE_API_URL=http://localhost:8000 npm run dev
```

## License

MIT
