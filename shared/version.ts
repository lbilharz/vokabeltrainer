/**
 * Die Version dieses Builds. Der Build setzt sie als Zeitstempel in UTC, etwa "20261123.160500".
 * Später gebaut heisst größer. Deshalb lassen sich zwei Versionen als Text vergleichen.
 * Beim Entwickeln und in Tests steht hier "dev".
 */
declare const __APP_VERSION__: string | undefined;

export const APP_VERSION: string = typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "dev";

/** Client und Server nennen sich in diesem Header gegenseitig ihre Version. */
export const VERSION_HEADER = "x-app-version";

/** Kennt der Server eine neuere Version als diese hier? */
export function isNewer(server: string | null | undefined, own: string = APP_VERSION): boolean {
  if (!server || server === "dev" || own === "dev") return false;
  return server > own;
}

/**
 * Die Version als Datum zum Anzeigen: "24.11.2026, 07:03 Uhr".
 * Die Version ist ein Zeitstempel in UTC. Gezeigt wird die Zeit in Deutschland.
 */
export function versionDate(version: string = APP_VERSION): string | null {
  const m = /^(\d{4})(\d{2})(\d{2})\.(\d{2})(\d{2})(\d{2})$/.exec(version);
  if (!m) return null;
  const [year, month, day, hour, minute, second] = m.slice(1).map(Number) as [number, number, number, number, number, number];
  const built = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  const text = new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(built);
  return `${text} Uhr`;
}
