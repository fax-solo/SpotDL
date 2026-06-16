import { onRequest as __api_bandcamp_js_onRequest } from "/mnt/potato/Code/Spotify downloader/frontend/functions/api/bandcamp.js"
import { onRequest as __api_jamendo_js_onRequest } from "/mnt/potato/Code/Spotify downloader/frontend/functions/api/jamendo.js"
import { onRequest as __api_lyrics_js_onRequest } from "/mnt/potato/Code/Spotify downloader/frontend/functions/api/lyrics.js"
import { onRequest as __api_oembed_js_onRequest } from "/mnt/potato/Code/Spotify downloader/frontend/functions/api/oembed.js"
import { onRequest as __api_soundcloud_js_onRequest } from "/mnt/potato/Code/Spotify downloader/frontend/functions/api/soundcloud.js"
import { onRequest as __api_spotify_js_onRequest } from "/mnt/potato/Code/Spotify downloader/frontend/functions/api/spotify.js"
import { onRequest as __api_spotify_auth_js_onRequest } from "/mnt/potato/Code/Spotify downloader/frontend/functions/api/spotify-auth.js"
import { onRequest as __api_spotify_partner_js_onRequest } from "/mnt/potato/Code/Spotify downloader/frontend/functions/api/spotify-partner.js"
import { onRequest as __api_youtube_js_onRequest } from "/mnt/potato/Code/Spotify downloader/frontend/functions/api/youtube.js"

export const routes = [
    {
      routePath: "/api/bandcamp",
      mountPath: "/api",
      method: "",
      middlewares: [],
      modules: [__api_bandcamp_js_onRequest],
    },
  {
      routePath: "/api/jamendo",
      mountPath: "/api",
      method: "",
      middlewares: [],
      modules: [__api_jamendo_js_onRequest],
    },
  {
      routePath: "/api/lyrics",
      mountPath: "/api",
      method: "",
      middlewares: [],
      modules: [__api_lyrics_js_onRequest],
    },
  {
      routePath: "/api/oembed",
      mountPath: "/api",
      method: "",
      middlewares: [],
      modules: [__api_oembed_js_onRequest],
    },
  {
      routePath: "/api/soundcloud",
      mountPath: "/api",
      method: "",
      middlewares: [],
      modules: [__api_soundcloud_js_onRequest],
    },
  {
      routePath: "/api/spotify",
      mountPath: "/api",
      method: "",
      middlewares: [],
      modules: [__api_spotify_js_onRequest],
    },
  {
      routePath: "/api/spotify-auth",
      mountPath: "/api",
      method: "",
      middlewares: [],
      modules: [__api_spotify_auth_js_onRequest],
    },
  {
      routePath: "/api/spotify-partner",
      mountPath: "/api",
      method: "",
      middlewares: [],
      modules: [__api_spotify_partner_js_onRequest],
    },
  {
      routePath: "/api/youtube",
      mountPath: "/api",
      method: "",
      middlewares: [],
      modules: [__api_youtube_js_onRequest],
    },
  ]