/*
 * Service Worker von vok.cards.
 *
 * Er sorgt dafür, dass die App ohne Netz startet und Aufnahmen abspielt.
 * Der Lernstand selbst liegt im Speicher des Browsers und braucht ihn nicht.
 *
 * Regeln:
 * - Beim Einrichten lädt er die Seite und ihre Dateien schon einmal in den Cache.
 * - Seitenaufrufe: zuerst das Netz. Ohne Netz oder bei lahmem Netz die gespeicherte Seite.
 * - /assets/: Dateien mit Prüfsumme im Namen. Einmal geladen, immer aus dem Cache.
 * - Aufnahmen: einmal geladen, immer aus dem Cache. Sie ändern sich nie.
 * - /api/: nie aus dem Cache. Anmeldung und Abgleich brauchen den Server.
 */

const SHELL = "shell-v1";
/** Bleibt bei einem Update der App erhalten. Den Namen kennt auch src/lib/audio.ts. */
const AUDIO = "audio-v1";

/** So lange darf das Netz für die Seite brauchen. Danach startet die gespeicherte. */
const PAGE_TIMEOUT_MS = 3000;

self.addEventListener("install", (event) => {
  // Schlägt das Vorladen fehl, läuft die App trotzdem. Sie startet dann nur noch nicht ohne Netz.
  event.waitUntil(
    preload()
      .catch(() => {})
      .then(() => self.skipWaiting()),
  );
});

/**
 * Lädt die Seite und ihre Dateien in den Cache.
 * So startet die App schon nach dem ersten Besuch ohne Netz.
 */
async function preload() {
  const cache = await caches.open(SHELL);
  const response = await fetch("/", { cache: "no-cache" });
  if (!response.ok) return;
  const html = await response.clone().text();
  await cache.put("/", response);

  const files = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((match) => match[1]);
  const fetched = await Promise.all(files.map((file) => keep(cache, file)));

  // Die Schrift steht nur im Stylesheet. Ohne sie startet die App auch, sieht aber anders aus.
  const sheet = fetched.find((entry) => entry && entry.file.endsWith(".css"));
  if (sheet) {
    const css = await sheet.response.text();
    const font = /url\((\/assets\/[^)]*-latin-wght-[^)]*\.woff2)\)/.exec(css);
    if (font) await keep(cache, font[1]).catch(() => null);
  }
}

/** Legt eine Datei in den Cache, falls sie dort fehlt. */
async function keep(cache, file) {
  const cached = await cache.match(file);
  if (cached) return { file, response: cached };
  const response = await fetch(file);
  if (!response.ok) throw new Error(`${file}: ${response.status}`);
  await cache.put(file, response.clone());
  return { file, response };
}

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
    event.respondWith(page(event));
    return;
  }
  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(cacheFirst(request));
    return;
  }
  event.respondWith(networkFirst(request));
});

/*
 * Die tägliche Erinnerung.
 * Der Server schickt nur ein leeres Signal. Der Text steht hier fest.
 * So erfahren Apple und Google nichts über das Kind oder seinen Lernstand.
 */
self.addEventListener("push", (event) => {
  event.waitUntil(
    self.registration.showNotification("Zeit für deine Vokabeln", {
      body: "Ein paar Karten warten auf dich.",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      // Eine neue Erinnerung ersetzt die alte. Es stapelt sich nichts.
      tag: "taeglich",
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of windows) {
        if ("focus" in client) return client.focus();
      }
      return self.clients.openWindow("/");
    })(),
  );
});

/**
 * Jede Adresse der App liefert dieselbe Seite. Sie liegt unter "/" im Cache.
 *
 * Das Netz hat Vorrang, damit eine neue Version sofort ankommt.
 * Antwortet es nicht schnell genug, startet die gespeicherte Seite.
 * Das hilft, wenn das Handy noch am WLAN hängt, aber nichts mehr durchkommt.
 */
async function page(event) {
  const cache = await caches.open(SHELL);
  const cached = await cache.match("/");
  const fresh = fetch(event.request).then(async (response) => {
    // Nur eine HTML-Seite wird als App gespeichert. Wer eine Datei direkt aufruft, überschreibt sie sonst.
    const isPage = (response.headers.get("content-type") || "").includes("text/html");
    if (response.ok && isPage) await cache.put("/", response.clone());
    return response;
  });

  if (!cached) {
    try {
      return await fresh;
    } catch {
      return offlinePage();
    }
  }

  // Kommt die Antwort erst nach der Frist, landet sie trotzdem noch im Cache.
  event.waitUntil(fresh.catch(() => {}));
  const tooSlow = new Promise((resolve) => setTimeout(() => resolve(null), PAGE_TIMEOUT_MS));
  try {
    return (await Promise.race([fresh, tooSlow])) ?? cached;
  } catch {
    return cached;
  }
}

/** Erscheint nur, wenn das Netz fehlt und noch keine Seite gespeichert ist. */
function offlinePage() {
  const html = `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Vokabeltrainer</title>
<style>
body{margin:0;min-height:100dvh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;padding:24px;box-sizing:border-box;background:#f6f2ee;color:#2b2420;font-family:system-ui,-apple-system,sans-serif;text-align:center}
h1{margin:0;font-size:24px}
p{margin:0;max-width:300px;font-size:17px;line-height:1.4;color:#6b625c}
button{margin-top:8px;height:56px;padding:0 28px;border:0;border-bottom:4px solid #8f3a43;border-radius:16px;background:#b94f59;color:#fff;font:inherit;font-size:18px;font-weight:800}
</style>
</head>
<body>
<h1>Keine Verbindung</h1>
<p>Die App braucht einmal Internet zum Starten. Prüfe WLAN oder mobile Daten.</p>
<button type="button" onclick="location.reload()">Noch einmal versuchen</button>
<script>addEventListener("online", () => location.reload());</script>
</body>
</html>`;
  return new Response(html, { status: 503, headers: { "content-type": "text/html; charset=utf-8" } });
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
