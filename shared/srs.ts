import type { CardState, Progress } from "./types";

// Ab dieser Box gilt eine Karte als "sitzt".
export const MASTER = 4;
export const MAX_BOX = 8;
// Tage bis zur nächsten Abfrage je Box.
export const INTERVAL: Record<number, number> = { 1: 0, 2: 1, 3: 2, 4: 4, 5: 7, 6: 14, 7: 30, 8: 90 };

const DAY = 86400000;

// Lokaler Kalendertag als ganze Zahl.
export function dayNumber(date: Date): number {
  return Math.floor((date.getTime() - date.getTimezoneOffset() * 60000) / DAY);
}

// Gespeicherter Stand, sonst eine neue, ungesehene Karte.
export function getCard(progress: Progress, id: string, today: number): CardState {
  return progress[id] ?? { box: 1, due: today, seen: false };
}

export function isDue(card: CardState, today: number): boolean {
  return card.seen && card.due <= today;
}

export function isMastered(card: CardState): boolean {
  return card.seen && card.box >= MASTER;
}

// Neue Karte wird zum ersten Mal gezeigt.
export function introduce(card: CardState, today: number): CardState {
  if (card.seen) return card;
  return { box: 1, due: today, seen: true };
}

// Bewertung einer Antwort. Verändert die Karte nicht.
export function rate(card: CardState, correct: boolean, today: number): CardState {
  if (!correct) return { box: 1, due: today, seen: true };
  // Zu früh geübt: Stand bleibt.
  if (card.due > today) return { box: card.box, due: card.due, seen: true };
  const box = Math.min(card.box + 1, MAX_BOX);
  return { box, due: today + INTERVAL[box], seen: true };
}
