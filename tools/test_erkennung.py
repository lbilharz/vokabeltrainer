#!/usr/bin/env python3
"""Testet, wie gut ein Bildmodell Vokabeln aus Schulbuchfotos liest.

Das Skript schickt jedes Foto aus tools/testfotos/ einzeln an Gemini.
Die Antwort vergleicht es mit src/data/u2.json.

Key: aus ~/.secrets/gemini (nur der Key).

Nutzung:
  python3 tools/test_erkennung.py                       # Standardmodelle
  python3 tools/test_erkennung.py gemini-flash-latest   # ein Modell

Die Fotos werden vorher auf 1600 px verkleinert, wie später im Browser.
Die Rohantworten landen in tools/testfotos/ergebnis-<modell>.json.
"""
import base64
import difflib
import json
import os
import re
import subprocess
import sys
import tempfile
import time
import unicodedata
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PHOTOS = ROOT / "tools" / "testfotos"
API = "https://generativelanguage.googleapis.com/v1beta/models"
DEFAULT_MODELS = ["gemini-flash-lite-latest", "gemini-flash-latest", "gemini-pro-latest"]
MAX_EDGE = 1600

PROMPT = """Das Foto zeigt eine Vokabelseite aus einem Französisch-Schulbuch für deutsche Schüler.
Lies alle Vokabeleinträge in der gedruckten Reihenfolge.

Für jeden Eintrag:
- "fr": das fett gedruckte französische Stichwort, genau wie gedruckt. Mit Artikel, mit weiblicher Form,
  mit Platzhaltern wie "qn/qc", "(à qn)" und "+ inf.". Ohne Lautschrift in eckigen Klammern.
  Ohne Wortart-Kürzel wie adj., adv., f., m., pl.
- "de": die deutsche Übersetzung aus der rechten Spalte, genau wie gedruckt. Nur der aufrechte Text.
  Steht dort nur eine kursive Erklärung (zum Beispiel bei Städtenamen), dann nimm diese Erklärung.
- "n": Merkhinweise zu diesem Eintrag, mehrere mit " · " getrennt. Dazu gehören kursive Zusätze in der
  rechten Spalte (zum Beispiel "wird wie ouvrir konjugiert", "kausal"), verwandte Wörter mit Pfeil
  (zum Beispiel "→ rêver"), Gleich- und Gegenteile ("= ...", "≠ ...") und Beispielsätze.
  Keine Seitenverweise wie "Verbes, p. 156". Keine englischen Übersetzungen. Sonst null.
- "c": die Abschnittsüberschrift, unter der der Eintrag steht (zum Beispiel "Volet 3").
  Ist auf dem Foto keine Überschrift über dem Eintrag zu sehen, dann null.

Kleine Markierungen vor dem Stichwort gehören nicht zum Stichwort. Ein kleines "(ê)" vor einem Verb
bedeutet: passé composé mit être. Lass es in "fr" weg und schreibe "passé composé mit être" in "n".

Ignoriere angeschnittenen Text am Bildrand und Kästen, die nicht zur Vokabelliste gehören.
Erfinde nichts. Korrigiere nichts. Schreibe Akzente und Apostrophe genau wie gedruckt."""

SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "items": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "properties": {
                    "fr": {"type": "STRING"},
                    "de": {"type": "STRING"},
                    "n": {"type": "STRING", "nullable": True},
                    "c": {"type": "STRING", "nullable": True},
                },
                "required": ["fr", "de"],
            },
        }
    },
    "required": ["items"],
}


def truth():
    data = json.loads((ROOT / "src" / "data" / "u2.json").read_text(encoding="utf-8"))
    return [{"c": e.get("c"), "fr": e["fr"], "de": e["de"], "n": e.get("n")} for e in data]


def norm(s):
    s = unicodedata.normalize("NFC", s or "")
    s = s.replace("’", "'").replace("‘", "'").replace(" ", " ")
    s = re.sub(r"\s*/\s*", "/", s)
    return re.sub(r"\s+", " ", s).strip()


def shrink(photo, tmp):
    out = Path(tmp) / (photo.stem + ".jpg")
    subprocess.run(["sips", "-Z", str(MAX_EDGE), "-s", "format", "jpeg", "-s", "formatOptions", "82",
                    str(photo), "--out", str(out)], check=True, capture_output=True)
    return out


