# Firebase Setup — Complete ✅

Everything has been automated except Syncing Capacitor.

## What's Been Done

### ✅ Firebase Project Created
- Project ID: `sinc-9088a`
- Display name: `Sinc`

### ✅ Android App Registered
- Package name: `com.spotdl.app`
- App ID: `1:207998504509:android:1d4fb6f86cf50280606454`

### ✅ google-services.json
- Saved to: `frontend/android/app/google-services.json`
- The `app/build.gradle` already auto-detects it and applies the Google Services plugin

### ✅ FCM Service Account Created
- Service account: `firebase-adminsdk-fbsvc@sinc-9088a.iam.gserviceaccount.com`
- Private key saved as Cloudflare Pages secret: `FCM_SERVICE_ACCOUNT`

### ✅ CF Secrets Set
| Secret | Value |
|--------|-------|
| `FCM_SERVICE_ACCOUNT` | Full service account JSON (for OAuth2 → FCM v1 API) |
| `FCM_API_KEY` | Random UUID — use as `x-api-key` header for server-to-server calls |

### ✅ D1 Migration Applied
- `migrations/0003_push_tokens.sql` executed on `sinc-db`
- Table `push_tokens` created with indexes

## What's Left

### 1. Sync Capacitor
```bash
cd frontend
npx cap sync android
```

### 2. Build & Test
```bash
npm run build
npx cap copy android
cd android && ./gradlew assembleDebug
```

### 3. Test Push Notifications
```bash
# Get your userId from the app (check /api/auth/me response or the admin dashboard)
curl -X POST https://spotify-downloader.pages.dev/api/fcm/send \
  -H "x-api-key: <FCM_API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"userId":"USER_ID","title":"Test Push","body":"Hello from Sinc!"}'
```

## Sending Push from Server Code
Use the `/api/fcm/send` endpoint from any server-side code:
```ts
await fetch('https://spotify-downloader.pages.dev/api/fcm/send', {
  method: 'POST',
  headers: {
    'x-api-key': FCM_API_KEY,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    userId: 'user-abc-123',
    title: 'Download Complete',
    body: 'Your track has finished downloading',
    data: { filePath: '/path/to/file.mp3' },
  }),
})
```
