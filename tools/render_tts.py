#!/usr/bin/env python3
"""Rendert fehlende Sprachdateien mit ElevenLabs.

Liest alle Einträge (fr und de) aus src/data/*.json. Für jeden Text ohne
mp3 erzeugt das Skript public/audio/<lang>/<hash>.mp3 und schreibt
public/audio/index.json neu.

Der Dateiname ist der FNV-1a-Hash des angezeigten Textes. Gesprochen wird
say_text(), also ohne Platzhalter wie qn/qc. Beides MUSS zu fnv1a() und
sayText() in shared/text.ts passen.

Key: aus ~/.secrets/elevenlabs (nur der Key), sonst ELEVENLABS_API_KEY in .env.

Nutzung:
  python3 tools/render_tts.py --dry-run     # nur zeigen, was fehlt
  python3 tools/render_tts.py

Stimmen: siehe VOICE_IDS. VOICE_FR / VOICE_DE in .env überschreiben sie.
Alternative ohne Key: der ElevenLabs-Connector in Claude (siehe Commit 6e70cfa ff.).
"""
import json
import os
import re
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
AUDIO = ROOT / "public" / "audio"
API = "https://api.elevenlabs.io/v1"
MODEL = "eleven_multilingual_v2"
FORMAT = "mp3_44100_128"  # wie die vorhandenen Dateien
# Sprechtempo 0.7 bis 1.2. Mit SPEED in .env oder Umgebung änderbar.
DEFAULT_SPEED = 0.95
# Stimmen aus der ElevenLabs-Bibliothek, mit denen die Vokabeln von Unité 2 gerendert sind:
# fr "Victoria - Content Creator", de "Lea Brandt - Explainer". VOICE_FR / VOICE_DE überschreiben sie.
VOICE_IDS = {"fr": "O31r762Gb3WFygrEOGh0", "de": "pMrwpTuGOma7Nubxs5jo"}


def load_env():
    secret = Path.home() / ".secrets" / "elevenlabs"  # Datei mit nur dem Key
    if "ELEVENLABS_API_KEY" not in os.environ and secret.exists():
        os.environ["ELEVENLABS_API_KEY"] = secret.read_text().strip()
    env_file = ROOT / ".env"
    if env_file.exists():
        for line in env_file.read_text().splitlines():
            if "=" in line and not line.lstrip().startswith("#"):
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


def fnv1a(text):
    h = 0x811C9DC5
    for b in text.encode("utf-8"):
        h ^= b
        h = (h * 0x01000193) & 0xFFFFFFFF
    return f"{h:08x}"


def say_text(s, lang):
    if lang == "fr":
        s = s.replace("(à qn)", "")
        s = re.sub(r"\+\s*inf\.", "", s)
        s = re.sub(r"\bqn/qc\b|\bqc\b|\bqn\b", "", s)
    else:
        s = re.sub(r"\bjdn/etw\.", "jemanden oder etwas", s)
        s = re.sub(r"\bjdm/etw\.", "jemandem oder etwas", s)
        s = re.sub(r"\bjdm\b", "jemandem", s)
        s = re.sub(r"\bjdn\b", "jemanden", s)
        s = re.sub(r"\betw\.", "etwas", s)
        s = re.sub(r"([A-Za-zÄÖÜäöüß]+)/in\b", r"\1, \1in", s)
    s = re.sub(r"[()]", "", s)  # (sich) ändern -> sich ändern
    s = re.sub(r"\s*/\s*", ", ", s)
    s = re.sub(r"\s+", " ", s)
    s = re.sub(r"\s+([,?!])", r"\1", s)
    s = re.sub(r"(,\s*)+", ", ", s)
    return re.sub(r"^[,\s]+|[,\s]+$", "", s)


def phrases():
    # Alle Vokabel-Dateien in src/data/ lesen. Neue Dateien werden automatisch erfasst.
    found = {"fr": set(), "de": set()}
    for f in sorted((ROOT / "src" / "data").glob("*.json")):
        for item in json.loads(f.read_text(encoding="utf-8")):
            for lang in found:
                if item.get(lang):
                    found[lang].add(item[lang])
    return found


def request(path, key, body=None):
    req = urllib.request.Request(
        API + path,
        data=json.dumps(body).encode() if body is not None else None,
        headers={"xi-api-key": key, "Content-Type": "application/json"},
        method="POST" if body is not None else "GET",
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def voice_id(lang, key):
    return os.environ.get("VOICE_" + lang.upper()) or VOICE_IDS[lang]


def write_index():
    keys = sorted(f"{lang}/{p.stem}" for lang in ("fr", "de") for p in (AUDIO / lang).glob("*.mp3"))
    (AUDIO / "index.json").write_text(json.dumps(keys, indent=0) + "\n")
    return len(keys)


def main():
    load_env()
    speed = float(os.environ.get("SPEED", DEFAULT_SPEED))
    dry = "--dry-run" in sys.argv
    todo = [(lang, t) for lang, ts in phrases().items() for t in sorted(ts)
            if not (AUDIO / lang / f"{fnv1a(t)}.mp3").exists()]
    print(f"{len(todo)} Dateien fehlen.")
    for lang, t in todo:
        print(f"  {lang}/{fnv1a(t)}  {say_text(t, lang)}")
    if dry or not todo:
        print(f"audio/index.json: {write_index()} Einträge")
        return
    key = os.environ.get("ELEVENLABS_API_KEY")
    if not key:
        sys.exit("ELEVENLABS_API_KEY fehlt (in .env oder Umgebung).")
    voices = {lang: voice_id(lang, key) for lang in ("fr", "de")}
    for lang, t in todo:
        out = AUDIO / lang / f"{fnv1a(t)}.mp3"
        out.parent.mkdir(parents=True, exist_ok=True)
        text = say_text(t, lang)
        if text[-1] not in ".?!":
            text += "."  # mit Punkt endet die Betonung natürlich
        audio = request(f"/text-to-speech/{voices[lang]}?output_format={FORMAT}", key,
                        {"text": text, "model_id": MODEL, "voice_settings": {"speed": speed}})
        out.write_bytes(audio)
        print(f"  ok {out.relative_to(ROOT)}")
    print(f"audio/index.json: {write_index()} Einträge")


if __name__ == "__main__":
    main()
