var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// api/bandcamp.js
var HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36"
};
async function onRequest(context) {
  if (context.request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }
  try {
    const { action, query: query2, url } = await context.request.json();
    if (action === "search") return await handleSearch(query2);
    if (action === "info") return await handleInfo(url);
    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
__name(onRequest, "onRequest");
async function handleSearch(query2) {
  try {
    const searchUrl = `https://bandcamp.com/search?q=${encodeURIComponent(query2)}&item_type=t`;
    const res = await fetch(searchUrl, { headers: HEADERS });
    const html = await res.text();
    if (html.includes("Client Challenge") || html.includes("_fs-ch-")) {
      return new Response(JSON.stringify({ results: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
    const results = [];
    const regex = /<a href="(https:\/\/[^"]+\.bandcamp\.com\/track\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
    let match2;
    while ((match2 = regex.exec(html)) !== null) {
      const url = match2[1].replace(/&amp;/g, "&");
      const title = match2[2].replace(/<[^>]+>/g, "").trim();
      if (title && !results.some((r) => r.url === url)) {
        results.push({ url, title, artist: "", source: "bandcamp" });
      }
    }
    return new Response(JSON.stringify({ results: results.slice(0, 5) }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch {
    return new Response(JSON.stringify({ results: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }
}
__name(handleSearch, "handleSearch");
async function handleInfo(trackUrl) {
  try {
    const res = await fetch(trackUrl, { headers: HEADERS });
    const html = await res.text();
    if (html.includes("Client Challenge") || html.includes("_fs-ch-")) {
      return new Response(JSON.stringify({ error: "Bandcamp page blocked by client challenge" }), {
        status: 502,
        headers: { "Content-Type": "application/json" }
      });
    }
    const tralbumMatch = html.match(/data-tralbum="([^"]+)"/);
    if (tralbumMatch) {
      try {
        const data = JSON.parse(tralbumMatch[1].replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, "&"));
        const track = data?.trackinfo?.[0] || {};
        const audioUrl2 = track.file?.["mp3-128"] || track.file?.["aac-hi"] || null;
        if (audioUrl2) {
          return new Response(JSON.stringify({
            title: track.title || extractOgTitle(html),
            author: data?.artist || extractOgAuthor(html) || "Unknown",
            duration: String(track.duration || 0),
            audioUrl: audioUrl2.replace(/\\\//g, "/").replace(/&amp;/g, "&"),
            thumbnail: data?.artThumbnailURL || data?.artFullsizeURL || extractOgImage(html)
          }), {
            status: 200,
            headers: { "Content-Type": "application/json" }
          });
        }
      } catch {
      }
    }
    const audioUrl = extractOgAudio(html);
    if (audioUrl) {
      return new Response(JSON.stringify({
        title: extractOgTitle(html) || "Unknown",
        author: extractOgAuthor(html) || "Unknown",
        duration: "0",
        audioUrl,
        thumbnail: extractOgImage(html)
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
    const inlineAudio = extractInlineAudio(html);
    if (inlineAudio) {
      return new Response(JSON.stringify({
        title: extractOgTitle(html) || "Unknown",
        author: extractOgAuthor(html) || "Unknown",
        duration: "0",
        audioUrl: inlineAudio,
        thumbnail: extractOgImage(html)
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
    return new Response(JSON.stringify({ error: "No audio found on this page" }), {
      status: 502,
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 502,
      headers: { "Content-Type": "application/json" }
    });
  }
}
__name(handleInfo, "handleInfo");
function extractOgTitle(html) {
  const m = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/);
  return m?.[1] || null;
}
__name(extractOgTitle, "extractOgTitle");
function extractOgAuthor(html) {
  const m = html.match(/<meta\s+name="author"\s+content="([^"]+)"/);
  return m?.[1] || null;
}
__name(extractOgAuthor, "extractOgAuthor");
function extractOgImage(html) {
  const m = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/);
  return m?.[1] || null;
}
__name(extractOgImage, "extractOgImage");
function extractOgAudio(html) {
  const m = html.match(/<meta\s+property="og:audio"\s+content="([^"]+)"/);
  return m?.[1] || null;
}
__name(extractOgAudio, "extractOgAudio");
function extractInlineAudio(html) {
  const m = html.match(/"mp3-128":"([^"]+)"/);
  if (m) return m[1].replace(/\\\//g, "/").replace(/&amp;/g, "&");
  const aac = html.match(/"aac-hi":"([^"]+)"/);
  if (aac) return aac[1].replace(/\\\//g, "/").replace(/&amp;/g, "&");
  return null;
}
__name(extractInlineAudio, "extractInlineAudio");

// api/jamendo.js
var BASE = "https://api.jamendo.com/v3.0";
async function onRequest2(context) {
  if (context.request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }
  try {
    const { action, query: query2, url } = await context.request.json();
    if (action === "search") return await handleSearch2(context, query2);
    if (action === "info") return await handleInfo2(context, url);
    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
__name(onRequest2, "onRequest");
async function handleSearch2(context, query2) {
  const CLIENT_ID = context.env.JAMENDO_CLIENT_ID;
  if (!CLIENT_ID) {
    return new Response(JSON.stringify({ results: [], notice: "Jamendo API key not configured. Set JAMENDO_CLIENT_ID env var." }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }
  const res = await fetch(
    `${BASE}/tracks/?client_id=${CLIENT_ID}&format=json&limit=5&search=${encodeURIComponent(query2)}&include=musicinfo`,
    { headers: { "Accept": "application/json" } }
  );
  if (!res.ok) {
    return new Response(JSON.stringify({ results: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }
  const data = await res.json();
  const tracks = data?.results || [];
  const results = tracks.map((track) => ({
    url: track.id,
    title: track.name,
    artist: track.artist_name || "Unknown",
    duration: String(track.duration || 0),
    audioUrl: track.audio,
    thumbnail: track.image || track.album_image || null,
    source: "jamendo"
  }));
  return new Response(JSON.stringify({ results }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}
__name(handleSearch2, "handleSearch");
async function handleInfo2(context, trackId) {
  const CLIENT_ID = context.env.JAMENDO_CLIENT_ID;
  if (!CLIENT_ID) {
    return new Response(JSON.stringify({ error: "Jamendo API key not configured" }), {
      status: 502,
      headers: { "Content-Type": "application/json" }
    });
  }
  const res = await fetch(
    `${BASE}/tracks/?client_id=${CLIENT_ID}&format=json&id=${trackId}&include=musicinfo`,
    { headers: { "Accept": "application/json" } }
  );
  if (!res.ok) {
    return new Response(JSON.stringify({ error: "Jamendo API error" }), {
      status: 502,
      headers: { "Content-Type": "application/json" }
    });
  }
  const data = await res.json();
  const track = data?.results?.[0];
  if (!track) {
    return new Response(JSON.stringify({ error: "Track not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" }
    });
  }
  return new Response(JSON.stringify({
    title: track.name,
    author: track.artist_name,
    duration: String(track.duration || 0),
    audioUrl: track.audio,
    thumbnail: track.image || track.album_image || null
  }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}
__name(handleInfo2, "handleInfo");

// api/lyrics.js
var LRCLIB_API = "https://lrclib.net/api";
var CACHE_TTL = 864e5;
var _cache = /* @__PURE__ */ new Map();
function jsonOk(data) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}
__name(jsonOk, "jsonOk");
function jsonError(msg, status = 500) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
__name(jsonError, "jsonError");
async function fetchWithCache(url) {
  const cached = _cache.get(url);
  if (cached && Date.now() < cached.expires) return cached.data;
  const res = await fetch(url, {
    headers: { "User-Agent": "SpotDL/1.0 (github.com/user/spotdl)", "Lrclib-Client": "SpotDL/1.0" }
  });
  if (!res.ok) {
    if (res.status === 404) {
      _cache.set(url, { data: null, expires: Date.now() + CACHE_TTL });
      return null;
    }
    throw new Error(`LRCLIB returned ${res.status}`);
  }
  const data = await res.json();
  _cache.set(url, { data, expires: Date.now() + CACHE_TTL });
  if (_cache.size > 200) {
    const now = Date.now();
    for (const [k, v] of _cache) {
      if (now >= v.expires) _cache.delete(k);
    }
  }
  return data;
}
__name(fetchWithCache, "fetchWithCache");
async function onRequest3(context) {
  if (context.request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }
  try {
    const body = await context.request.json();
    const { trackName, artistName, albumName, duration } = body;
    if (!trackName || !artistName) {
      return jsonError("trackName and artistName are required", 400);
    }
    const params = new URLSearchParams({
      track_name: trackName,
      artist_name: artistName
    });
    if (albumName) params.set("album_name", albumName);
    const data = await fetchWithCache(`${LRCLIB_API}/get?${params}`);
    if (!data && duration) {
      const searchRes = await fetchWithCache(
        `${LRCLIB_API}/search?q=${encodeURIComponent(`${artistName} ${trackName}`)}`
      );
      if (searchRes && searchRes.length > 0) {
        const sorted = searchRes.filter((r) => r.duration && Math.abs(r.duration - duration) < 3e3).sort((a, b) => Math.abs(a.duration - duration) - Math.abs(b.duration - duration));
        return jsonOk(sorted[0] || searchRes[0]);
      }
    }
    return jsonOk(data || { plainLyrics: null, syncedLyrics: null });
  } catch (err) {
    return jsonError(err.message);
  }
}
__name(onRequest3, "onRequest");

// api/oembed.js
async function onRequest4(context) {
  if (context.request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }
  try {
    const { url } = await context.request.json();
    if (!url) {
      return new Response(JSON.stringify({ error: "Missing url" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }
    const oembedUrl = `https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`;
    const res = await fetch(oembedUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
      }
    });
    if (!res.ok) {
      return new Response(JSON.stringify({ error: `oEmbed returned ${res.status}` }), {
        status: 502,
        headers: { "Content-Type": "application/json" }
      });
    }
    const data = await res.json();
    return new Response(JSON.stringify({
      title: data.title || "Unknown",
      image: data.thumbnail_url || null,
      author: data.author_name || "Spotify"
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
__name(onRequest4, "onRequest");

// api/soundcloud.js
var HEADERS2 = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36"
};
async function onRequest5(context) {
  if (context.request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }
  try {
    const { action, query: query2, url } = await context.request.json();
    if (action === "search") return await handleSearch3(query2);
    if (action === "info") return await handleInfo3(url);
    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
__name(onRequest5, "onRequest");
async function getClientId() {
  const res = await fetch("https://soundcloud.com/", { headers: HEADERS2 });
  const html = await res.text();
  const match2 = html.match(/"apiClient","data":\{"id":"([^"]+)"/);
  if (match2) return match2[1];
  const fallback = html.match(/client_id["\s:=]+"([a-f0-9]+)"/i);
  if (fallback) return fallback[1];
  return null;
}
__name(getClientId, "getClientId");
async function handleSearch3(query2) {
  const cid = await getClientId();
  if (!cid) {
    return new Response(JSON.stringify({ results: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }
  const res = await fetch(
    `https://api-v2.soundcloud.com/search/tracks?q=${encodeURIComponent(query2)}&client_id=${cid}&limit=5`,
    { headers: HEADERS2 }
  );
  if (!res.ok) {
    return new Response(JSON.stringify({ results: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }
  const data = await res.json();
  const tracks = data?.collection || [];
  const results = tracks.map((t) => ({
    url: t.permalink_url || `https://soundcloud.com/${t.user.permalink}/${t.permalink}`,
    title: t.title || "Unknown",
    artist: t.user?.username || "Unknown",
    duration: String(Math.floor((t.duration || 0) / 1e3)),
    audioUrl: null,
    thumbnail: t.artwork_url?.replace("-large.", "-t500x500.") || null,
    source: "soundcloud"
  }));
  return new Response(JSON.stringify({ results }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}
__name(handleSearch3, "handleSearch");
async function handleInfo3(trackUrl) {
  const pathMatch = trackUrl.match(/soundcloud\.com(\/[^?#]+)/);
  if (!pathMatch) {
    return new Response(JSON.stringify({ error: "Invalid SoundCloud URL" }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }
  const path = pathMatch[1].replace(/\/$/, "");
  const cid = await getClientId();
  if (!cid) {
    return new Response(JSON.stringify({ error: "Failed to get SoundCloud client ID" }), {
      status: 502,
      headers: { "Content-Type": "application/json" }
    });
  }
  const resolveUrl = `https://api-v2.soundcloud.com/resolve?url=https://soundcloud.com${path}&client_id=${cid}`;
  const res = await fetch(resolveUrl, { headers: HEADERS2 });
  if (!res.ok) {
    return new Response(JSON.stringify({ error: "Track not found" }), {
      status: 502,
      headers: { "Content-Type": "application/json" }
    });
  }
  const track = await res.json();
  let audioUrl = null;
  if (track.downloadable && track.download_url) {
    const dlRes = await fetch(`${track.download_url}?client_id=${cid}`, {
      headers: HEADERS2,
      redirect: "manual"
    });
    if (dlRes.status >= 300 && dlRes.status < 400) {
      audioUrl = dlRes.headers.get("location");
    }
  }
  if (!audioUrl && track.media?.transcodings) {
    const transcodings = track.media.transcodings;
    const preferred = transcodings.find(
      (t) => t.format?.protocol === "progressive" && t.format?.mime_type?.startsWith("audio/mpeg")
    ) || transcodings.find(
      (t) => t.format?.protocol === "progressive"
    ) || transcodings[0];
    if (preferred) {
      const streamRes = await fetch(`${preferred.url}?client_id=${cid}`, { headers: HEADERS2 });
      if (streamRes.ok) {
        const streamData = await streamRes.json();
        audioUrl = streamData?.url || null;
      }
    }
  }
  return new Response(JSON.stringify({
    title: track.title || "Unknown",
    author: track.user?.username || "Unknown",
    duration: String(Math.floor((track.duration || 0) / 1e3)),
    audioUrl,
    thumbnail: track.artwork_url?.replace("-large.", "-t500x500.") || null
  }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}
__name(handleInfo3, "handleInfo");

// api/spotify.js
function abortTimeout(ms) {
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
    return AbortSignal.timeout(ms);
  }
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}
__name(abortTimeout, "abortTimeout");
var WOLFX_API = "https://spotify.xwolf.space/api";
var SPOTIFY_PATTERNS = {
  track: /spotify\.com\/track\/([a-zA-Z0-9]+)/,
  album: /spotify\.com\/album\/([a-zA-Z0-9]+)/,
  playlist: /spotify\.com\/playlist\/([a-zA-Z0-9]+)/,
  artist: /spotify\.com\/artist\/([a-zA-Z0-9]+)/,
  show: /spotify\.com\/show\/([a-zA-Z0-9]+)/,
  episode: /spotify\.com\/episode\/([a-zA-Z0-9]+)/
};
function hasArabic(text) {
  return /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(text);
}
__name(hasArabic, "hasArabic");
function normalizeText(text) {
  return text.toLowerCase().replace(/[^\w\s]/g, "").trim();
}
__name(normalizeText, "normalizeText");
function isArtistMatch(query2, artistName) {
  const q = normalizeText(query2);
  const a = normalizeText(artistName);
  if (a === q) return 2;
  if (a.includes(q) || q.includes(a)) return 1;
  if (hasArabic(query2) && a.includes(q)) return 1;
  return 0;
}
__name(isArtistMatch, "isArtistMatch");
var _tokenCache = { token: null, expiresAt: 0 };
async function getSpotifyToken(context) {
  if (_tokenCache.token && Date.now() < _tokenCache.expiresAt - 6e4) return _tokenCache.token;
  const clientId = context.env.VITE_SPOTIFY_CLIENT_ID;
  const clientSecret = context.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Authorization": "Basic " + btoa(clientId + ":" + clientSecret),
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: "grant_type=client_credentials",
    signal: abortTimeout(1e4)
  });
  if (!res.ok) return null;
  const data = await res.json();
  _tokenCache = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1e3 };
  return data.access_token;
}
__name(getSpotifyToken, "getSpotifyToken");
async function officialFetch(context, path) {
  const token = await getSpotifyToken(context);
  if (!token) return null;
  const res = await fetch(`https://api.spotify.com/v1${path}`, {
    headers: { "Authorization": `Bearer ${token}` },
    signal: abortTimeout(1e4)
  });
  if (!res.ok) return null;
  return res.json();
}
__name(officialFetch, "officialFetch");
var _cache2 = /* @__PURE__ */ new Map();
var CACHE_TTL2 = 3e4;
var EMBED_CACHE_TTL = 3e5;
async function wolfxFetch(path) {
  const cached = _cache2.get(path);
  if (cached && Date.now() < cached.expires) return cached.data;
  const res = await fetch(`${WOLFX_API}${path}`);
  if (!res.ok) return null;
  const data = await res.json();
  const result = data.success ? data : null;
  _cache2.set(path, { data: result, expires: Date.now() + CACHE_TTL2 });
  if (_cache2.size > 200) {
    const now = Date.now();
    for (const [k, v] of _cache2) {
      if (now >= v.expires) _cache2.delete(k);
    }
  }
  return result;
}
__name(wolfxFetch, "wolfxFetch");
function cacheKey(kind, id, summary) {
  return `embed:${kind}:${id}:${summary ? "1" : "0"}`;
}
__name(cacheKey, "cacheKey");
function getCachedResponse(kind, id, summary) {
  const key = cacheKey(kind, id, summary);
  const entry = _cache2.get(key);
  if (entry && Date.now() < entry.expires) return entry.data;
  return null;
}
__name(getCachedResponse, "getCachedResponse");
function setCachedResponse(kind, id, summary, data) {
  const key = cacheKey(kind, id, summary);
  _cache2.set(key, { data, expires: Date.now() + EMBED_CACHE_TTL });
  if (_cache2.size > 300) {
    const now = Date.now();
    for (const [k, v] of _cache2) {
      if (now >= v.expires) _cache2.delete(k);
    }
  }
}
__name(setCachedResponse, "setCachedResponse");
function extractImage(entity) {
  try {
    const sources = entity.coverArt?.sources || [];
    if (sources.length) {
      sources.sort((a, b) => (b.width || 0) - (a.width || 0));
      return sources[0].url;
    }
  } catch {
  }
  try {
    const images = entity.visualIdentity?.image || [];
    if (images.length) {
      images.sort((a, b) => (b.maxHeight || 0) - (a.maxHeight || 0));
      return images[0].url;
    }
  } catch {
  }
  return null;
}
__name(extractImage, "extractImage");
function extractTrackImage(item) {
  for (const key of ["coverArt", "albumOfTrack", "album"]) {
    try {
      const sub = item[key];
      if (!sub) continue;
      const sources = sub.coverArt?.sources || sub.sources || [];
      if (sources.length) {
        sources.sort((a, b) => (b.width || 0) - (a.width || 0));
        return sources[0].url;
      }
    } catch {
    }
  }
  try {
    if (item.image) return item.image;
  } catch {
  }
  try {
    if (item.images?.[0]?.url) return item.images[0].url;
  } catch {
  }
  try {
    if (item.thumbnail) return item.thumbnail;
  } catch {
  }
  return null;
}
__name(extractTrackImage, "extractTrackImage");
function extractTrackAlbum(item) {
  for (const key of ["album", "albumOfTrack"]) {
    try {
      const album = item[key];
      if (album?.name) return album.name;
    } catch {
    }
  }
  return null;
}
__name(extractTrackAlbum, "extractTrackAlbum");
async function fillTrackArtwork(tracks, ids, collectionArtwork, context) {
  const stillMissing = /* @__PURE__ */ __name(() => ids.filter((id) => {
    const idx = tracks.findIndex((t) => t.url.includes(id));
    return idx !== -1 && (!tracks[idx].artwork_url || tracks[idx].artwork_url === collectionArtwork);
  }), "stillMissing");
  try {
    const token = await getSpotifyToken(context);
    if (token) {
      const todo = stillMissing();
      for (let i = 0; i < todo.length; i += 50) {
        const batch = todo.slice(i, i + 50);
        const res = await fetch(`https://api.spotify.com/v1/tracks?ids=${batch.join(",")}`, {
          headers: { "Authorization": `Bearer ${token}` },
          signal: abortTimeout(1e4)
        });
        if (!res.ok) continue;
        const data = await res.json();
        for (const t of data.tracks || []) {
          if (!t?.album?.images?.[0]?.url) continue;
          const idx = tracks.findIndex((track) => track.url.includes(t.id));
          if (idx !== -1) tracks[idx].artwork_url = t.album.images[0].url;
        }
      }
    }
  } catch {
  }
  {
    const todo = stillMissing().slice(0, 30);
    if (todo.length > 0) {
      const results = await Promise.allSettled(
        todo.map(
          (id) => wolfxFetch(`/track/${id}`).then((d) => ({ id, data: d }))
        )
      );
      for (const r of results) {
        if (r.status !== "fulfilled" || !r.value.data) continue;
        const t = r.value.data.track || r.value.data;
        const artwork = t.thumbnail || t.artwork_url || null;
        if (!artwork) continue;
        const idx = tracks.findIndex((track) => track.url.includes(r.value.id));
        if (idx !== -1) tracks[idx].artwork_url = artwork;
      }
    }
  }
}
__name(fillTrackArtwork, "fillTrackArtwork");
async function handleEmbedScrape(context, url, summary) {
  let kind = null, id = null;
  for (const [k, pattern] of Object.entries(SPOTIFY_PATTERNS)) {
    const m = pattern.exec(url);
    if (m) {
      kind = k;
      id = m[1];
      break;
    }
  }
  if (!kind || !id) return jsonError2("Invalid Spotify URL", 400);
  const cached = getCachedResponse(kind, id, summary);
  if (cached) return cached;
  if (kind === "playlist" || kind === "album") {
    try {
      const wolfData = await wolfxFetch(`/${kind}/${id}`);
      if (wolfData) {
        const entity = wolfData.playlist || wolfData.album || wolfData;
        if (entity && entity.trackList && entity.trackList.length > 0) {
          return await handleEmbeddedEntity(context, kind, id, entity, summary);
        }
      }
    } catch {
    }
  }
  const embedUrl = `https://open.spotify.com/embed/${kind}/${id}`;
  const UAS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/119.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/118.0.0.0 Safari/537.36"
  ];
  let lastErr = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const ua = UAS[attempt % UAS.length];
    const res = await fetch(embedUrl, {
      headers: { "User-Agent": ua, "Accept-Language": "en-US,en;q=0.9" }
    });
    if (res.ok) {
      const html = await res.text();
      const match2 = html.match(/<script id="__NEXT_DATA__" type="application\/json">(.+?)<\/script>/);
      if (match2) {
        const data = JSON.parse(match2[1]);
        const entity = data?.props?.pageProps?.state?.data?.entity;
        if (entity) return await handleEmbeddedEntity(context, kind, id, entity, summary);
      }
      return jsonError2("Could not find embed data", 502);
    }
    if (res.status === 429) {
      lastErr = { status: 429, msg: "Spotify rate limited" };
      const delay = 1e3 * Math.pow(2, attempt) + Math.random() * 500;
      await new Promise((r) => setTimeout(r, delay));
      continue;
    }
    return jsonError2(`Spotify returned ${res.status}`, 502);
  }
  return jsonError2(lastErr.msg, 429);
}
__name(handleEmbedScrape, "handleEmbedScrape");
async function handleEmbeddedEntity(context, kind, id, entity, summary) {
  const result = buildEmbedResult(kind, id, entity, summary);
  if (result && typeof result.buildResponse === "function") {
    const resp = result.buildResponse();
    setCachedResponse(kind, id, summary, resp);
    if (result.noArtworkIds.length > 0 && !summary && kind !== "album") {
      fillTrackArtwork(result.tracks, result.noArtworkIds, result.collectionArtwork, context).then(() => setCachedResponse(kind, id, summary, result.buildResponse())).catch(() => {
      });
    }
    return resp;
  }
  setCachedResponse(kind, id, summary, result);
  return result;
}
__name(handleEmbeddedEntity, "handleEmbeddedEntity");
function buildEmbedResult(kind, id, entity, summary) {
  if (summary && kind !== "track") {
    return jsonOk2({
      id,
      name: entity.title || "Unknown",
      image: extractImage(entity),
      track_count: (entity.trackList || []).length,
      owner: entity.ownerName || entity.subtitle || "Spotify",
      description: entity.description || ""
    });
  }
  if (kind === "track") {
    const artistName = entity.artists ? entity.artists.map((a) => a.name).join(", ") : entity.subtitle || "Unknown Artist";
    return jsonOk2({
      type: "track",
      title: entity.title || "Unknown Track",
      artist: artistName,
      artist_id: entity.artists?.[0]?.uri?.split(":")[2] || null,
      album: (entity.albumOfTrack || entity.album)?.name || "Single",
      album_id: (entity.albumOfTrack || entity.album)?.uri?.split(":")[2] || null,
      artwork_url: extractImage(entity),
      url: `https://open.spotify.com/track/${id}`
    });
  }
  const trackList = entity.trackList || [];
  const collectionArtwork = extractImage(entity);
  const isAlbum = kind === "album";
  const noArtworkIds = [];
  const tracks = trackList.filter((item) => item.uri && item.uri.startsWith("spotify:track:")).map((item) => {
    const artwork = extractTrackImage(item);
    if (!artwork) noArtworkIds.push(item.uri.split(":")[2]);
    return {
      title: item.title || "Unknown Track",
      artist: item.subtitle || "Unknown Artist",
      album: extractTrackAlbum(item) || (isAlbum ? entity.title : "Unknown Album"),
      artwork_url: artwork || collectionArtwork,
      url: `https://open.spotify.com/track/${item.uri.split(":")[2]}`,
      type: "track"
    };
  });
  return {
    tracks,
    noArtworkIds,
    collectionArtwork,
    buildResponse() {
      return jsonOk2({
        type: "collection",
        collection_name: entity.title || "Unknown",
        collection_artwork: collectionArtwork,
        collection_type: entity.type === "album" ? "album" : "playlist",
        tracks
      });
    }
  };
}
__name(buildEmbedResult, "buildEmbedResult");
async function enrichTrackArtwork(tracks) {
  const missing = tracks.filter((t) => !t.artwork_url).map((t) => t.id).slice(0, 15);
  if (missing.length === 0) return;
  const results = await Promise.allSettled(
    missing.map(
      (id) => wolfxFetch(`/track/${id}`).then((d) => ({ id, data: d }))
    )
  );
  for (const r of results) {
    if (r.status !== "fulfilled" || !r.value.data) continue;
    const t = r.value.data.track || r.value.data;
    const artwork = t.thumbnail || t.artwork_url || t.album?.images?.[0]?.url || null;
    if (!artwork) continue;
    const idx = tracks.findIndex((track) => track.id === r.value.id);
    if (idx !== -1) tracks[idx].artwork_url = artwork;
  }
}
__name(enrichTrackArtwork, "enrichTrackArtwork");
async function handleSearch4(context, query2, types, limit) {
  const typesArr = types.split(",").map((t) => t.trim());
  const searches = typesArr.map(
    (type) => wolfxFetch(`/search?q=${encodeURIComponent(query2)}&type=${type}&limit=${limit}`).then((d) => ({ type, data: d })).catch(() => ({ type, data: null }))
  );
  const results = await Promise.all(searches);
  const anyResults = results.some((r) => r.data?.results?.length > 0);
  if (!anyResults) {
    try {
      const officialResults = await Promise.all(typesArr.map(
        (type) => officialSearch(context, query2, type, limit).then((d) => ({ type, data: d })).catch(() => ({ type, data: null }))
      ));
      if (officialResults.some((r) => r.data?.length > 0)) results.splice(0, results.length, ...officialResults);
    } catch {
    }
  }
  const result = { tracks: [], albums: [], artists: [], playlists: [], shows: [], top_artist: null };
  for (const { type, data } of results) {
    if (!data) continue;
    const items = data.results || data || [];
    if (!Array.isArray(items)) continue;
    if (type === "track") {
      result.tracks = items.map((t) => ({
        id: t.id,
        title: t.title,
        artist: t.artist,
        artist_id: t.artist_id || t.artists?.[0]?.id || null,
        album_id: t.album_id || t.album?.id || null,
        album: t.album || t.album?.name || "Unknown",
        artwork_url: t.thumbnail || t.artwork_url || t.album?.images?.[0]?.url || null,
        url: t.url || `https://open.spotify.com/track/${t.id}`,
        duration_ms: t.duration_ms || t.duration || 0
      }));
      enrichTrackArtwork(result.tracks).catch(() => {
      });
    } else if (type === "artist") {
      result.artists = items.map((a) => ({
        id: a.id,
        name: a.name,
        image: a.thumbnail || a.image || a.images?.[0]?.url || null,
        genres: a.genres || [],
        followers: a.followers?.total || 0,
        url: `https://open.spotify.com/artist/${a.id}`
      }));
    } else if (type === "album") {
      result.albums = items.map((a) => ({
        id: a.id,
        name: a.name,
        artist: a.artist || a.artists?.[0]?.name || "",
        image: a.thumbnail || a.images?.[0]?.url || null,
        year: a.year || (a.release_date ? a.release_date.slice(0, 4) : null),
        url: `https://open.spotify.com/album/${a.id}`
      }));
    } else if (type === "playlist") {
      result.playlists = items.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description || "",
        image: p.thumbnail || p.images?.[0]?.url || null,
        owner: p.owner || p.owner?.display_name || "Spotify",
        trackCount: p.track_count || p.tracks?.total || 0
      }));
    } else if (type === "show") {
      result.shows = items.map((s) => ({
        id: s.id,
        name: s.name,
        publisher: s.publisher,
        description: s.description || "",
        image: s.thumbnail || null,
        total_episodes: s.total_episodes || 0
      }));
    }
  }
  const bestMatch = result.artists.reduce((best, a) => {
    const score = isArtistMatch(query2, a.name);
    return score > best.score ? { artist: a, score } : best;
  }, { artist: null, score: 0 });
  if (bestMatch.score >= 1) result.top_artist = bestMatch.artist;
  if (!result.top_artist && result.tracks.length > 0) {
    const seen = /* @__PURE__ */ new Set();
    for (const t of result.tracks) {
      if (!t.artist_id) continue;
      const name = t.artist;
      if (!name || name === "Unknown" || seen.has(name)) continue;
      seen.add(name);
      result.artists.push({
        id: t.artist_id,
        name,
        image: null,
        genres: [],
        followers: 0,
        url: `https://open.spotify.com/artist/${t.artist_id}`
      });
    }
    if (result.artists.length > 0) {
      result.artists.sort((a, b) => isArtistMatch(query2, b.name) - isArtistMatch(query2, a.name));
      result.top_artist = result.artists[0];
    }
  }
  return jsonOk2(result);
}
__name(handleSearch4, "handleSearch");
async function officialSearch(context, query2, type, limit) {
  const token = await getSpotifyToken(context);
  if (!token) return null;
  const res = await fetch(
    `https://api.spotify.com/v1/search?q=${encodeURIComponent(query2)}&type=${type}&limit=${limit}&market=EG`,
    { headers: { "Authorization": `Bearer ${token}` }, signal: abortTimeout(1e4) }
  );
  if (!res.ok) return null;
  const data = await res.json();
  if (type === "track") return (data.tracks?.items || []).map((t) => ({
    id: t.id,
    title: t.name,
    artist: t.artists?.map((a) => a.name).join(", ") || "Unknown",
    artist_id: t.artists?.[0]?.id || null,
    album: t.album?.name || "Unknown",
    album_id: t.album?.id || null,
    thumbnail: t.album?.images?.[0]?.url || null,
    url: t.external_urls?.spotify || `https://open.spotify.com/track/${t.id}`,
    duration_ms: t.duration_ms || 0
  }));
  if (type === "artist") return (data.artists?.items || []).map((a) => ({
    id: a.id,
    name: a.name,
    thumbnail: a.images?.[0]?.url || null,
    genres: a.genres || [],
    followers: a.followers?.total || 0
  }));
  if (type === "album") return (data.albums?.items || []).map((a) => ({
    id: a.id,
    name: a.name,
    artist: a.artists?.[0]?.name || "",
    thumbnail: a.images?.[0]?.url || null,
    year: a.release_date?.slice(0, 4) || null
  }));
  if (type === "playlist") return (data.playlists?.items || []).map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description || "",
    thumbnail: p.images?.[0]?.url || null,
    owner: p.owner?.display_name || "Spotify",
    track_count: p.tracks?.total || 0
  }));
  if (type === "show") return (data.shows?.items || []).map((s) => ({
    id: s.id,
    name: s.name,
    publisher: s.publisher,
    description: s.description || "",
    thumbnail: s.images?.[0]?.url || null,
    total_episodes: s.total_episodes || 0
  }));
  return null;
}
__name(officialSearch, "officialSearch");
async function handleArtist(context, id) {
  const [profile, topTracks, albums, relatedOfficial, appearsOnOfficial] = await Promise.all([
    wolfxFetch(`/artist/${id}`),
    wolfxFetch(`/artist/${id}/top-tracks`),
    wolfxFetch(`/artist/${id}/albums?limit=20`),
    officialFetch(context, `/artists/${id}/related-artists`).catch(() => null),
    officialFetch(context, `/artists/${id}/albums?include_groups=appears_on&limit=10&market=EG`).catch(() => null)
  ]);
  const appearsOnAlbums = (appearsOnOfficial?.items || []).map((a) => ({
    id: a.id,
    name: a.name,
    image: a.images?.[0]?.url || null,
    year: a.release_date?.slice(0, 4) || null,
    url: `https://open.spotify.com/album/${a.id}`,
    type: a.album_type || "album",
    artist: a.artists?.map((ar) => ar.name).join(", ") || ""
  }));
  const relatedArtists = (relatedOfficial?.artists || []).map((a) => ({
    id: a.id,
    name: a.name,
    image: a.images?.[0]?.url || null
  }));
  if (!profile) {
    try {
      const official = await officialFetch(context, `/artists/${id}`);
      if (official) {
        const [topTracksOfficial, albumsOfficial] = await Promise.all([
          officialFetch(context, `/artists/${id}/top-tracks?market=EG`).catch(() => null),
          officialFetch(context, `/artists/${id}/albums?limit=20&market=EG&include_groups=album,single,compilation`).catch(() => null)
        ]);
        const albumList2 = (albumsOfficial?.items || []).map((a) => ({
          id: a.id,
          name: a.name,
          image: a.images?.[0]?.url || null,
          year: a.release_date?.slice(0, 4) || null,
          url: `https://open.spotify.com/album/${a.id}`,
          type: a.album_type || "album"
        }));
        albumList2.sort((a, b) => (b.year || 0) - (a.year || 0));
        return jsonOk2({
          id,
          name: official.name || "Unknown",
          image: official.images?.[0]?.url || null,
          genres: official.genres || [],
          followers: official.followers?.total || 0,
          popularity: official.popularity || 0,
          top_tracks: (topTracksOfficial?.tracks || []).map((t) => ({
            id: t.id,
            title: t.name,
            album: t.album?.name || "Unknown",
            artist: t.artists?.map((a) => a.name).join(", ") || official.name,
            artist_id: t.artists?.[0]?.id || null,
            album_id: t.album?.id || null,
            artwork_url: t.album?.images?.[0]?.url || null,
            url: `https://open.spotify.com/track/${t.id}`,
            duration_ms: t.duration_ms || 0
          })),
          albums: albumList2,
          latest_release: albumList2[0] || null,
          featuring: appearsOnAlbums,
          related_artists: relatedArtists
        });
      }
    } catch {
    }
    try {
      const embedRes = await fetch(`https://open.spotify.com/embed/artist/${id}`, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36" },
        signal: abortTimeout(8e3)
      });
      if (embedRes.ok) {
        const html = await embedRes.text();
        const match2 = html.match(/<script id="__NEXT_DATA__" type="application\/json">(.+?)<\/script>/);
        if (match2) {
          const data = JSON.parse(match2[1]);
          const entity = data?.props?.pageProps?.state?.data?.entity;
          if (entity && entity.title) {
            const tracks = (entity.trackList || []).map((t) => ({
              id: t.uri?.split(":")[2] || "",
              title: t.title || "Unknown",
              album: extractTrackAlbum(t) || "Single",
              artist: t.subtitle || entity.title,
              artist_id: id,
              album_id: null,
              artwork_url: extractTrackImage(t) || extractImage(entity),
              url: t.uri ? `https://open.spotify.com/track/${t.uri.split(":")[2]}` : "",
              duration_ms: 0
            }));
            return jsonOk2({
              id,
              name: entity.title,
              image: extractImage(entity),
              genres: [],
              followers: 0,
              popularity: 0,
              top_tracks: tracks,
              albums: [],
              latest_release: null,
              featuring: [],
              related_artists: []
            });
          }
        }
      }
    } catch {
    }
    return jsonError2("Artist not found", 404);
  }
  const p = profile.artist || profile;
  const albumList = (albums?.albums || albums?.results || []).map((a) => ({
    id: a.id,
    name: a.name,
    image: a.thumbnail || null,
    year: a.year || null,
    url: `https://open.spotify.com/album/${a.id}`,
    type: a.type || "album"
  }));
  albumList.sort((a, b) => (b.year || 0) - (a.year || 0));
  const topTracksArr = (topTracks?.tracks || topTracks?.results || []).map((t) => ({
    id: t.id,
    title: t.title,
    album: t.album || "Unknown",
    artist: t.artist || p.name,
    artist_id: t.artist_id || null,
    album_id: t.album_id || null,
    artwork_url: t.thumbnail || t.artwork_url || t.album?.images?.[0]?.url || null,
    url: `https://open.spotify.com/track/${t.id}`,
    duration_ms: t.duration_ms || 0
  }));
  enrichTrackArtwork(topTracksArr).catch(() => {
  });
  return jsonOk2({
    id,
    name: p.name || "Unknown",
    image: p.image || p.thumbnail || null,
    genres: p.genres || [],
    followers: p.followers || 0,
    popularity: p.popularity || 0,
    top_tracks: topTracksArr,
    albums: albumList,
    latest_release: albumList[0] || null,
    featuring: appearsOnAlbums,
    related_artists: relatedArtists
  });
}
__name(handleArtist, "handleArtist");
async function handleTrack(context, id) {
  const data = await wolfxFetch(`/track/${id}`);
  if (data) {
    const t = data.track || data;
    const albumName = typeof t.album === "string" ? t.album : t.album?.name || null;
    const albumId = typeof t.album === "string" ? null : t.album?.id || null;
    if (t.title && albumName) {
      return jsonOk2({
        id: t.id,
        title: t.title || "Unknown Track",
        artist: t.artists?.map((a) => a.name).join(", ") || t.artist || "Unknown Artist",
        artist_id: t.artists?.[0]?.id || null,
        album: albumName,
        album_id: albumId,
        artwork_url: t.thumbnail || t.artwork_url || null,
        url: `https://open.spotify.com/track/${id}`,
        duration_ms: t.duration_ms || 0
      });
    }
  }
  const embedResult = await handleEmbedScrape(context, `https://open.spotify.com/track/${id}`, false);
  if (embedResult.status === 200) {
    const cloned = embedResult.clone();
    const parsed = await cloned.json();
    if (parsed.title && parsed.title !== "Unknown Track") return embedResult;
  }
  const official = await officialFetch(context, `/tracks/${id}`);
  if (official) {
    return jsonOk2({
      id: official.id,
      title: official.name || "Unknown Track",
      artist: official.artists?.map((a) => a.name).join(", ") || "Unknown Artist",
      artist_id: official.artists?.[0]?.id || null,
      album: official.album?.name || "Unknown Album",
      album_id: official.album?.id || null,
      artwork_url: official.album?.images?.[0]?.url || null,
      url: official.external_urls?.spotify || `https://open.spotify.com/track/${id}`,
      duration_ms: official.duration_ms || 0
    });
  }
  try {
    const oembedRes = await fetch(
      `https://open.spotify.com/oembed?url=${encodeURIComponent("https://open.spotify.com/track/" + id)}`,
      { headers: { "User-Agent": "Mozilla/5.0" }, signal: abortTimeout(5e3) }
    );
    if (oembedRes.ok) {
      const oembed = await oembedRes.json();
      return jsonOk2({
        id,
        title: oembed.title || "Unknown Track",
        artist: oembed.author_name || "Unknown Artist",
        artist_id: null,
        album: "Single",
        album_id: null,
        artwork_url: oembed.thumbnail_url || null,
        url: `https://open.spotify.com/track/${id}`,
        duration_ms: 0
      });
    }
  } catch {
  }
  if (embedResult.status === 200) return embedResult;
  return jsonError2("Track not found", 404);
}
__name(handleTrack, "handleTrack");
async function handleOfficialCollection(context, kind, id) {
  const token = await getSpotifyToken(context);
  if (!token) return null;
  if (kind === "playlist") {
    const res = await fetch(`https://api.spotify.com/v1/playlists/${id}`, {
      headers: { "Authorization": `Bearer ${token}` },
      signal: abortTimeout(1e4)
    });
    if (!res.ok) return null;
    const data = await res.json();
    const tracks = (data.tracks?.items || []).filter((item) => item.track).map((item) => {
      const t = item.track;
      const albumName = t.album?.name || "Unknown Album";
      const artworkUrl = t.album?.images?.[0]?.url || null;
      return {
        title: t.name || "Unknown Track",
        artist: (t.artists || []).map((a) => a.name).join(", ") || "Unknown Artist",
        album: albumName,
        artwork_url: artworkUrl,
        url: `https://open.spotify.com/track/${t.id}`,
        type: "track"
      };
    });
    return jsonOk2({
      type: "collection",
      collection_name: data.name || "Unknown",
      collection_artwork: data.images?.[0]?.url || null,
      collection_type: "playlist",
      tracks
    });
  }
  if (kind === "album") {
    const res = await fetch(`https://api.spotify.com/v1/albums/${id}`, {
      headers: { "Authorization": `Bearer ${token}` },
      signal: abortTimeout(1e4)
    });
    if (!res.ok) return null;
    const data = await res.json();
    const tracks = (data.tracks?.items || []).map((t) => ({
      title: t.name || "Unknown Track",
      artist: (t.artists || []).map((a) => a.name).join(", ") || data.artists?.[0]?.name || "Unknown Artist",
      album: data.name || "Unknown Album",
      artwork_url: data.images?.[0]?.url || null,
      url: `https://open.spotify.com/track/${t.id}`,
      type: "track"
    }));
    return jsonOk2({
      type: "collection",
      collection_name: data.name || "Unknown",
      collection_artwork: data.images?.[0]?.url || null,
      collection_type: "album",
      tracks
    });
  }
  return null;
}
__name(handleOfficialCollection, "handleOfficialCollection");
async function handleTestCredentials(context) {
  const hasId = !!context.env.VITE_SPOTIFY_CLIENT_ID;
  const hasSecret = !!context.env.SPOTIFY_CLIENT_SECRET;
  if (!hasId || !hasSecret) {
    return jsonOk2({ ok: false, hasId, hasSecret, error: "Missing env vars" });
  }
  try {
    const res = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        "Authorization": "Basic " + btoa(context.env.VITE_SPOTIFY_CLIENT_ID + ":" + context.env.SPOTIFY_CLIENT_SECRET),
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: "grant_type=client_credentials",
      signal: abortTimeout(1e4)
    });
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
    return jsonOk2({
      ok: res.ok,
      status: res.status,
      hasId,
      hasSecret,
      error: data?.error || data?.error_description || (res.ok ? null : `HTTP ${res.status}`),
      hint: data?.error === "invalid_client" ? "Check your Client ID and Secret - they may be wrong" : void 0
    });
  } catch (err) {
    return jsonOk2({ ok: false, hasId, hasSecret, error: err.message });
  }
}
__name(handleTestCredentials, "handleTestCredentials");
async function handleNewReleases(context, limit = 20) {
  const token = await getSpotifyToken(context);
  if (!token) return jsonError2("No Spotify token available", 401);
  const res = await fetch(
    `https://api.spotify.com/v1/browse/new-releases?limit=${limit}&market=EG`,
    { headers: { "Authorization": `Bearer ${token}` }, signal: abortTimeout(1e4) }
  );
  if (!res.ok) return jsonError2("Failed to fetch new releases", res.status);
  const data = await res.json();
  const albums = (data.albums?.items || []).map((a) => ({
    id: a.id,
    name: a.name,
    artist: a.artists?.map((ar) => ar.name).join(", ") || "",
    image: a.images?.[0]?.url || null,
    year: a.release_date?.slice(0, 4) || null,
    url: a.external_urls?.spotify || `https://open.spotify.com/album/${a.id}`,
    type: a.album_type || "album",
    total_tracks: a.total_tracks || 0
  }));
  return jsonOk2({ albums });
}
__name(handleNewReleases, "handleNewReleases");
async function handleRecentlyPlayed(context, limit = 20) {
  const token = await getSpotifyToken(context);
  if (!token) return jsonError2("No Spotify token available", 401);
  const res = await fetch(
    `https://api.spotify.com/v1/me/player/recently-played?limit=${limit}`,
    { headers: { "Authorization": `Bearer ${token}` }, signal: abortTimeout(1e4) }
  );
  if (!res.ok) return jsonError2("Failed to fetch recently played", res.status);
  const data = await res.json();
  const tracks = (data.items || []).map((item) => {
    const t = item.track;
    if (!t) return null;
    return {
      id: t.id,
      title: t.name || "Unknown Track",
      artist: t.artists?.map((a) => a.name).join(", ") || "Unknown Artist",
      artist_id: t.artists?.[0]?.id || null,
      album: t.album?.name || "Unknown Album",
      album_id: t.album?.id || null,
      artwork_url: t.album?.images?.[0]?.url || null,
      url: t.external_urls?.spotify || `https://open.spotify.com/track/${t.id}`,
      duration_ms: t.duration_ms || 0,
      played_at: item.played_at || null
    };
  }).filter(Boolean);
  return jsonOk2({ tracks });
}
__name(handleRecentlyPlayed, "handleRecentlyPlayed");
async function handleCategories(context, limit = 50) {
  const token = await getSpotifyToken(context);
  if (!token) return jsonError2("No Spotify token available", 401);
  const res = await fetch(
    `https://api.spotify.com/v1/browse/categories?limit=${limit}&locale=en_US`,
    { headers: { "Authorization": `Bearer ${token}` }, signal: abortTimeout(1e4) }
  );
  if (!res.ok) return jsonError2("Failed to fetch categories", res.status);
  const data = await res.json();
  const categories = (data.categories?.items || []).map((c) => ({
    id: c.id,
    name: c.name,
    image: c.icons?.[0]?.url || null
  }));
  return jsonOk2({ categories });
}
__name(handleCategories, "handleCategories");
async function handleCategoryPlaylists(context, categoryId, limit = 20) {
  const token = await getSpotifyToken(context);
  if (!token) return jsonError2("No Spotify token available", 401);
  const res = await fetch(
    `https://api.spotify.com/v1/browse/categories/${categoryId}/playlists?limit=${limit}&market=EG`,
    { headers: { "Authorization": `Bearer ${token}` }, signal: abortTimeout(1e4) }
  );
  if (!res.ok) return jsonError2("Failed to fetch category playlists", res.status);
  const data = await res.json();
  const playlists = (data.playlists?.items || []).map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description || "",
    image: p.images?.[0]?.url || null,
    owner: p.owner?.display_name || "Spotify",
    trackCount: p.tracks?.total || 0
  }));
  return jsonOk2({ playlists });
}
__name(handleCategoryPlaylists, "handleCategoryPlaylists");
async function handleRecommendations(context, seedArtists, seedTracks, seedGenres, limit = 20) {
  const token = await getSpotifyToken(context);
  if (!token) return jsonError2("No Spotify token available", 401);
  const params = new URLSearchParams({ limit });
  if (seedArtists?.length) params.set("seed_artists", seedArtists.slice(0, 5).join(","));
  if (seedTracks?.length) params.set("seed_tracks", seedTracks.slice(0, 5).join(","));
  if (seedGenres?.length) params.set("seed_genres", seedGenres.slice(0, 5).join(","));
  const res = await fetch(
    `https://api.spotify.com/v1/recommendations?${params.toString()}`,
    { headers: { "Authorization": `Bearer ${token}` }, signal: abortTimeout(1e4) }
  );
  if (!res.ok) return jsonError2("Failed to fetch recommendations", res.status);
  const data = await res.json();
  const tracks = (data.tracks || []).map((t) => ({
    id: t.id,
    title: t.name || "Unknown Track",
    artist: t.artists?.map((a) => a.name).join(", ") || "Unknown Artist",
    artist_id: t.artists?.[0]?.id || null,
    album: t.album?.name || "Unknown Album",
    album_id: t.album?.id || null,
    artwork_url: t.album?.images?.[0]?.url || null,
    url: t.external_urls?.spotify || `https://open.spotify.com/track/${t.id}`,
    duration_ms: t.duration_ms || 0
  }));
  return jsonOk2({ tracks });
}
__name(handleRecommendations, "handleRecommendations");
async function handleShow(context, id) {
  const token = await getSpotifyToken(context);
  if (!token) return jsonError2("No Spotify token available", 401);
  const [showData, episodesData] = await Promise.all([
    officialFetch(context, `/shows/${id}`),
    officialFetch(context, `/shows/${id}/episodes?limit=20&market=EG`)
  ]);
  if (!showData) return jsonError2("Show not found", 404);
  const show = {
    id: showData.id,
    name: showData.name,
    description: showData.description,
    publisher: showData.publisher,
    image: showData.images?.[0]?.url || null,
    total_episodes: showData.total_episodes,
    explicit: showData.explicit,
    media_type: showData.media_type
  };
  const episodes = (episodesData?.items || []).map((e) => ({
    id: e.id,
    title: e.name,
    description: e.description,
    audio_preview_url: e.audio_preview_url,
    duration_ms: e.duration_ms,
    image: e.images?.[0]?.url || show.image,
    release_date: e.release_date,
    explicit: e.explicit
  }));
  return jsonOk2({ show, episodes });
}
__name(handleShow, "handleShow");
async function handleEpisode(context, id) {
  const token = await getSpotifyToken(context);
  if (!token) return jsonError2("No Spotify token available", 401);
  const data = await officialFetch(context, `/episodes/${id}`);
  if (!data) return jsonError2("Episode not found", 404);
  return jsonOk2({
    id: data.id,
    title: data.name,
    description: data.description,
    audio_preview_url: data.audio_preview_url,
    duration_ms: data.duration_ms,
    image: data.images?.[0]?.url || null,
    release_date: data.release_date,
    explicit: data.explicit,
    show: data.show ? {
      id: data.show.id,
      name: data.show.name,
      publisher: data.show.publisher,
      image: data.show.images?.[0]?.url || null
    } : null
  });
}
__name(handleEpisode, "handleEpisode");
var CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};
function jsonOk2(data) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json", ...CORS }
  });
}
__name(jsonOk2, "jsonOk");
function jsonError2(msg, status = 500) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { "Content-Type": "application/json", ...CORS }
  });
}
__name(jsonError2, "jsonError");
async function onRequest6(context) {
  if (context.request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }
  if (context.request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: CORS });
  }
  try {
    const body = await context.request.json();
    if (body.action === "search") return await handleSearch4(context, body.query, body.types || "track,artist,album,playlist", body.limit || 10);
    if (body.action === "artist") return await handleArtist(context, body.id);
    if (body.action === "track") return await handleTrack(context, body.id);
    if (body.action === "new-releases") return await handleNewReleases(context, body.limit || 20);
    if (body.action === "recently-played") return await handleRecentlyPlayed(context, body.limit || 20);
    if (body.action === "categories") return await handleCategories(context, body.limit || 50);
    if (body.action === "category-playlists") return await handleCategoryPlaylists(context, body.categoryId, body.limit || 20);
    if (body.action === "recommendations") return await handleRecommendations(context, body.seed_artists, body.seed_tracks, body.seed_genres, body.limit || 20);
    if (body.action === "show") return await handleShow(context, body.id);
    if (body.action === "episode") return await handleEpisode(context, body.id);
    if (body.action === "test-credentials") return await handleTestCredentials(context);
    if (body.action === "test-playlist") {
      const token = await getSpotifyToken(context);
      const id2 = body.id;
      const kind2 = body.kind || "playlist";
      const url = `https://api.spotify.com/v1/${kind2 === "album" ? "albums" : "playlists"}/${id2}`;
      const res = await fetch(url, {
        headers: { "Authorization": `Bearer ${token}` },
        signal: abortTimeout(1e4)
      });
      const text = await res.text();
      return jsonOk2({ ok: res.ok, url, status: res.status, hasToken: !!token, body: text?.slice(0, 500) });
    }
    let kind = null, id = null;
    for (const [k, pattern] of Object.entries(SPOTIFY_PATTERNS)) {
      const m = pattern.exec(body.url);
      if (m) {
        kind = k;
        id = m[1];
        break;
      }
    }
    if ((kind === "playlist" || kind === "album") && !body.summary) {
      const official = await handleOfficialCollection(context, kind, id);
      if (official) return official;
    }
    return await handleEmbedScrape(context, body.url, body.summary);
  } catch (err) {
    return jsonError2(err.message);
  }
}
__name(onRequest6, "onRequest");

// api/spotify-auth.js
function randomHex(bytes) {
  const arr = crypto.getRandomValues(new Uint8Array(bytes));
  return Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
}
__name(randomHex, "randomHex");
async function onRequest7(context) {
  const CLIENT_ID = context.env.VITE_SPOTIFY_CLIENT_ID || context.env.SPOTIFY_CLIENT_ID;
  const CLIENT_SECRET = context.env.SPOTIFY_CLIENT_SECRET || "";
  if (!CLIENT_ID) {
    console.error("Missing VITE_SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_ID environment variable");
  }
  const url = new URL(context.request.url);
  const params = Object.fromEntries(url.searchParams);
  const { action, origin } = params;
  if (action === "login") {
    if (!origin) {
      return new Response(JSON.stringify({ error: "Missing origin" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }
    const state = randomHex(16);
    const redirectUri = `${origin}/callback`;
    const authorizeUrl = "https://accounts.spotify.com/authorize?" + new URLSearchParams({
      client_id: CLIENT_ID,
      response_type: "code",
      redirect_uri: redirectUri,
      state,
      scope: "user-read-private user-read-email user-read-recently-played user-top-read playlist-read-private playlist-read-collaborative"
    });
    return new Response(null, {
      status: 302,
      headers: { Location: authorizeUrl }
    });
  }
  if (context.request.method === "POST") {
    let body = {};
    try {
      body = await context.request.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }
    const { code, redirect_uri: redirectUri, refresh_token: refreshToken } = body;
    if (refreshToken) {
      try {
        const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: CLIENT_ID,
            grant_type: "refresh_token",
            refresh_token: refreshToken
          })
        });
        if (!tokenRes.ok) {
          return new Response(JSON.stringify({ error: "Token refresh failed" }), {
            status: 502,
            headers: { "Content-Type": "application/json" }
          });
        }
        const tokens = await tokenRes.json();
        return new Response(JSON.stringify({
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token || refreshToken,
          expires_in: tokens.expires_in
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 502,
          headers: { "Content-Type": "application/json" }
        });
      }
    }
    if (!code || !redirectUri) {
      return new Response(JSON.stringify({ error: "Missing code or redirect_uri" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }
    if (!CLIENT_SECRET) {
      return new Response(JSON.stringify({ error: "SPOTIFY_CLIENT_SECRET not configured" }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }
    try {
      const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Authorization": "Basic " + btoa(`${CLIENT_ID}:${CLIENT_SECRET}`)
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: redirectUri
        })
      });
      if (!tokenRes.ok) {
        const errText = await tokenRes.text().catch(() => "unknown");
        return new Response(JSON.stringify({ error: "Token exchange failed", detail: errText }), {
          status: 502,
          headers: { "Content-Type": "application/json" }
        });
      }
      const tokens = await tokenRes.json();
      return new Response(JSON.stringify({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token || "",
        expires_in: tokens.expires_in
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 502,
        headers: { "Content-Type": "application/json" }
      });
    }
  }
  return new Response(JSON.stringify({ error: "Invalid request" }), {
    status: 400,
    headers: { "Content-Type": "application/json" }
  });
}
__name(onRequest7, "onRequest");

// api/spotify-partner.js
function abortTimeout2(ms) {
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
    return AbortSignal.timeout(ms);
  }
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}
__name(abortTimeout2, "abortTimeout");
var PARTNER_API = "https://api-partner.spotify.com/pathfinder/v1/query";
var WEB_PLAYER = "https://open.spotify.com";
var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
var FALLBACK_HASHES = {
  libraryV3: "a6cb8387bc0f12b34f2a9ac5ed4225d55398d85fea8a865a3e5f84c7882cfedd",
  searchDesktop: "9400aabe3fd508b7041a07449a3e2e16e67f7c4c44b99ac991103a7425e4a3da",
  fetchPlaylist: "a3e356cf1aa7eba20000953fc0c823a1db062b8eaec5b37ec9e63165bb1d1299",
  getTrack: "eab5a5f8e3121ccbe94a513153637106d87b1c29e2e94c3e84b3824185381e77",
  fetchLibraryTracks: "3acb6bf4761d8a2bf592a75bf5dcec8eff7e2a7b8612ac74c55e4ab31a347393",
  addToLibrary: "8076c11296e5d862541ec1cb3ef351893ad0b05ff4eac80db5022be4bcb76abb",
  removeFromLibrary: "17b3a57ec9f60a68a8fb6bbd804a77807c888d8c5d8817a4d75134b7813b2b80",
  getPlaylist: "7bd86c428155868204b104575c44df9c69534cea7ab5ba1f551c36e69e8e6a53",
  getAlbum: "5d7696d61c11c1b7a2e6c5e4c5e6b8e0b68a3ce1b68c6a5e3c4e7b9c8d9f1a0b",
  getArtist: "2c2e0c3c5e6a0b7c8d9e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b"
};
var hashCache = null;
var hashCacheTime = 0;
var HASH_TTL = 36e5;
function base32(buf) {
  const abc = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const b of buf) bits += b.toString(2).padStart(8, "0");
  let r = "";
  for (let i = 0; i + 5 <= bits.length; i += 5)
    r += abc[parseInt(bits.slice(i, i + 5), 2)];
  return r;
}
__name(base32, "base32");
var FALLBACK_SECRET = {
  v: 61,
  s: [44, 55, 47, 42, 70, 40, 34, 114, 76, 74, 50, 111, 120, 97, 75, 76, 94, 102, 43, 69, 49, 120, 118, 80, 64, 78]
};
var secretCache = { ...FALLBACK_SECRET, ts: 0 };
async function refreshSecrets() {
  try {
    const r = await fetch("https://code.thetadev.de/ThetaDev/spotify-secrets/raw/branch/main/secrets/secretDict.json", { signal: abortTimeout2(5e3) });
    if (!r.ok) return;
    const d = await r.json();
    const vs = Object.keys(d).map(Number).sort((a, b) => b - a);
    if (vs.length) {
      secretCache = { v: vs[0], s: d[vs[0]], ts: Date.now() };
    }
  } catch {
  }
}
__name(refreshSecrets, "refreshSecrets");
function writeBigInt64BE(buf, val) {
  for (let i = 7; i >= 0; i--) {
    buf[i] = Number(val & 0xffn);
    val >>= 8n;
  }
}
__name(writeBigInt64BE, "writeBigInt64BE");
async function makeTOTP() {
  const { v, s } = secretCache;
  const t = s.map((e, i) => e ^ i % 33 + 9);
  const encoder = new TextEncoder();
  const hBytes = encoder.encode(t.join(""));
  const hexBytes = Array.from(hBytes).map((b) => b.toString(16).padStart(2, "0")).join("");
  const h = new Uint8Array(hexBytes.length / 2);
  for (let i = 0; i < hexBytes.length; i += 2) {
    h[i / 2] = parseInt(hexBytes.slice(i, i + 2), 16);
  }
  const b32 = base32(h);
  const time = Math.floor(Date.now() / 3e4);
  const tb = new Uint8Array(8);
  writeBigInt64BE(tb, BigInt(time));
  const keyBytes = new TextEncoder().encode(b32);
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, tb);
  const hmac = new Uint8Array(sig);
  const off = hmac[hmac.length - 1] & 15;
  const code = (hmac[off] & 127) << 24 | hmac[off + 1] << 16 | hmac[off + 2] << 8 | hmac[off + 3];
  return { totp: String(code % 1e6).padStart(6, "0"), version: v };
}
__name(makeTOTP, "makeTOTP");
async function getToken() {
  if (!secretCache.ts) await refreshSecrets();
  const { totp, version } = await makeTOTP();
  const url = `${WEB_PLAYER}/api/token?reason=init&productType=web-player&totp=${totp}&totpVer=${version}&totpServer=${totp}`;
  const r = await fetch(url, { headers: { "User-Agent": UA } });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`Token failed ${r.status}: ${t.slice(0, 100)}`);
  }
  return r.json();
}
__name(getToken, "getToken");
async function getHashes() {
  const now = Date.now();
  if (hashCache && now - hashCacheTime < HASH_TTL) return { ...FALLBACK_HASHES, ...hashCache };
  try {
    const page = await fetch(WEB_PLAYER, { headers: { "User-Agent": UA } });
    const html = await page.text();
    const configMatch = html.match(/<script id="appServerConfig"[^>]*>(.*?)<\/script>/);
    let clientVersion = "1.2.61.400";
    if (configMatch) {
      try {
        const encoded = configMatch[1];
        const binaryStr = atob(encoded);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
        const decoder = new TextDecoder();
        const cfg = JSON.parse(decoder.decode(bytes));
        if (cfg.clientVersion) clientVersion = cfg.clientVersion;
      } catch {
      }
    }
    const seen = /* @__PURE__ */ new Set();
    const bundles = [];
    const srcRe = /<script[^>]+src="([^"]+)"[^>]*>/g;
    let m;
    while ((m = srcRe.exec(html)) !== null) {
      const s = m[1];
      if (s.includes(".js") && !seen.has(s)) {
        seen.add(s);
        bundles.push(s.startsWith("http") ? s : s.startsWith("//") ? "https:" + s : WEB_PLAYER + s);
      }
    }
    let allJS = "";
    for (const url of bundles) {
      try {
        const r = await fetch(url, { headers: { "User-Agent": UA }, signal: abortTimeout2(1e4) });
        if (r.ok) allJS += await r.text() + "\n";
      } catch {
      }
    }
    const found = {};
    for (const name of Object.keys(FALLBACK_HASHES)) {
      const qm = allJS.match(new RegExp(`"${name}","query","([a-f0-9]+)"`));
      if (qm) found[name] = qm[1];
      else {
        const mm = allJS.match(new RegExp(`"${name}","mutation","([a-f0-9]+)"`));
        if (mm) found[name] = mm[1];
      }
    }
    hashCache = found;
    hashCacheTime = now;
    return { ...FALLBACK_HASHES, ...found };
  } catch {
    return FALLBACK_HASHES;
  }
}
__name(getHashes, "getHashes");
async function query(operationName, variables, accessToken) {
  const hashes = await getHashes();
  const hash = hashes[operationName];
  if (!hash) throw new Error(`Unknown operation: ${operationName}`);
  const params = new URLSearchParams({
    operationName,
    variables: JSON.stringify(variables),
    extensions: JSON.stringify({ persistedQuery: { version: 1, sha256Hash: hash } })
  });
  const r = await fetch(`${PARTNER_API}?${params}`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "User-Agent": UA,
      "app-platform": "WebPlayer",
      "Accept-Language": "en"
    }
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`Partner API ${r.status}: ${t.slice(0, 300)}`);
  }
  return r.json();
}
__name(query, "query");
async function onRequest8(context) {
  if (context.request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" }
    });
  }
  try {
    const body = await context.request.json();
    const { action } = body;
    if (action === "get-token") {
      const token = await getToken();
      return new Response(JSON.stringify(token), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
    if (action === "query") {
      const { operationName, variables, playerToken } = body;
      let token = playerToken;
      if (!token) {
        const td = await getToken();
        token = td.accessToken;
      }
      const result = await query(operationName, variables, token);
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
    if (action === "user-library") {
      const token = body.playerToken || body.oauthToken;
      if (!token) {
        return new Response(JSON.stringify({ error: "Missing token" }), {
          status: 400,
          headers: { "Content-Type": "application/json" }
        });
      }
      const result = await query("libraryV3", {
        filters: [],
        order: null,
        textFilter: "",
        features: ["LIKED_SONGS", "YOUR_EPISODES", "PRERELEASES"],
        limit: 50,
        offset: 0,
        flatten: false,
        expandedFolders: [],
        folderUri: null,
        includeFoldersWhenFlattening: true
      }, token);
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
    if (action === "saved-tracks") {
      const token = body.playerToken || body.oauthToken;
      if (!token) {
        return new Response(JSON.stringify({ error: "Missing token" }), {
          status: 400,
          headers: { "Content-Type": "application/json" }
        });
      }
      const result = await query("fetchLibraryTracks", {
        offset: body.offset || 0,
        limit: body.limit || 50
      }, token);
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
    if (action === "search") {
      const { query: searchTerm, limit, offset, playerToken } = body;
      let token = playerToken;
      if (!token) {
        const td = await getToken();
        token = td.accessToken;
      }
      const result = await query("searchDesktop", {
        searchTerm,
        offset: offset || 0,
        limit: limit || 10,
        numberOfTopResults: 5,
        includeAudiobooks: true,
        includeArtistHasConcertsField: false,
        includePreReleases: true,
        includeLocalConcertsField: false
      }, token);
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
    if (action === "playlist") {
      const { playlistId, limit, offset, playerToken } = body;
      let token = playerToken;
      if (!token) {
        const td = await getToken();
        token = td.accessToken;
      }
      const result = await query("fetchPlaylist", {
        uri: `spotify:playlist:${playlistId}`,
        offset: offset || 0,
        limit: limit || 100,
        enableWatchFeedEntrypoint: false
      }, token);
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
    if (action === "track") {
      const { trackId, playerToken } = body;
      let token = playerToken;
      if (!token) {
        const td = await getToken();
        token = td.accessToken;
      }
      const result = await query("getTrack", {
        uri: `spotify:track:${trackId}`
      }, token);
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
    if (action === "test-token") {
      const { token: testToken } = body;
      if (!testToken) {
        return new Response(JSON.stringify({ error: "No token provided" }), {
          status: 400,
          headers: { "Content-Type": "application/json" }
        });
      }
      try {
        const hashes = await getHashes();
        return new Response(JSON.stringify({
          ok: true,
          hashCount: Object.keys(hashes).length,
          hashes
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      } catch (e) {
        return new Response(JSON.stringify({
          ok: true,
          error: e.message
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }
    }
    return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
__name(onRequest8, "onRequest");

// api/youtube.js
function abortTimeout3(ms) {
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
    return AbortSignal.timeout(ms);
  }
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}
__name(abortTimeout3, "abortTimeout");
var CLIENTS = [
  { name: "ANDROID_v1", context: { client: { clientName: "ANDROID", clientVersion: "18.37.36", androidSdkVersion: 30, osName: "Android", osVersion: "13", platform: "MOBILE", gl: "US", hl: "en" } } },
  { name: "ANDROID_v2", context: { client: { clientName: "ANDROID", clientVersion: "19.09.37", androidSdkVersion: 30, osName: "Android", osVersion: "13", platform: "MOBILE", gl: "US", hl: "en" } } },
  { name: "ANDROID_MUSIC", context: { client: { clientName: "ANDROID_MUSIC", clientVersion: "6.27.52", androidSdkVersion: 30, osName: "Android", osVersion: "13", platform: "MOBILE", gl: "US", hl: "en" } } },
  { name: "TV", context: { client: { clientName: "TVHTML5", clientVersion: "7.20240101.00.00", gl: "US", hl: "en" } } },
  { name: "WEB_REMIX", context: { client: { clientName: "WEB_REMIX", clientVersion: "1.20240101.00.00", gl: "US", hl: "en" } } },
  { name: "WEB", context: { client: { clientName: "WEB", clientVersion: "2.20240101.00.00", gl: "US", hl: "en" } } }
];
var KEY = "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8";
var COOKIES = "CONSENT=YES+; SOCS=CAISHAgCEhJqOHNfVUJfMl9xMHpKNHBpM1cYAiIBBiA=";
var CORS2 = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};
async function onRequest9(context) {
  if (context.request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS2 });
  }
  if (context.request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: CORS2 });
  }
  try {
    const { action, query: query2, url } = await context.request.json();
    if (action === "search") return await handleSearch5(query2);
    if (action === "music-search") return await handleMusicSearch(query2);
    if (action === "info") return await handleInfo4(url);
    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...CORS2 }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...CORS2 }
    });
  }
}
__name(onRequest9, "onRequest");
async function handleSearch5(query2) {
  for (const c of CLIENTS) {
    try {
      const res = await fetch(`https://www.youtube.com/youtubei/v1/search?key=${KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Cookie": COOKIES, "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36" },
        body: JSON.stringify({ context: c.context, query: query2 }),
        signal: abortTimeout3(1e4)
      });
      if (!res.ok) continue;
      const data = await res.json();
      const results = [];
      const sections = data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents || [];
      for (const section of sections) {
        for (const item of section?.itemSectionRenderer?.contents || []) {
          const r = item?.videoRenderer;
          if (!r?.videoId) continue;
          const ownerRuns = r?.ownerText?.runs || r?.longBylineText?.runs || [];
          results.push({ videoId: r.videoId, title: r.title?.runs?.[0]?.text || "Unknown", author: ownerRuns[0]?.text || "Unknown", url: `https://youtube.com/watch?v=${r.videoId}` });
          if (results.length >= 5) break;
        }
        if (results.length >= 5) break;
      }
      if (results.length > 0) {
        return new Response(JSON.stringify({ results }), {
          status: 200,
          headers: { "Content-Type": "application/json", ...CORS2 }
        });
      }
    } catch {
    }
  }
  return new Response(JSON.stringify({ results: [] }), {
    status: 200,
    headers: { "Content-Type": "application/json", ...CORS2 }
  });
}
__name(handleSearch5, "handleSearch");
async function handleMusicSearch(query2) {
  const musicClient = CLIENTS.find((c) => c.name === "ANDROID_MUSIC") || CLIENTS[2];
  try {
    const res = await fetch(`https://music.youtube.com/youtubei/v1/search?key=${KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Cookie": COOKIES, "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36" },
      body: JSON.stringify({ context: musicClient.context, query: query2 }),
      signal: abortTimeout3(1e4)
    });
    if (!res.ok) {
      return new Response(JSON.stringify({ results: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...CORS2 }
      });
    }
    const data = await res.json();
    const results = [];
    const tabs = data?.contents?.tabbedSearchResultsRenderer?.tabs || [];
    for (const tab of tabs) {
      const tabRenderer = tab?.tabRenderer;
      if (!tabRenderer) continue;
      const tabTitle = typeof tabRenderer.title === "string" ? tabRenderer.title : tabRenderer.title?.runs?.[0]?.text || "";
      if (tabTitle !== "Songs") continue;
      const sections = tabRenderer?.content?.sectionListRenderer?.contents || [];
      for (const section of sections) {
        const shelf = section?.musicShelfRenderer;
        if (!shelf) continue;
        for (const item of shelf.contents || []) {
          const r = item?.musicResponsiveListItemRenderer;
          if (!r?.videoId) continue;
          const title = r?.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.text || "Unknown";
          const subtitleRuns = r?.flexColumns?.[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || [];
          const author = subtitleRuns[0]?.text || "Unknown";
          const thumbnails = r?.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails || [];
          results.push({
            videoId: r.videoId,
            title,
            author,
            url: `https://music.youtube.com/watch?v=${r.videoId}`,
            thumbnail: thumbnails[thumbnails.length - 1]?.url || null
          });
          if (results.length >= 10) break;
        }
        if (results.length >= 10) break;
      }
      if (results.length >= 10) break;
    }
    if (results.length === 0) {
      for (const c of CLIENTS) {
        try {
          const fallback = await fetch(`https://www.youtube.com/youtubei/v1/search?key=${KEY}`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Cookie": COOKIES, "User-Agent": "Mozilla/5.0" },
            body: JSON.stringify({ context: c.context, query: query2 }),
            signal: abortTimeout3(1e4)
          });
          if (!fallback.ok) continue;
          const fbData = await fallback.json();
          const sections = fbData?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents || [];
          for (const section of sections) {
            for (const item of section?.itemSectionRenderer?.contents || []) {
              const r = item?.videoRenderer;
              if (!r?.videoId) continue;
              const ownerRuns = r?.ownerText?.runs || r?.longBylineText?.runs || [];
              results.push({
                videoId: r.videoId,
                title: r.title?.runs?.[0]?.text || "Unknown",
                author: ownerRuns[0]?.text || "Unknown",
                url: `https://music.youtube.com/watch?v=${r.videoId}`,
                thumbnail: r?.thumbnail?.thumbnails?.[r.thumbnail.thumbnails.length - 1]?.url || null
              });
              if (results.length >= 10) break;
            }
            if (results.length >= 10) break;
          }
          if (results.length > 0) break;
        } catch {
        }
      }
    }
    return new Response(JSON.stringify({ results }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...CORS2 }
    });
  } catch {
    return new Response(JSON.stringify({ results: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...CORS2 }
    });
  }
}
__name(handleMusicSearch, "handleMusicSearch");
async function handleInfo4(videoUrl) {
  const videoId = extractVideoId(videoUrl);
  if (!videoId) {
    return new Response(JSON.stringify({ error: "Invalid YouTube URL" }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...CORS2 }
    });
  }
  for (const c of CLIENTS) {
    try {
      const res = await fetch(`https://www.youtube.com/youtubei/v1/player?key=${KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Cookie": COOKIES, "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36" },
        body: JSON.stringify({ context: c.context, videoId }),
        signal: abortTimeout3(1e4)
      });
      if (!res.ok) continue;
      const data = await res.json();
      const ps = data?.playabilityStatus;
      if (ps?.status && ps.status !== "OK") continue;
      const result = extractAudio(data);
      if (result) {
        return new Response(JSON.stringify(result), {
          status: 200,
          headers: { "Content-Type": "application/json", ...CORS2 }
        });
      }
    } catch {
    }
  }
  return new Response(JSON.stringify({ error: "Could not retrieve audio from any source" }), {
    status: 502,
    headers: { "Content-Type": "application/json", ...CORS2 }
  });
}
__name(handleInfo4, "handleInfo");
function extractAudio(data) {
  const sd = data?.streamingData;
  if (!sd) return null;
  const all = [...sd.formats || [], ...sd.adaptiveFormats || []];
  const audio = all.filter((f) => f.mimeType?.startsWith("audio/") && f.url).sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
  if (!audio[0]) return null;
  const v = data?.videoDetails || {};
  return { title: v.title || "Unknown", author: v.author || v.channelOwnerName || "Unknown", duration: v.lengthSeconds || "0", audioUrl: audio[0].url, thumbnail: v.thumbnail?.thumbnails?.slice(-1)?.[0]?.url || null };
}
__name(extractAudio, "extractAudio");
function extractVideoId(url) {
  const patterns = [/youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/, /youtu\.be\/([a-zA-Z0-9_-]{11})/, /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/, /youtube\.com\/v\/([a-zA-Z0-9_-]{11})/];
  for (const p of patterns) {
    const m = p.exec(url);
    if (m) return m[1];
  }
  return null;
}
__name(extractVideoId, "extractVideoId");

// ../.wrangler/tmp/pages-5Y3QoN/functionsRoutes-0.657377266013728.mjs
var routes = [
  {
    routePath: "/api/bandcamp",
    mountPath: "/api",
    method: "",
    middlewares: [],
    modules: [onRequest]
  },
  {
    routePath: "/api/jamendo",
    mountPath: "/api",
    method: "",
    middlewares: [],
    modules: [onRequest2]
  },
  {
    routePath: "/api/lyrics",
    mountPath: "/api",
    method: "",
    middlewares: [],
    modules: [onRequest3]
  },
  {
    routePath: "/api/oembed",
    mountPath: "/api",
    method: "",
    middlewares: [],
    modules: [onRequest4]
  },
  {
    routePath: "/api/soundcloud",
    mountPath: "/api",
    method: "",
    middlewares: [],
    modules: [onRequest5]
  },
  {
    routePath: "/api/spotify",
    mountPath: "/api",
    method: "",
    middlewares: [],
    modules: [onRequest6]
  },
  {
    routePath: "/api/spotify-auth",
    mountPath: "/api",
    method: "",
    middlewares: [],
    modules: [onRequest7]
  },
  {
    routePath: "/api/spotify-partner",
    mountPath: "/api",
    method: "",
    middlewares: [],
    modules: [onRequest8]
  },
  {
    routePath: "/api/youtube",
    mountPath: "/api",
    method: "",
    middlewares: [],
    modules: [onRequest9]
  }
];

// ../node_modules/path-to-regexp/dist.es2015/index.js
function lexer(str) {
  var tokens = [];
  var i = 0;
  while (i < str.length) {
    var char = str[i];
    if (char === "*" || char === "+" || char === "?") {
      tokens.push({ type: "MODIFIER", index: i, value: str[i++] });
      continue;
    }
    if (char === "\\") {
      tokens.push({ type: "ESCAPED_CHAR", index: i++, value: str[i++] });
      continue;
    }
    if (char === "{") {
      tokens.push({ type: "OPEN", index: i, value: str[i++] });
      continue;
    }
    if (char === "}") {
      tokens.push({ type: "CLOSE", index: i, value: str[i++] });
      continue;
    }
    if (char === ":") {
      var name = "";
      var j = i + 1;
      while (j < str.length) {
        var code = str.charCodeAt(j);
        if (
          // `0-9`
          code >= 48 && code <= 57 || // `A-Z`
          code >= 65 && code <= 90 || // `a-z`
          code >= 97 && code <= 122 || // `_`
          code === 95
        ) {
          name += str[j++];
          continue;
        }
        break;
      }
      if (!name)
        throw new TypeError("Missing parameter name at ".concat(i));
      tokens.push({ type: "NAME", index: i, value: name });
      i = j;
      continue;
    }
    if (char === "(") {
      var count = 1;
      var pattern = "";
      var j = i + 1;
      if (str[j] === "?") {
        throw new TypeError('Pattern cannot start with "?" at '.concat(j));
      }
      while (j < str.length) {
        if (str[j] === "\\") {
          pattern += str[j++] + str[j++];
          continue;
        }
        if (str[j] === ")") {
          count--;
          if (count === 0) {
            j++;
            break;
          }
        } else if (str[j] === "(") {
          count++;
          if (str[j + 1] !== "?") {
            throw new TypeError("Capturing groups are not allowed at ".concat(j));
          }
        }
        pattern += str[j++];
      }
      if (count)
        throw new TypeError("Unbalanced pattern at ".concat(i));
      if (!pattern)
        throw new TypeError("Missing pattern at ".concat(i));
      tokens.push({ type: "PATTERN", index: i, value: pattern });
      i = j;
      continue;
    }
    tokens.push({ type: "CHAR", index: i, value: str[i++] });
  }
  tokens.push({ type: "END", index: i, value: "" });
  return tokens;
}
__name(lexer, "lexer");
function parse(str, options) {
  if (options === void 0) {
    options = {};
  }
  var tokens = lexer(str);
  var _a = options.prefixes, prefixes = _a === void 0 ? "./" : _a, _b = options.delimiter, delimiter = _b === void 0 ? "/#?" : _b;
  var result = [];
  var key = 0;
  var i = 0;
  var path = "";
  var tryConsume = /* @__PURE__ */ __name(function(type) {
    if (i < tokens.length && tokens[i].type === type)
      return tokens[i++].value;
  }, "tryConsume");
  var mustConsume = /* @__PURE__ */ __name(function(type) {
    var value2 = tryConsume(type);
    if (value2 !== void 0)
      return value2;
    var _a2 = tokens[i], nextType = _a2.type, index = _a2.index;
    throw new TypeError("Unexpected ".concat(nextType, " at ").concat(index, ", expected ").concat(type));
  }, "mustConsume");
  var consumeText = /* @__PURE__ */ __name(function() {
    var result2 = "";
    var value2;
    while (value2 = tryConsume("CHAR") || tryConsume("ESCAPED_CHAR")) {
      result2 += value2;
    }
    return result2;
  }, "consumeText");
  var isSafe = /* @__PURE__ */ __name(function(value2) {
    for (var _i = 0, delimiter_1 = delimiter; _i < delimiter_1.length; _i++) {
      var char2 = delimiter_1[_i];
      if (value2.indexOf(char2) > -1)
        return true;
    }
    return false;
  }, "isSafe");
  var safePattern = /* @__PURE__ */ __name(function(prefix2) {
    var prev = result[result.length - 1];
    var prevText = prefix2 || (prev && typeof prev === "string" ? prev : "");
    if (prev && !prevText) {
      throw new TypeError('Must have text between two parameters, missing text after "'.concat(prev.name, '"'));
    }
    if (!prevText || isSafe(prevText))
      return "[^".concat(escapeString(delimiter), "]+?");
    return "(?:(?!".concat(escapeString(prevText), ")[^").concat(escapeString(delimiter), "])+?");
  }, "safePattern");
  while (i < tokens.length) {
    var char = tryConsume("CHAR");
    var name = tryConsume("NAME");
    var pattern = tryConsume("PATTERN");
    if (name || pattern) {
      var prefix = char || "";
      if (prefixes.indexOf(prefix) === -1) {
        path += prefix;
        prefix = "";
      }
      if (path) {
        result.push(path);
        path = "";
      }
      result.push({
        name: name || key++,
        prefix,
        suffix: "",
        pattern: pattern || safePattern(prefix),
        modifier: tryConsume("MODIFIER") || ""
      });
      continue;
    }
    var value = char || tryConsume("ESCAPED_CHAR");
    if (value) {
      path += value;
      continue;
    }
    if (path) {
      result.push(path);
      path = "";
    }
    var open = tryConsume("OPEN");
    if (open) {
      var prefix = consumeText();
      var name_1 = tryConsume("NAME") || "";
      var pattern_1 = tryConsume("PATTERN") || "";
      var suffix = consumeText();
      mustConsume("CLOSE");
      result.push({
        name: name_1 || (pattern_1 ? key++ : ""),
        pattern: name_1 && !pattern_1 ? safePattern(prefix) : pattern_1,
        prefix,
        suffix,
        modifier: tryConsume("MODIFIER") || ""
      });
      continue;
    }
    mustConsume("END");
  }
  return result;
}
__name(parse, "parse");
function match(str, options) {
  var keys = [];
  var re = pathToRegexp(str, keys, options);
  return regexpToFunction(re, keys, options);
}
__name(match, "match");
function regexpToFunction(re, keys, options) {
  if (options === void 0) {
    options = {};
  }
  var _a = options.decode, decode = _a === void 0 ? function(x) {
    return x;
  } : _a;
  return function(pathname) {
    var m = re.exec(pathname);
    if (!m)
      return false;
    var path = m[0], index = m.index;
    var params = /* @__PURE__ */ Object.create(null);
    var _loop_1 = /* @__PURE__ */ __name(function(i2) {
      if (m[i2] === void 0)
        return "continue";
      var key = keys[i2 - 1];
      if (key.modifier === "*" || key.modifier === "+") {
        params[key.name] = m[i2].split(key.prefix + key.suffix).map(function(value) {
          return decode(value, key);
        });
      } else {
        params[key.name] = decode(m[i2], key);
      }
    }, "_loop_1");
    for (var i = 1; i < m.length; i++) {
      _loop_1(i);
    }
    return { path, index, params };
  };
}
__name(regexpToFunction, "regexpToFunction");
function escapeString(str) {
  return str.replace(/([.+*?=^!:${}()[\]|/\\])/g, "\\$1");
}
__name(escapeString, "escapeString");
function flags(options) {
  return options && options.sensitive ? "" : "i";
}
__name(flags, "flags");
function regexpToRegexp(path, keys) {
  if (!keys)
    return path;
  var groupsRegex = /\((?:\?<(.*?)>)?(?!\?)/g;
  var index = 0;
  var execResult = groupsRegex.exec(path.source);
  while (execResult) {
    keys.push({
      // Use parenthesized substring match if available, index otherwise
      name: execResult[1] || index++,
      prefix: "",
      suffix: "",
      modifier: "",
      pattern: ""
    });
    execResult = groupsRegex.exec(path.source);
  }
  return path;
}
__name(regexpToRegexp, "regexpToRegexp");
function arrayToRegexp(paths, keys, options) {
  var parts = paths.map(function(path) {
    return pathToRegexp(path, keys, options).source;
  });
  return new RegExp("(?:".concat(parts.join("|"), ")"), flags(options));
}
__name(arrayToRegexp, "arrayToRegexp");
function stringToRegexp(path, keys, options) {
  return tokensToRegexp(parse(path, options), keys, options);
}
__name(stringToRegexp, "stringToRegexp");
function tokensToRegexp(tokens, keys, options) {
  if (options === void 0) {
    options = {};
  }
  var _a = options.strict, strict = _a === void 0 ? false : _a, _b = options.start, start = _b === void 0 ? true : _b, _c = options.end, end = _c === void 0 ? true : _c, _d = options.encode, encode = _d === void 0 ? function(x) {
    return x;
  } : _d, _e = options.delimiter, delimiter = _e === void 0 ? "/#?" : _e, _f = options.endsWith, endsWith = _f === void 0 ? "" : _f;
  var endsWithRe = "[".concat(escapeString(endsWith), "]|$");
  var delimiterRe = "[".concat(escapeString(delimiter), "]");
  var route = start ? "^" : "";
  for (var _i = 0, tokens_1 = tokens; _i < tokens_1.length; _i++) {
    var token = tokens_1[_i];
    if (typeof token === "string") {
      route += escapeString(encode(token));
    } else {
      var prefix = escapeString(encode(token.prefix));
      var suffix = escapeString(encode(token.suffix));
      if (token.pattern) {
        if (keys)
          keys.push(token);
        if (prefix || suffix) {
          if (token.modifier === "+" || token.modifier === "*") {
            var mod = token.modifier === "*" ? "?" : "";
            route += "(?:".concat(prefix, "((?:").concat(token.pattern, ")(?:").concat(suffix).concat(prefix, "(?:").concat(token.pattern, "))*)").concat(suffix, ")").concat(mod);
          } else {
            route += "(?:".concat(prefix, "(").concat(token.pattern, ")").concat(suffix, ")").concat(token.modifier);
          }
        } else {
          if (token.modifier === "+" || token.modifier === "*") {
            throw new TypeError('Can not repeat "'.concat(token.name, '" without a prefix and suffix'));
          }
          route += "(".concat(token.pattern, ")").concat(token.modifier);
        }
      } else {
        route += "(?:".concat(prefix).concat(suffix, ")").concat(token.modifier);
      }
    }
  }
  if (end) {
    if (!strict)
      route += "".concat(delimiterRe, "?");
    route += !options.endsWith ? "$" : "(?=".concat(endsWithRe, ")");
  } else {
    var endToken = tokens[tokens.length - 1];
    var isEndDelimited = typeof endToken === "string" ? delimiterRe.indexOf(endToken[endToken.length - 1]) > -1 : endToken === void 0;
    if (!strict) {
      route += "(?:".concat(delimiterRe, "(?=").concat(endsWithRe, "))?");
    }
    if (!isEndDelimited) {
      route += "(?=".concat(delimiterRe, "|").concat(endsWithRe, ")");
    }
  }
  return new RegExp(route, flags(options));
}
__name(tokensToRegexp, "tokensToRegexp");
function pathToRegexp(path, keys, options) {
  if (path instanceof RegExp)
    return regexpToRegexp(path, keys);
  if (Array.isArray(path))
    return arrayToRegexp(path, keys, options);
  return stringToRegexp(path, keys, options);
}
__name(pathToRegexp, "pathToRegexp");

// ../node_modules/wrangler/templates/pages-template-worker.ts
var escapeRegex = /[.+?^${}()|[\]\\]/g;
function* executeRequest(request) {
  const requestPath = new URL(request.url).pathname;
  for (const route of [...routes].reverse()) {
    if (route.method && route.method !== request.method) {
      continue;
    }
    const routeMatcher = match(route.routePath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const mountMatcher = match(route.mountPath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const matchResult = routeMatcher(requestPath);
    const mountMatchResult = mountMatcher(requestPath);
    if (matchResult && mountMatchResult) {
      for (const handler of route.middlewares.flat()) {
        yield {
          handler,
          params: matchResult.params,
          path: mountMatchResult.path
        };
      }
    }
  }
  for (const route of routes) {
    if (route.method && route.method !== request.method) {
      continue;
    }
    const routeMatcher = match(route.routePath.replace(escapeRegex, "\\$&"), {
      end: true
    });
    const mountMatcher = match(route.mountPath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const matchResult = routeMatcher(requestPath);
    const mountMatchResult = mountMatcher(requestPath);
    if (matchResult && mountMatchResult && route.modules.length) {
      for (const handler of route.modules.flat()) {
        yield {
          handler,
          params: matchResult.params,
          path: matchResult.path
        };
      }
      break;
    }
  }
}
__name(executeRequest, "executeRequest");
var pages_template_worker_default = {
  async fetch(originalRequest, env, workerContext) {
    let request = originalRequest;
    const handlerIterator = executeRequest(request);
    let data = {};
    let isFailOpen = false;
    const next = /* @__PURE__ */ __name(async (input, init) => {
      if (input !== void 0) {
        let url = input;
        if (typeof input === "string") {
          url = new URL(input, request.url).toString();
        }
        request = new Request(url, init);
      }
      const result = handlerIterator.next();
      if (result.done === false) {
        const { handler, params, path } = result.value;
        const context = {
          request: new Request(request.clone()),
          functionPath: path,
          next,
          params,
          get data() {
            return data;
          },
          set data(value) {
            if (typeof value !== "object" || value === null) {
              throw new Error("context.data must be an object");
            }
            data = value;
          },
          env,
          waitUntil: workerContext.waitUntil.bind(workerContext),
          passThroughOnException: /* @__PURE__ */ __name(() => {
            isFailOpen = true;
          }, "passThroughOnException")
        };
        const response = await handler(context);
        if (!(response instanceof Response)) {
          throw new Error("Your Pages function should return a Response");
        }
        return cloneResponse(response);
      } else if ("ASSETS") {
        const response = await env["ASSETS"].fetch(request);
        return cloneResponse(response);
      } else {
        const response = await fetch(request);
        return cloneResponse(response);
      }
    }, "next");
    try {
      return await next();
    } catch (error) {
      if (isFailOpen) {
        const response = await env["ASSETS"].fetch(request);
        return cloneResponse(response);
      }
      throw error;
    }
  }
};
var cloneResponse = /* @__PURE__ */ __name((response) => (
  // https://fetch.spec.whatwg.org/#null-body-status
  new Response(
    [101, 204, 205, 304].includes(response.status) ? null : response.body,
    response
  )
), "cloneResponse");
export {
  pages_template_worker_default as default
};
