import { fnv1a, sayText } from "@shared/text";
import type { Lang } from "@shared/types";

/**
 * Sprachausgabe.
 *
 * Für fast alle Texte gibt es eine fertige Aufnahme unter /audio/<lang>/<hash>.mp3.
 * Die Liste /audio/index.json sagt sofort, ob eine Datei existiert. Das ist wichtig,
 * weil Safari die Stimme des Geräts nur direkt in einem Klick erlaubt und nicht
 * erst nach einem fehlgeschlagenen Laden.
 */

const BASE = "/audio/";
let keys = new Set<string>();
let current: HTMLAudioElement | null = null;

export function loadAudioIndex(): void {
  fetch(BASE + "index.json")
    .then((r) => (r.ok ? r.json() : []))
    .then((list: unknown) => {
      if (Array.isArray(list)) keys = new Set(list as string[]);
    })
    .catch(() => {
      // Ohne Liste spricht die Stimme des Geräts.
    });
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
  const hash = fnv1a(text);
  if (!keys.has(`${lang}/${hash}`)) {
    speakWithDevice(text, lang, rate);
    return;
  }
  const audio = new Audio(`${BASE}${lang}/${hash}.mp3`);
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
