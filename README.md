# SpotDL — Spotify to MP3 Downloader

Download any Spotify track, album, or playlist as high-quality MP3 files — **no API key, no Premium subscription required**.

## How It Works

1. Paste a Spotify link → app scrapes public metadata (title, artist, album, cover art) from Spotify's OG tags
2. Searches YouTube for the best matching audio using yt-dlp
3. Downloads + converts to 320kbps MP3 via ffmpeg
4. Tags the file with ID3 metadata (title, artist, album, cover art) via mutagen

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + TypeScript + Vite + Tailwind CSS v4 |
| Backend | FastAPI (Python 3.11+) |
| Audio | yt-dlp + ffmpeg + mutagen |
| Mobile | Capacitor (Android) |
| Hosting | Vercel (frontend) + Railway (backend) |

## Prerequisites

- Python 3.11+
- Node.js 20+
- [ffmpeg](https://ffmpeg.org/) installed on your system
- yt-dlp (installed via pip — included in requirements.txt)

## Local Development

### Backend

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000
```

### Frontend

```bash
cd frontend
npm install
VITE_API_URL=http://localhost:8000 npm run dev
```

Open `http://localhost:5173` in your browser.

## Deployment

### Backend → Railway

| Step | Action |
|------|--------|
| 1 | Push repo to GitHub |
| 2 | Go to [railway.app/new](https://railway.app/new) → **Deploy from GitHub repo** |
| 3 | Set root directory to `backend` |
| 4 | Railway auto-detects Python and installs ffmpeg (via `nixpacks.toml`) |
| 5 | Copy your Railway URL (e.g. `https://spotdl-backend.up.railway.app`) |

### Frontend → Vercel

| Step | Action |
|------|--------|
| 1 | Go to [vercel.com/new](https://vercel.com/new) → import your repo |
| 2 | Set root directory to `frontend` |
| 3 | Add env variable: `VITE_API_URL` = your Railway URL |
| 4 | Deploy |

## Android Build (Capacitor)

```bash
cd frontend
npm run build
npx cap sync
npx cap open android
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_API_URL` | Yes (frontend) | Backend URL (e.g. `http://localhost:8000` or Railway URL) |

No Spotify API keys or environment variables are needed on the backend.

## License

MIT
