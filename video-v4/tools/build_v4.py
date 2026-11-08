#!/usr/bin/env python3
"""Film v4 "The click it didn't make": writes index.html and compositions/captions.html.

Run from video-v4/: python3 tools/build_v4.py. The voice is the clock: VO starts below come from the
per-word timestamps of each line (Whisper), and every scene's local timings are written against them.
"""
import json, os, re, subprocess

NO_CAPTIONS = os.environ.get("NO_CAPTIONS") == "1"  # clean 16:9 master for the square cut

SCENES = [("trap", 0.0, 6.2), ("stop", 6.2, 6.3), ("confirm", 12.5, 4.1), ("dash", 16.6, 16.5),
          ("flow", 33.1, 8.5), ("proof", 41.6, 7.6), ("end", 49.2, 6.8)]
TOTAL = 56.0
GREEN_LIGHT = 12.05  # the human click, on "green light"

VO_START = {"01": 0.40, "02": 4.50, "03": 6.40, "04": 11.70, "05": 16.90, "06": 23.80, "07": 33.40, "08": 41.90, "09": 49.50}

SFX = [  # (id, file, start, duration, volume)
    ("pop-inj", "pop", 1.8, 0.72, 0.3), ("wh-want", "whoosh-short", 2.9, 0.57, 0.2), ("stamp-no", "stamp", 4.5, 0.8, 0.6),
    ("click-no", "click-soft", 4.6, 0.37, 0.45), ("wh-dip", "whoosh", 5.75, 0.57, 0.25), ("tapestop", "tapestop", 5.95, 0.85, 0.45),
    ("heart", "heartbeat", 9.3, 3.0, 0.7), ("click-go", "click", GREEN_LIGHT, 0.37, 0.65),
    ("pop-conf", "pop", 14.0, 0.72, 0.3), ("key-num", "key-press", 15.13, 0.4, 0.45), ("wh-conf", "whoosh", 16.1, 0.57, 0.25),
    ("pop-row", "pop", 17.7, 0.72, 0.25), ("mk-login", "click-soft", 21.88, 0.37, 0.35), ("mk-year", "click-soft", 22.8, 0.37, 0.3),
    ("wh-pull", "whoosh-short", 23.55, 0.57, 0.22), ("wh-head", "whoosh-short", 25.15, 0.57, 0.2), ("hit-5388", "impact-bass-1", 25.76, 2.12, 0.25),
    ("wh-sub", "whoosh-short", 28.15, 0.57, 0.2), ("mk-engine", "click-soft", 28.9, 0.37, 0.3), ("wh-dash", "whoosh", 32.45, 0.57, 0.25),
    ("n1", "click-soft", 33.44, 0.37, 0.4), ("n2", "click-soft", 34.44, 0.37, 0.4), ("n3", "click-soft", 35.48, 0.37, 0.4),
    ("n4", "pop", 36.45, 0.72, 0.35), ("click-you", "click", 37.5, 0.37, 0.55), ("n5", "pop", 37.91, 0.72, 0.3), ("n6", "pop", 38.98, 0.72, 0.3),
    ("wh-flow", "whoosh", 41.05, 0.57, 0.25), ("hit-5", "impact-bass-1", 45.23, 2.12, 0.35), ("stamp-55", "stamp", 46.41, 0.8, 0.5),
    ("riser", "riser", 46.9, 2.4, 0.15), ("hit-mark", "impact-bass-2", 49.3, 2.59, 0.35), ("pop-cta", "pop", 52.8, 0.72, 0.3),
]


def dur(path):
    return float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path]))


lines_src = subprocess.check_output(["node", "--input-type=module", "-e",
    'const {LINES}=await import("./tools/lines.mjs"); console.log(JSON.stringify(LINES))']).decode()
