# Project Instructions

This document provides instructions on how to build, run, and deploy the Spotify Downloader project.

## Project Structure

- `frontend/`: Contains the React + Vite frontend application, Capacitor Android wrapper, and serverless functions for API communication.
- `api/`: Contains the Python backend used by some components.

## Local Development

To run the frontend locally:
```bash
cd frontend
npm install
npm run dev
```

## Android App Build & Deployment

The Android app is built using Capacitor. Ensure your Android device is connected and USB debugging is enabled.

1. **Build the web assets:**
   ```bash
   cd frontend
   npm run build
   ```

2. **Sync with Capacitor:**
   ```bash
   npx cap sync android
   ```

3. **Install the APK to your mobile device:**
   ```bash
   cd android
   ./gradlew installDebug
   ```

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
