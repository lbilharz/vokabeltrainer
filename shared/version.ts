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
