import { MASTER } from "./srs";
import type { CardState } from "./types";

// Die Serie: richtige Antworten im ersten Versuch, eine nach der anderen.
// Das Kennenlernen (counted = false) setzt sie weder fort noch unterbricht es sie.
export function streakAfter(streak: number, correct: boolean, counted: boolean): number {
  if (!counted) return streak;
  return correct ? streak + 1 : 0;
}

const LINES: Record<number, string> = {
  3: "3 in Folge",
  5: "5 in Folge. Läuft.",
  10: "10 in Folge. Stark.",
  15: "15 in Folge. Wer bist du?",
  20: "20 in Folge. Angeber.",
};

// Eine kurze Zeile nur bei 3, 5, 10, 15, 20 und dann alle 10. Sonst null.
export function streakLine(streak: number): string | null {
  const fixed = LINES[streak];
  if (fixed) return fixed;
  if (streak > 20 && streak % 10 === 0) return `${streak} in Folge.`;
  return null;
}

// Diese Antwort hat die Karte von unter MASTER auf MASTER oder höher gebracht.
export function justMastered(before: CardState, after: CardState): boolean {
  return before.box < MASTER && after.box >= MASTER;
}

// Die Überschrift am Ende der Runde. Fehlerfrei: alle Karten gleich richtig, mindestens 3.
export function doneHeadline(stats: { total: number; again: number }): { title: string; line: string } {
  if (stats.again === 0 && stats.total >= 3) {
    return { title: "Fehlerfrei", line: `${stats.total} Karten, kein Fehler.` };
  }
  return {
    title: "Geschafft",
    line: stats.total === 1 ? "1 Karte ist durch." : `${stats.total} Karten sind durch.`,
  };
}
