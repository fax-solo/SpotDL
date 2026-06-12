# SpotDL — Spotify to MP3 Downloader

Download any Spotify track, album, or playlist as high-quality audio — **no API key, no Premium subscription required**.

## How It Works

1. Paste a Spotify link → app scrapes public metadata (title, artist, album, cover art) from Spotify's OG tags
2. Searches YouTube for the best matching audio using yt-dlp
3. Downloads the best available audio (320kbps MP3 if ffmpeg is available, otherwise high-bitrate M4A)
4. Tags the file with metadata (title, artist, album, cover art)

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + TypeScript + Vite + Tailwind CSS v4 |
| Backend | FastAPI (Python 3.12+) — deployed as Vercel Serverless Function |
| Audio | yt-dlp + mutagen |
| Hosting | [Vercel](https://vercel.com) (frontend + API) |

## Deploy to Vercel

### Prerequisites

Push your repo to GitHub first:

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/<your-username>/spotdl.git
git branch -M main
git push -u origin main
```

### One-click deploy

| Step | Action |
|------|--------|
| 1 | Go to [vercel.com/new](https://vercel.com/new) |
| 2 | Import your `spotdl` repo |
| 3 | Click **Deploy** — that's it |

Vercel auto-detects:
- `api/` → Python serverless function (FastAPI)
- `frontend/` → Vite static site
- `vercel.json` → routes `/api/*` to the backend, everything else to the frontend

### Local Development

```bash
# Backend
cd api
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
# Install ffmpeg for MP3 conversion (optional — M4A works without it)
uvicorn main:app --host 0.0.0.0 --port 8000

# Frontend (separate terminal)
cd frontend
npm install
VITE_API_URL=http://localhost:8000 npm run dev
```

## Environment Variables

None required for Vercel deployment. The frontend defaults to same-origin API requests.

For local development, set `VITE_API_URL` to your backend URL.

## License

MIT