def ask(model, key, image):
    body = {
        "contents": [{"parts": [
            {"inline_data": {"mime_type": "image/jpeg", "data": base64.b64encode(image.read_bytes()).decode()}},
            {"text": PROMPT},
        ]}],
        "generationConfig": {"responseMimeType": "application/json", "responseSchema": SCHEMA},
    }
    # Zum Vergleichen: THINKING=low lässt das Modell kürzer nachdenken.
    if os.environ.get("THINKING"):
        body["generationConfig"]["thinkingConfig"] = {"thinkingLevel": os.environ["THINKING"]}
    req = urllib.request.Request(f"{API}/{model}:generateContent", data=json.dumps(body).encode(),
                                 headers={"x-goog-api-key": key, "Content-Type": "application/json"})
    start = time.time()
    for attempt in range(5):
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                answer = json.load(r)
            break
        except urllib.error.HTTPError as e:
            if e.code != 503 or attempt == 4:  # 503 heisst Überlast, das geht meist vorbei
                raise
            time.sleep(10 * (attempt + 1))
        except (TimeoutError, urllib.error.URLError):
            if attempt == 4:
                raise
            time.sleep(5)
    text = "".join(p.get("text", "") for p in answer["candidates"][0]["content"]["parts"] if not p.get("thought"))
    return json.loads(text)["items"], time.time() - start, answer.get("usageMetadata", {})


def compare(expected, got):
    want = {norm(e["fr"]): e for e in expected}
    have = {norm(g["fr"]): g for g in got}
    hits = [k for k in want if k in have]
    missing = [k for k in want if k not in have]
    extra = [k for k in have if k not in want]
    de_wrong = [(k, want[k]["de"], have[k]["de"]) for k in hits if norm(want[k]["de"]) != norm(have[k]["de"])]
    n_diff = [(k, want[k]["n"], have[k].get("n")) for k in hits if norm(want[k]["n"]) != norm(have[k].get("n"))]
    c_diff = [(k, want[k]["c"], have[k].get("c")) for k in hits if (have[k].get("c") or None) != want[k]["c"]]
    print(f"  Stichwort richtig:    {len(hits)}/{len(want)}")
    print(f"  Übersetzung richtig:  {len(hits) - len(de_wrong)}/{len(hits)} der Treffer")
    print(f"  Komplett richtig (fr und de): {len(hits) - len(de_wrong)}/{len(want)}")
    for k in missing:
        near = difflib.get_close_matches(k, extra, n=1, cutoff=0.6)
        print(f"  FEHLT    {k!r}" + (f"  (gelesen als {near[0]!r})" if near else ""))
    for k in extra:
        if not difflib.get_close_matches(k, missing, n=1, cutoff=0.6):
            print(f"  ZUSATZ   {k!r} = {have[k]['de']!r}")
    for k, w, h in de_wrong:
        print(f"  DE       {k!r}: erwartet {w!r}, gelesen {h!r}")
    print(f"  Hinweise abweichend:  {len(n_diff)} (Konvention, kein harter Fehler)")
    for k, w, h in n_diff:
        print(f"    N      {k!r}: erwartet {w!r}, gelesen {h!r}")
    print(f"  Abschnitt abweichend: {len(c_diff)}")


def main():
    models = [a for a in sys.argv[1:] if not a.startswith("-")] or DEFAULT_MODELS
    key = (Path.home() / ".secrets" / "gemini").read_text().strip()
    photos = sorted(p for p in PHOTOS.iterdir() if p.suffix.lower() in (".jpg", ".jpeg", ".png", ".heic"))
    expected = truth()
    print(f"{len(photos)} Fotos, {len(expected)} Einträge in u2.json")
    with tempfile.TemporaryDirectory() as tmp:
        small = [shrink(p, tmp) for p in photos]
        print("Verkleinert:", ", ".join(f"{s.stat().st_size // 1024} KB" for s in small))
        for model in models:
            print(f"\n== {model}")
            got, seconds, tokens = [], 0.0, {"in": 0, "out": 0, "think": 0}
            try:
                for image in small:
                    items, sec, usage = ask(model, key, image)
                    got += items
                    seconds += sec
                    tokens["in"] += usage.get("promptTokenCount", 0)
                    tokens["out"] += usage.get("candidatesTokenCount", 0)
                    tokens["think"] += usage.get("thoughtsTokenCount", 0)
            except (TimeoutError, urllib.error.URLError) as e:
                if not isinstance(e, urllib.error.HTTPError):
                    print(f"  FEHLER: keine Antwort ({e})")
                    continue
                detail = e.read().decode(errors="replace")
                try:
                    detail = json.loads(detail)["error"]["message"]
                except Exception:
                    pass
                print(f"  FEHLER {e.code}: {detail[:300]}")
                continue
            (PHOTOS / f"ergebnis-{model}.json").write_text(json.dumps(got, ensure_ascii=False, indent=1) + "\n")
            print(f"  {len(got)} Einträge gelesen, {seconds:.1f} s für {len(small)} Fotos, "
                  f"Tokens: {tokens['in']} rein, {tokens['out']} raus, {tokens['think']} Denken")
            compare(expected, got)


if __name__ == "__main__":
    main()
