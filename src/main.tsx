import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/nunito";
import { App } from "./App";
import "./index.css";

// Der Service Worker macht die App ohne Netz startbar. Beim Entwickeln stört er nur.
if ("serviceWorker" in navigator && !import.meta.env.DEV) {
  void navigator.serviceWorker.register("/sw.js").catch(() => {
    // Ohne Service Worker läuft die App normal, nur nicht ohne Netz.
  });
}

const root = document.getElementById("root");
if (!root) throw new Error("#root fehlt in index.html");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