LINES = json.loads(lines_src)
lines = [(l["id"], f"assets/voice/vo-{l['id']}.mp3", VO_START[l["id"]], dur(f"assets/voice/vo-{l['id']}.mp3"), l["text"]) for l in LINES]
for a, b in zip(lines, lines[1:]):
    assert a[2] + a[3] < b[2], f"voice {a[0]} overlaps {b[0]}"
for (_, s1, d1), (_, s2, _) in zip(SCENES, SCENES[1:]):
    assert abs(s1 + d1 - s2) < 1e-6, "scenes must be contiguous"
assert abs(SCENES[-1][1] + SCENES[-1][2] - TOTAL) < 1e-6
assert max(s + d for _, _, s, d, _ in lines) < TOTAL - 1.5, "end card must hold after the last word"
segs = [(s, s + d) for _, _, s, d, _ in lines]


def lane(c0, c1, lo, hi, r=0.15):
    """Volume automation: duck the music to `lo` under the voice, `hi` between lines."""
    pts = [{"t": 0, "v": lo if any(a <= c0 < b for a, b in segs) else hi}]
    for a, b in segs:
        if b < c0 or a > c1:
            continue
        A, B = max(a - r, c0), min(b, c1)
        pts += [{"t": A - c0, "v": hi}, {"t": A - c0 + r, "v": lo}, {"t": B - c0, "v": lo}, {"t": min(B + r, c1) - c0, "v": hi}]
    out = []
    for q in pts:
        t = round(q["t"], 3)
        if out and t <= out[-1]["t"]:
            t = round(out[-1]["t"] + 0.001, 3)
        out.append({"t": t, "v": q["v"]})
    return json.dumps({"version": 1, "lanes": [{"target": "volume", "points": out}]}).replace('"', "&quot;")


# Captions: the script, 4 words or a punctuation break per group, timed proportionally inside each line.
groups = []
for _, _, start, d, text in lines:
    chunks, cur = [], []
    for w in text.split():
        cur.append(w)
        if len(cur) >= 4 or re.search(r"[.,:?!]$", w):
            chunks.append(cur); cur = []
    if cur:
        chunks.append(cur)
    total = sum(len(" ".join(c)) for c in chunks)
    t, span = start + 0.05, d - 0.1
    for c in chunks:
        g = " ".join(c); gd = span * len(g) / total
        groups.append((g, round(t, 3), round(t + gd, 3))); t += gd
json.dump(groups, open("tools/caption-groups.json", "w"))
cap_html = "\n".join(f'    <div id="cg{i}" class="cg"><span>{g}</span></div>' for i, (g, a, b) in enumerate(groups))
cap_js = "\n".join(f'      tl.set("#cg{i}", {{ opacity: 1, visibility: "visible" }}, {a}); tl.set("#cg{i}", {{ opacity: 0, visibility: "hidden" }}, {b});'
                   for i, (g, a, b) in enumerate(groups))
open("compositions/captions.html", "w").write(f"""<template>
  <style>
    #root {{ position: absolute; inset: 0; overflow: visible; pointer-events: none; font-family: "Plus Jakarta Sans", sans-serif; }}
    .cg {{ position: absolute; left: 0; top: 916px; width: 1920px; text-align: center; opacity: 0; visibility: hidden; }}
    .cg span {{ display: inline-block; padding: 8px 26px; border-radius: 14px; background: rgba(13, 13, 18, 0.88); color: #ffffff;
      font-weight: 700; font-size: 44px; line-height: 58px; letter-spacing: -0.01em; white-space: nowrap; }}
  </style>
  <div id="root" data-composition-id="captions" data-width="1920" data-height="1080">
{cap_html}
  </div>
  <script>
    (function () {{
      const tl = gsap.timeline({{ paused: true }});
{cap_js}
      tl.set({{}}, {{}}, {TOTAL});
      window.__timelines["captions"] = tl;
    }})();
  </script>
</template>
""")

