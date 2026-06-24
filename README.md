# SpotDL — Spotify Music Downloader

> Download any song, album, or playlist from Spotify as high-quality MP3 files. No premium account needed.

## Screenshots

<div align="center">
  <table>
    <tr>
      <td align="center"><strong>Home</strong></td>
      <td align="center"><strong>History</strong></td>
      <td align="center"><strong>Download</strong></td>
    </tr>
    <tr>
      <td><img src="Assets/Home" width="200" alt="Home screen" /></td>
      <td><img src="Assets/History" width="200" alt="History screen" /></td>
      <td><img src="Assets/Download" width="200" alt="Download screen" /></td>
    </tr>
  </table>
</div>

## What is SpotDL?

SpotDL is a free web app (also available as an Android app) that lets you download music from Spotify, YouTube, SoundCloud, and Bandcamp. Just paste a link and the app handles the rest — finding the best audio source, converting to MP3 at 320kbps quality, and tagging it with the correct song title, artist, album, and cover art.

## Features

- **Download from Spotify** — tracks, albums, playlists, artist top tracks
- **Download from YouTube** — paste any YouTube or YouTube Music link
- **Download from SoundCloud & Bandcamp** — direct URL support
- **Search & Browse** — search Spotify's catalog, browse new releases, top playlists
- **Built-in Music Player** — play your downloaded songs with synced lyrics display
- **Local Playlists** — organize your downloaded music into custom playlists
- **Download History** — keep track of everything you've downloaded
- **High Quality** — everything converted to 320kbps MP3
- **Auto-tagging** — ID3 tags with title, artist, album, and cover art
- **Dark Mode** —自动 adapts to your system theme
- **Offline Mode** — Android app can download directly on your device
- **Download Queue** — batch download entire albums or playlists at once
- **Sync Lyrics** — fetches lyrics automatically during download

## How to Use

### 1. Paste a Link

Copy any Spotify link (track, album, playlist), YouTube link, or SoundCloud link.

### 2. Fetch Metadata

Paste it into the download page. SpotDL reads the song info and album art automatically.

### 3. Download

Tap the download button. SpotDL finds the best audio source, converts it to 320kbps MP3, tags it with metadata, and saves it to your device.

## Getting Started

### Web Version (No Installation)

Visit the deployed app and start downloading immediately. Works in any modern browser (Chrome, Firefox, Safari, Edge).

### Android App

1. Build the APK (see developer section below)
2. Install on your Android device
3. For offline downloads, the app uses a built-in Python engine

### Connect Spotify (Optional)

Link your Spotify account to access:
- Your personal playlists
- Recently played tracks
- Personalized recommendations
- Saved music library

Go to **Settings > Connect Spotify** to log in.

## Downloads Page

The download page is the main hub:
- Paste a Spotify, YouTube, SoundCloud, or Bandcamp URL
- View detected track info and album art
- Download individual tracks or entire albums/playlists at once
- Watch download progress in real-time
- Access your download history
- Re-download previously downloaded tracks

## Player & Library

Built-in music player with:
- Play, pause, skip, seek controls
- Queue management (auto-plays next track)
- Volume control (persists across sessions)
- Synced lyrics display (karaoke-style)
- Mini-player bar for quick controls
- Full-screen player view

## History

Every download is saved to your history:
- See what you downloaded and when
- Play tracks directly from history
- Re-download with one tap
- Swipe to delete entries
- Clear all history

## Playlists

Create custom playlists from your downloaded tracks:
- Name and organize your playlists
- Add tracks from download history
- Play entire playlists
- Rename or delete playlists

---

## For Developers

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + TypeScript + Vite 8 + Tailwind CSS 4 |
| State | Zustand (downloads), React Context (player/toast), localStorage (history/playlists) |
| Mobile | Capacitor 8 (Android) |
| Audio Processing | FFmpeg WASM (client-side) + browser-id3-writer |
| Server Backend | FastAPI (Python 3.12+) |
| Serverless Functions | Cloudflare Pages Functions |
| Native Android | Capacitor Plugin → ProcessBuilder → Python 3.8 + SpotDL + FFmpeg |

### Metadata Pipeline

The app fetches Spotify metadata through multiple fallback sources:
1. **Spotify embed page scraping** (`__NEXT_DATA__`) — no API key needed
2. **oEmbed API** — fast, public endpoint
3. **WolfX API** — third-party proxy
4. **Spotify Partner API** — TOTP-authenticated web player token

### Audio Source Pipeline

When downloading, the app searches audio sources in order:
1. **SoundCloud** — API search via scraped client_id
2. **YouTube** — InnerTube API with 6 client contexts (Android, TV, Web, Music)
3. **Bandcamp** — HTML search scraping
4. **Jamendo** — official API (requires API key)

### Architecture (3 Download Modes)

