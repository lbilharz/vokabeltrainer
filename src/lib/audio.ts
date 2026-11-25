import { LIMITS } from "@shared/limits";
import { fnv1a, sayText } from "@shared/text";
import type { Lang } from "@shared/types";
import { apiPost } from "./api";

/**
 * Sprachausgabe.
 *
 * Es gibt zwei Quellen für Aufnahmen:
 * - mitgelieferte Dateien unter /audio/<lang>/<hash>.mp3, gelistet in /audio/index.json,
 * - Aufnahmen für fotografierte Wörter unter /api/audio/fr/<hash>.mp3.
 *
 * Die App muss sofort wissen, ob es eine Aufnahme gibt. Safari erlaubt die Stimme
 * des Geräts nur direkt in einem Klick und nicht erst nach einem fehlgeschlagenen Laden.
 * Deshalb führt sie beide Listen im Speicher.
 */

const BASE = "/audio/";
const REMOTE_BASE = "/api/audio/fr/";
const REMOTE_KEY = "travok_audio_fr";

let bundled = new Set<string>();
let current: HTMLAudioElement | null = null;

function loadRemote(): Set<string> {
  try {
    const list: unknown = JSON.parse(localStorage.getItem(REMOTE_KEY) ?? "[]");
    return new Set(Array.isArray(list) ? (list as string[]) : []);
  } catch {
    return new Set();
  }
}

/** Kennungen der Aufnahmen, die der Server schon hat. Kein Geheimnis, gilt für alle Konten. */
const remote = loadRemote();

function saveRemote(): void {
  try {
    localStorage.setItem(REMOTE_KEY, JSON.stringify([...remote]));
  } catch {
    // Ohne Speicher fragt die App beim nächsten Start einfach noch einmal nach.
  }
}

let indexReady: Promise<void> | null = null;

export function loadAudioIndex(): Promise<void> {
  indexReady ??= fetch(BASE + "index.json")
    .then((r) => (r.ok ? r.json() : []))
    .then((list: unknown) => {
      if (Array.isArray(list)) bundled = new Set(list as string[]);
    })
    .catch(() => {
      // Ohne Liste spricht die Stimme des Geräts.
    });
  return indexReady;
}

function speakWithDevice(text: string, lang: Lang, rate: number): void {
  if (!("speechSynthesis" in window)) return;
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(sayText(text, lang));
  utterance.lang = lang === "fr" ? "fr-FR" : "de-DE";
  const voice = speechSynthesis.getVoices().find((v) => v.lang.toLowerCase().startsWith(lang));
  if (voice) utterance.voice = voice;
  utterance.rate = rate;
  speechSynthesis.speak(utterance);
}

/** Muss direkt aus einem Klick aufgerufen werden, sonst blockiert der Browser den Ton. */
export function speak(text: string, lang: Lang, baseRate: number): void {
  stop();
  // Deutsch läuft einen Tick schneller als Französisch.
  const rate = lang === "fr" ? baseRate : Math.min(baseRate + 0.15, 1.3);
  const url = urlFor(text, lang);
  if (!url) {
    speakWithDevice(text, lang, rate);
    return;
  }
  const audio = new Audio(url);
  audio.preservesPitch = true;
  audio.playbackRate = rate;
  current = audio;
  let fellBack = false;
  const fallback = () => {
    if (fellBack) return;
    fellBack = true;
    if (current === audio) current = null;
    speakWithDevice(text, lang, rate);
  };
  audio.onerror = fallback;
  audio.play().catch(fallback);
}

export function stop(): void {
  if (current) {
    current.pause();
    current = null;
  }
  if ("speechSynthesis" in window) speechSynthesis.cancel();
}

interface EnsureResponse {
  ready: string[];
  pending: string[];
  stopped?: "limit" | "unconfigured" | "failed";
}

/** Derselbe Name wie in public/sw.js. */
const AUDIO_CACHE = "audio-v1";

