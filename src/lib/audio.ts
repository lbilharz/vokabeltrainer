import { FOREIGN, LOCALE } from "@shared/lang";
import { LIMITS } from "@shared/limits";
import { fnv1a, sayText } from "@shared/text";
import type { Foreign, Lang } from "@shared/types";
import { apiPost } from "./api";

/**
 * Sprachausgabe.
 *
 * Es gibt zwei Quellen für Aufnahmen:
 * - mitgelieferte Dateien unter /audio/<lang>/<hash>.mp3, gelistet in /audio/index.json,
 * - Aufnahmen für fotografierte Wörter unter /api/audio/<fr|en>/<hash>.mp3.
 *
 * Die App muss sofort wissen, ob es eine Aufnahme gibt. Safari erlaubt die Stimme
 * des Geräts nur direkt in einem Klick und nicht erst nach einem fehlgeschlagenen Laden.
 * Deshalb führt sie beide Listen im Speicher.
 */

const BASE = "/audio/";
const remoteBase = (lang: Foreign) => `/api/audio/${lang}/`;
const remoteKey = (lang: Foreign) => `travok_audio_${lang}`;

/** Ein Text mit seiner Sprache. Dasselbe Wort klingt in zwei Sprachen verschieden. */
export interface Spoken {
  text: string;
  lang: Foreign;
}

let bundled = new Set<string>();
let current: HTMLAudioElement | null = null;

function loadRemote(lang: Foreign): Set<string> {
  try {
    const list: unknown = JSON.parse(localStorage.getItem(remoteKey(lang)) ?? "[]");
    return new Set(Array.isArray(list) ? (list as string[]) : []);
  } catch {
    return new Set();
  }
}

/** Kennungen der Aufnahmen, die der Server schon hat, je Sprache. Kein Geheimnis, gilt für alle Konten. */
const remote: Record<Foreign, Set<string>> = { fr: loadRemote("fr"), en: loadRemote("en") };

function saveRemote(lang: Foreign): void {
  try {
    localStorage.setItem(remoteKey(lang), JSON.stringify([...remote[lang]]));
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
  utterance.lang = LOCALE[lang];
  const voice = speechSynthesis.getVoices().find((v) => v.lang.toLowerCase().startsWith(lang));
  if (voice) utterance.voice = voice;
  utterance.rate = rate;
  speechSynthesis.speak(utterance);
}

/** Muss direkt aus einem Klick aufgerufen werden, sonst blockiert der Browser den Ton. */
export function speak(text: string, lang: Lang, baseRate: number): void {
  stop();
  // Deutsch läuft einen Tick schneller als die Sprache, die das Kind lernt.
  const rate = lang === "de" ? Math.min(baseRate + 0.15, 1.3) : baseRate;
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
  if (lang !== "de" && remote[lang].has(hash)) return `${remoteBase(lang)}${hash}.mp3`;
  return null;
}

/**
 * Lädt die Aufnahmen der eigenen Wörter schon einmal herunter.
 * So spielen sie später auch ohne Netz. Läuft still im Hintergrund.
 */
async function keepForOffline(words: Spoken[]): Promise<void> {
  if (!("caches" in window)) return;
  try {
    const cache = await caches.open(AUDIO_CACHE);
    const urls = new Set(words.map((word) => urlFor(word.text, word.lang)));
    for (const url of urls) {
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
let queued: Spoken[] | null = null;
/** Texte ohne sprechbaren Inhalt, als "Sprache/Kennung". Für die fragt die App in dieser Sitzung nicht noch einmal. */
const skipped = new Set<string>();
/** Nach einem "geht gerade nicht" vom Server wartet die App bis zu diesem Zeitpunkt. */
let pausedUntil = 0;
const PAUSE_MS = 5 * 60_000;

/**
 * Sorgt im Hintergrund dafür, dass es für alle Wörter eine Aufnahme gibt.
 *
 * Der Server prüft, was schon da ist, und lässt pro Aufruf nur wenige neue sprechen.
 * Jedes Wort wird einzeln aufgenommen. Bis eine Aufnahme fertig ist, spricht das Gerät.
 * Fehler bleiben still: beim nächsten Start geht es einfach weiter.
 */
export async function ensureAudio(words: Spoken[]): Promise<void> {
  if (ensuring) {
    // Der laufende Durchgang nimmt die neue Liste danach auf.
    queued = words;
    return;
  }
  if (Date.now() < pausedUntil) return;
  ensuring = true;
  try {
    await loadAudioIndex();
    // Eine Sprache nach der anderen. Der Server nimmt pro Anfrage nur eine an.
    for (const lang of FOREIGN) {
      const texts = words.filter((word) => word.lang === lang).map((word) => word.text);
      if (!(await ensureLang(texts, lang))) break;
    }
  } catch {
    // Kein Netz oder abgemeldet. Die Stimme des Geräts springt ein.
    pausedUntil = Date.now() + PAUSE_MS;
  } finally {
    ensuring = false;
    const next = queued;
    queued = null;
    if (next) void ensureAudio(next);
    else void keepForOffline(words);
  }
}

/** Die Aufnahmen einer Sprache. false heisst: der Server will gerade nicht, später noch einmal. */
async function ensureLang(texts: string[], lang: Foreign): Promise<boolean> {
  const known = remote[lang];
  let todo = [...new Set(texts)].filter((text) => {
    // Der Server nimmt keinen längeren Text an. Ein einziger würde die ganze Gruppe scheitern lassen.
    if (text.length > LIMITS.MAX_AUDIO_CHARS) return false;
    const hash = fnv1a(text);
    return !bundled.has(`${lang}/${hash}`) && !known.has(hash) && !skipped.has(`${lang}/${hash}`);
  });
  // Obergrenze für die Zahl der Aufrufe, falls der Server immer wieder "später" sagt.
  for (let round = 0; todo.length > 0 && round < 400; round++) {
    const batch = todo.slice(0, BATCH);
    const response = await apiPost<EnsureResponse>("/api/audio/ensure", { texts: batch, lang });
    const ready = new Set(response.ready);
    const pending = new Set(response.pending);
    for (const hash of ready) known.add(hash);
    if (ready.size > 0) saveRemote(lang);
    for (const text of batch) {
      const hash = fnv1a(text);
      if (!ready.has(hash) && !pending.has(hash)) skipped.add(`${lang}/${hash}`);
    }
    if (response.stopped) {
      // Tageslimit erreicht, Dienst nicht eingerichtet oder gestört. Später noch einmal.
      pausedUntil = Date.now() + PAUSE_MS;
      return false;
    }
    todo = [...batch.filter((text) => pending.has(fnv1a(text))), ...todo.slice(BATCH)];
  }
  return true;
}
