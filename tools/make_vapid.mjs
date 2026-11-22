#!/usr/bin/env node
/**
 * Erzeugt das Schlüsselpaar für die tägliche Erinnerung (Web Push, VAPID).
 *
 * Das Skript legt den geheimen Schlüssel an zwei Stellen ab und zeigt ihn nie an:
 * - als Secret VAPID_JWK beim Worker (über wrangler),
 * - in .dev.vars für die lokale Entwicklung. Die Datei ignoriert Git.
 *
 * Nutzung:
 *   node tools/make_vapid.mjs
 *
 * Achtung: Ein neues Schlüsselpaar macht alle bestehenden Erinnerungen ungültig.
 * Die Kinder müssen sie dann einmal aus- und wieder einschalten.
 * Deshalb bricht das Skript ab, wenn es schon einen Schlüssel gibt. Mit --neu geht es trotzdem.
 */
import { spawnSync } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";

const DEV_VARS = ".dev.vars";
const force = process.argv.includes("--neu");

const lines = existsSync(DEV_VARS) ? readFileSync(DEV_VARS, "utf8").split("\n") : [];
if (lines.some((line) => line.startsWith("VAPID_JWK")) && !force) {
  console.error("Es gibt schon einen Schlüssel in .dev.vars. Nichts geändert.");
  console.error("Ein neuer Schlüssel macht bestehende Erinnerungen ungültig. Mit --neu geht es trotzdem.");
  process.exit(1);
}

const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
const { kty, crv, x, y, d } = privateKey.export({ format: "jwk" });
const secret = JSON.stringify({ kty, crv, x, y, d });

const put = spawnSync("npx", ["wrangler", "secret", "put", "VAPID_JWK"], {
  input: secret,
  stdio: ["pipe", "inherit", "inherit"],
});
if (put.status !== 0) {
  console.error("Das Secret konnte nicht gesetzt werden. Nichts geändert.");
  process.exit(1);
}

const kept = lines.filter((line) => !line.startsWith("VAPID_JWK") && line !== "");
writeFileSync(DEV_VARS, kept.join("\n") + (kept.length ? "\n" : ""));
appendFileSync(DEV_VARS, `VAPID_JWK = '${secret}'\n`);

console.log("Fertig. Der Schlüssel liegt beim Worker und in .dev.vars.");
