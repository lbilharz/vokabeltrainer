/*
 * Service Worker von vok.cards.
 *
 * Er sorgt dafür, dass die App ohne Netz startet und Aufnahmen abspielt.
 * Der Lernstand selbst liegt im Speicher des Browsers und braucht ihn nicht.
 *
 * Regeln:
 * - Seitenaufrufe: zuerst das Netz, ohne Netz die zuletzt geladene Seite.
 * - /assets/: Dateien mit Prüfsumme im Namen. Einmal geladen, immer aus dem Cache.
 * - Aufnahmen: einmal geladen, immer aus dem Cache. Sie ändern sich nie.
 * - /api/: nie aus dem Cache. Anmeldung und Abgleich brauchen den Server.
 */

const SHELL = "shell-v1";
/** Bleibt bei einem Update der App erhalten. Den Namen kennt auch src/lib/audio.ts. */
const AUDIO = "audio-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((name) => name !== SHELL && name !== AUDIO).map((name) => caches.delete(name)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  const isRecording =
    url.pathname.endsWith(".mp3") && (url.pathname.startsWith("/audio/") || url.pathname.startsWith("/api/audio/"));
  if (isRecording) {
    event.respondWith(recording(request, url.pathname));
    return;
  }
  if (url.pathname.startsWith("/api/")) return;
  if (request.mode === "navigate") {
    event.respondWith(page(request));
    return;
  }
  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(cacheFirst(request));
    return;
  }
  event.respondWith(networkFirst(request));
});

/** Jede Adresse der App liefert dieselbe Seite. Sie liegt unter "/" im Cache. */
async function page(request) {
  const cache = await caches.open(SHELL);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put("/", response.clone());
    return response;
  } catch {
    const cached = await cache.match("/");
    if (cached) return cached;
    return new Response("Keine Verbindung.", { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } });
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(SHELL);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

async function networkFirst(request) {
  const cache = await caches.open(SHELL);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    return Response.error();
  }
}

/**
 * Aufnahmen. Safari fragt Ton in Teilstücken ab (Range).
 * Im Cache liegt immer die ganze Datei. Das Teilstück wird daraus geschnitten.
 */
async function recording(request, path) {
  const cache = await caches.open(AUDIO);
  let full = await cache.match(path);
  if (!full) {
    let response;
    try {
      response = await fetch(path);
    } catch {
      return Response.error();
    }
    // Eine fehlende Datei unter /audio/ kommt als HTML-Seite zurück. Die gehört nicht in den Cache.
    const isAudio = (response.headers.get("content-type") || "").startsWith("audio/");
    if (!response.ok || !isAudio) return new Response(null, { status: 404 });
    await cache.put(path, response.clone());
    full = response;
  }

  const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get("range") || "");
  if (!range) return full;
  const bytes = await full.arrayBuffer();
  const size = bytes.byteLength;
  let start = range[1] === "" ? Math.max(size - Number(range[2]), 0) : Number(range[1]);
  let end = range[1] === "" || range[2] === "" ? size - 1 : Math.min(Number(range[2]), size - 1);
  if (start > end || start >= size) {
    return new Response(null, { status: 416, headers: { "content-range": `bytes */${size}` } });
  }
  return new Response(bytes.slice(start, end + 1), {
    status: 206,
    headers: {
      "content-type": "audio/mpeg",
      "content-range": `bytes ${start}-${end}/${size}`,
      "content-length": String(end - start + 1),
      "accept-ranges": "bytes",
    },
  });
}