```
Android App (Native Mode):
  Capacitor WebView → SpotDL Plugin → ProcessBuilder → Python + SpotDL + FFmpeg
  Result: Fully offline downloads on device

Web App (Server Mode):
  Frontend → FastAPI Server (Docker) → yt-dlp + mutagen
  Result: Heavy lifting done server-side

Web App (Client Mode):
  Frontend → Cloudflare Functions (metadata) + FFmpeg WASM (conversion)
  Result: Fully serverless, no backend needed
```

### Project Structure

```
├── frontend/               # React + Vite web app
│   ├── src/
│   │   ├── pages/          # 15 page components (Home, Downloader, SearchPage, PlayerScreen, etc.)
│   │   ├── components/     # 16 reusable components (Navbar, BottomBar, MiniPlayerBar, etc.)
│   │   ├── hooks/          # 13 custom hooks (usePlayer, useHistory, useDownloads, useLyrics, useTheme, useMaterialYou, useOnlineStatus, useShareTarget, useBottomBar, useBackgroundAudio, useEdgeToEdge, useHaptics, usePlaylists)
│   │   └── lib/            # 14 library modules (api.ts, sources.ts, audioProcessor.ts, etc.)
│   └── functions/api/      # 10 Cloudflare Pages Functions
│       ├── spotify.js      # Metadata scraping (900+ lines, supports tracks/albums/playlists/shows/artists)
│       ├── spotify-partner.js # Partner API with TOTP auth + hash extraction from web player
│       ├── youtube.js      # InnerTube API with 6 client contexts
│       ├── soundcloud.js   # Client ID extraction + API search
│       ├── bandcamp.js     # HTML scraping
│       ├── jamendo.js      # Official API integration
│       ├── lyrics.js       # LRCLIB integration with caching
│       ├── oembed.js       # Spotify oEmbed fallback
│       ├── proxy.js        # CORS proxy for audio streams in Capacitor WebView
│       └── spotify-auth.js # OAuth login flow
├── api/                    # Python FastAPI backend
│   ├── index.py            # FastAPI server
│   ├── downloader.py       # yt-dlp + mutagen download logic
│   └── spotify.py          # Spotify metadata scraping
├── build-scripts/          # Build automation scripts
└── Assets/                 # App screenshots
```

### Cloudflare Functions

All 10 functions are at `frontend/functions/api/`:

| Function | Purpose |
|----------|---------|
| `spotify.js` | Scrapes Spotify metadata via `__NEXT_DATA__`, WolfX API, and official API |
| `spotify-partner.js` | Partner API with TOTP, dynamic hash extraction, user library access |
| `youtube.js` | InnerTube API search + video info with 6 client context rotation |
| `soundcloud.js` | SoundCloud API search via dynamic client_id extraction |
| `bandcamp.js` | Bandcamp HTML search scraping |
| `jamendo.js` | Jamendo API search (requires `JAMENDO_CLIENT_ID`) |
| `lyrics.js` | LRCLIB proxy with in-memory cache (TTL: 24h) |
| `oembed.js` | Spotify oEmbed fallback for quick metadata |
| `proxy.js` | CORS proxy for audio streams in Capacitor WebView |
| `spotify-auth.js` | OAuth login, code exchange, and token refresh |



### Deployment

#### Backend (FastAPI)

```bash
# Docker (recommended)
docker compose up -d

# Manual
cd api
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
uvicorn index:app --host 0.0.0.0 --port 8000
```

#### Frontend (Cloudflare Pages)

```bash
cd frontend
npm install
npm run build
npm run cf:deploy
```

#### Android APK

```bash
cd frontend
npm install
npm run build
npx cap add android
npx cap sync android
npx cap open android
```

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SPOTIFY_CLIENT_ID` | Yes | — | Spotify API OAuth client ID |
| `SPOTIFY_CLIENT_SECRET` | Yes | — | Spotify API OAuth client secret |
| `VITE_SPOTIFY_CLIENT_ID` | For CF | — | Spotify client ID for Cloudflare Functions |
| `SPOTIFY_REDIRECT_URI` | No | `http://localhost:8000/api/auth/spotify/callback` | OAuth redirect URI |
| `CLIENT_URL` | No | `http://localhost:5173` | Frontend URL for OAuth redirect |
| `VITE_API_URL` | For APK | `''` (same-origin) | Backend API URL (set at build time) |
| `JAMENDO_CLIENT_ID` | No | — | Jamendo API key for additional audio source |

### Local Development

```bash
# Backend
cd api && python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt
uvicorn index:app --host 0.0.0.0 --port 8000

# Frontend (separate terminal)
cd frontend && npm install
VITE_API_URL=http://localhost:8000 npm run dev
```

### Key Dependencies

```
@ffmpeg/ffmpeg          # Client-side audio conversion via WebAssembly
@ffmpeg/util            # FFmpeg WASM utilities
browser-id3-writer      # ID3 tag writing in the browser
zustand                 # State management for download queue
@capacitor/*            # Mobile native platform bridge
lucide-react            # Icons
react-router-dom        # Routing
tailwindcss             # Styling
wrangler                # Cloudflare Pages deployment
```

## License

MIT
