import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";

/** Zeitstempel in UTC, etwa "20261123.160500". Später gebaut heisst größer. */
function buildStamp(): string {
  const iso = new Date().toISOString();
  return `${iso.slice(0, 10).replaceAll("-", "")}.${iso.slice(11, 19).replaceAll(":", "")}`;
}

export default defineConfig(({ command }) => ({
  plugins: [react(), cloudflare()],
  // App und Worker bekommen dieselbe Version. Siehe shared/version.ts.
  define: {
    __APP_VERSION__: JSON.stringify(command === "build" ? buildStamp() : "dev"),
  },
  resolve: {
    alias: {
      "@shared": fileURLToPath(new URL("./shared", import.meta.url)),
    },
  },
  server: {
    // Im WLAN sichtbar, damit das Handy die Seite öffnen kann.
    host: true,
  },
}));