/** Die Adresse der Aufnahme. null heisst: es gibt keine, das Gerät spricht selbst. */
function urlFor(text: string, lang: Lang): string | null {
  const hash = fnv1a(text);
  if (bundled.has(`${lang}/${hash}`)) return `${BASE}${lang}/${hash}.mp3`;
  if (lang === "fr" && remote.has(hash)) return `${REMOTE_BASE}${hash}.mp3`;
  return null;
}

/**
 * Lädt die Aufnahmen der eigenen Wörter schon einmal herunter.
 * So spielen sie später auch ohne Netz. Läuft still im Hintergrund.
 */
async function keepForOffline(texts: string[]): Promise<void> {
  if (!("caches" in window)) return;
  try {
    const cache = await caches.open(AUDIO_CACHE);
    for (const text of new Set(texts)) {
      const url = urlFor(text, "fr");
      if (!url || (await cache.match(url))) continue;
      const response = await fetch(url);
      // Eine fehlende Datei kommt als HTML-Seite zurück. Die gehört nicht in den Cache.
      if (response.ok && (response.headers.get("content-type") ?? "").startsWith("audio/")) {
        await cache.put(url, response);
      }
    }
  } catch {
    // Kein Netz oder kein Platz. Dann eben beim nächsten Mal.
  }
}

const BATCH = LIMITS.MAX_AUDIO_TEXTS;
let ensuring = false;
let queued: string[] | null = null;
/** Texte ohne sprechbaren Inhalt. Für die fragt die App in dieser Sitzung nicht noch einmal. */
const skipped = new Set<string>();
/** Nach einem "geht gerade nicht" vom Server wartet die App bis zu diesem Zeitpunkt. */
let pausedUntil = 0;
const PAUSE_MS = 5 * 60_000;

/**
 * Sorgt im Hintergrund dafür, dass es für alle französischen Texte eine Aufnahme gibt.
 *
 * Der Server prüft, was schon da ist, und lässt pro Aufruf nur wenige neue sprechen.
 * Jedes Wort wird einzeln aufgenommen. Bis eine Aufnahme fertig ist, spricht das Gerät.
 * Fehler bleiben still: beim nächsten Start geht es einfach weiter.
 */
export async function ensureAudio(texts: string[]): Promise<void> {
  if (ensuring) {
    // Der laufende Durchgang nimmt die neue Liste danach auf.
    queued = texts;
    return;
  }
  if (Date.now() < pausedUntil) return;
  ensuring = true;
  try {
    await loadAudioIndex();
    let todo = [...new Set(texts)].filter((text) => {
      // Der Server nimmt keinen längeren Text an. Ein einziger würde die ganze Gruppe scheitern lassen.
      if (text.length > LIMITS.MAX_AUDIO_CHARS) return false;
      const hash = fnv1a(text);
      return !bundled.has(`fr/${hash}`) && !remote.has(hash) && !skipped.has(hash);
    });
    // Obergrenze für die Zahl der Aufrufe, falls der Server immer wieder "später" sagt.
    for (let round = 0; todo.length > 0 && round < 400; round++) {
      const batch = todo.slice(0, BATCH);
      const response = await apiPost<EnsureResponse>("/api/audio/ensure", { texts: batch });
      const ready = new Set(response.ready);
      const pending = new Set(response.pending);
      for (const hash of ready) remote.add(hash);
      if (ready.size > 0) saveRemote();
      for (const text of batch) {
        const hash = fnv1a(text);
        if (!ready.has(hash) && !pending.has(hash)) skipped.add(hash);
      }
      if (response.stopped) {
        // Tageslimit erreicht, Dienst nicht eingerichtet oder gestört. Später noch einmal.
        pausedUntil = Date.now() + PAUSE_MS;
        break;
      }
      todo = [...batch.filter((text) => pending.has(fnv1a(text))), ...todo.slice(BATCH)];
    }
  } catch {
    // Kein Netz oder abgemeldet. Die Stimme des Geräts springt ein.
    pausedUntil = Date.now() + PAUSE_MS;
  } finally {
    ensuring = false;
    const next = queued;
    queued = null;
    if (next) void ensureAudio(next);
    else void keepForOffline(texts);
  }
}
