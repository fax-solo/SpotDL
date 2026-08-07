# Project Instructions

This document provides instructions on how to build, run, and deploy the Spotify Downloader project.

## Project Structure

- `frontend/`: Contains the React + Vite web application and serverless functions for API communication.
- `app/`: Contains the Sinc Enhanced native Android app (Kotlin + Jetpack Compose).
- `api/`: Contains the Python backend used by some components.

## Local Development

To run the frontend locally:
```bash
cd frontend
npm install
npm run dev
```

## Android App Build & Deployment

The native Android app (Sinc Enhanced) lives in `app/`. Ensure your Android device is connected and USB debugging is enabled.

1. **Build the app:**
   ```bash
   cd app
   ./gradlew assembleDebug
   ```

2. **Install the APK to your mobile device:**
   ```bash
   ./gradlew installDebug
   ```

Release builds are automated via `.github/workflows/build-apk.yml`, which builds the signed
APK and uploads it to a GitHub Release on every push to `main`.

## Cloudflare Deployment

The frontend web app and its API functions can be deployed to Cloudflare Pages.

1. **Build the production web assets:**
   ```bash
   cd frontend
   npm run build
   ```

2. **Deploy to Cloudflare:**
   Ensure you have Wrangler authenticated (`npx wrangler login`). Then run:
   ```bash
   npm run cf:deploy
   ```
   *This runs `wrangler pages deploy dist --project-name=spotify-downloader` under the hood.*