captions_host = f'      <div id="captions" class="clip" data-composition-id="captions" data-composition-src="compositions/captions.html" data-start="0" data-duration="{TOTAL}" data-track-index="2" data-track-kind="captions" data-width="1920" data-height="1080" style="z-index: 50"></div>'
scene_html = "\n".join(
    f'      <div id="{n}" class="clip" data-composition-id="{n}" data-composition-src="compositions/{n}.html" data-start="{s}" data-duration="{d}" '
    f'data-track-index="1" data-track-kind="graphics" data-width="1920" data-height="1080" style="z-index: {i + 1}"></div>'
    for i, (n, s, d) in enumerate(SCENES))
vo_html = "\n".join(
    f'      <audio id="vo-{i}" class="clip" src="{f}" data-start="{s}" data-duration="{d:.2f}" data-track-index="{40 + k}" data-volume="1.4"></audio>'
    for k, (i, f, s, d, _) in enumerate(lines))
music = f"""      <audio id="bgm-a" class="clip" src="assets/music/bed2-long.mp3" data-start="0" data-media-start="0.24" data-duration="6.2" data-track-index="20" data-volume="1" data-fade-out="0.3" data-automation="{lane(0, 6.2, 0.2, 0.42)}"></audio>
      <audio id="bgm-hold" class="clip" src="assets/music/hold.mp3" data-start="7.0" data-duration="5.0" data-track-index="21" data-volume="1.0" data-fade-in="0.4" data-fade-out="0.2"></audio>
      <audio id="bgm-b" class="clip" src="assets/music/bed2-long.mp3" data-start="{GREEN_LIGHT}" data-media-start="6.44" data-duration="{round(TOTAL - GREEN_LIGHT, 3)}" data-track-index="22" data-volume="1" data-fade-out="1.6" data-automation="{lane(GREEN_LIGHT, TOTAL, 0.2, 0.42)}"></audio>"""
sfx_html = "\n".join(
    f'      <audio id="sfx-{n}" class="clip" src="assets/sfx/{f}.mp3" data-start="{s}" data-duration="{d}" data-track-index="{60 + i}" data-volume="{v}"></audio>'
    for i, (n, f, s, d, v) in enumerate(SFX))

open("index.html", "w").write(f"""<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1920, height=1080" />
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.15.0/dist/gsap.min.js"></script>
    <style>
      @font-face {{ font-family: "Plus Jakarta Sans"; src: url("assets/fonts/plus-jakarta-sans-latin.woff2") format("woff2"); font-weight: 400 800; font-style: normal; }}
      @font-face {{ font-family: "Fira Code"; src: url("assets/fonts/fira-code-latin.woff2") format("woff2"); font-weight: 400 500; font-style: normal; }}
      * {{ margin: 0; padding: 0; box-sizing: border-box; }}
      html, body {{ margin: 0; width: 1920px; height: 1080px; overflow: hidden; background: #0d0d12; }}
      #root {{ position: relative; width: 100%; height: 100%; font-family: "Plus Jakarta Sans", sans-serif; }}
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="{TOTAL}" data-width="1920" data-height="1080">
      <!-- Film v4 "The click it didn't make". Built by tools/build_v4.py; edit SCENES/VO_START/SFX there. -->
{scene_html}
{"" if NO_CAPTIONS else captions_host}

      <!-- Voice: AI voice "Liam" (ElevenLabs eleven_v3), every line Whisper-checked (tools/gen_lines.sh). -->
{vo_html}

      <!-- Music: one bed, cut on the agent's stop, a held pad while it waits, back on the human green light. Ducked under the voice. -->
{music}

{sfx_html}
    </div>
    <script>
      window.__timelines = window.__timelines || {{}};
      window.__timelines["main"] = gsap.timeline({{ paused: true }});
    </script>
  </body>
</html>
""")
print(f"scenes {len(SCENES)}, voice lines {len(lines)}, captions {len(groups)}, voice ends {max(s + d for _, _, s, d, _ in lines):.2f}, total {TOTAL}")
