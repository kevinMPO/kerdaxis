#!/usr/bin/env python3
"""Builds index.html and compositions/captions.html for film v3 ("Technical architecture" cut).

The voice is the clock: each line's start is fixed here, scenes are cut around it.
Captions are the script text (digits for numbers), timed proportionally to characters
over each line's spoken span (the lines are silence-trimmed, so speech fills the file).
Run from video-arch/:  python3 tools/build_v3.py
"""
import json, re, subprocess

FPS = 30
VOICE = "assets/voice/fast"

# scene id, start, duration (seconds)
SCENES = [
    ("opportunity", 0.0, 5.7), ("connect", 5.7, 6.3), ("orchestrate", 12.0, 9.3), ("market", 21.3, 4.7),
    ("navigate", 26.0, 5.4), ("stop", 31.4, 3.9), ("prove", 35.3, 4.0), ("services", 39.3, 7.6), ("finale", 46.9, 3.0),
]
TOTAL = 49.9

# voice line id -> start (s)
VO = {"01": 0.2, "02": 5.75, "03": 12.05, "04": 21.35, "05": 26.05, "06": 35.4, "07": 39.4}

CAPTIONS = {
    "01": "Millions of small businesses can't afford a full-time CFO. What if AI could actually do the work?",
    "02": "Kerdaxis connects through MCP and APIs, and can use H Company's computer use when software has no integration.",
    "03": "Mastra orchestrates agents and tools. Our deterministic engine calculates every euro, while the agent harness controls execution, permissions and evidence.",
    "04": "Linkup compares market alternatives, turning anomalies into actionable recommendations.",
    "05": "H Company's agent executes inside a real interface, ignores malicious page instructions, and stops before the irreversible click until a human approves.",
    "06": "The supplier confirms. Kerdaxis records the proof and schedules the bank check.",
    "07": "Services as Software: accounting firms distribute it, Forward Deployed Engineers adapt it, and SMEs get the work done.",
}

# (id, file, start, duration, volume)
SFX = [
    ("tick-o1", "click-soft", 0.5, 0.37, 0.25), ("tick-o2", "click-soft", 1.45, 0.37, 0.25), ("tick-o3", "click-soft", 2.4, 0.37, 0.25),
    ("pop-title", "pop", 3.38, 0.72, 0.3), ("wh-connect", "whoosh-short", 5.55, 0.57, 0.22),
    ("pop-q", "pop", 6.6, 0.72, 0.25), ("pop-ui", "pop", 8.4, 0.72, 0.22), ("wh-orch", "whoosh-short", 11.85, 0.57, 0.22),
    ("hit-mastra", "impact-bass-1", 12.0, 2.12, 0.18), ("pop-eng", "pop", 14.15, 0.72, 0.25), ("pop-calc", "click-soft", 15.35, 0.37, 0.3),
    ("pop-hco", "pop", 16.95, 0.72, 0.25), ("pop-pol", "click-soft", 18.05, 0.37, 0.3), ("pop-hum", "pop", 18.65, 0.72, 0.25),
    ("pop-led", "click-soft", 19.85, 0.37, 0.3), ("wh-market", "whoosh", 21.1, 0.57, 0.22), ("pop-dec", "pop", 23.75, 0.72, 0.25),
    ("wh-iris", "whoosh-short", 25.9, 0.57, 0.22), ("click-n1", "click-soft", 26.78, 0.37, 0.45), ("click-n2", "click-soft", 27.35, 0.37, 0.45),
    ("wh-push", "whoosh", 27.65, 0.57, 0.2), ("pop-inj", "pop", 28.88, 0.72, 0.3), ("hit-ignored", "stamp", 30.3, 0.8, 0.65),
    ("click-n3", "click-soft", 30.85, 0.37, 0.45), ("wh-dip", "whoosh-short", 31.1, 0.57, 0.22),
    ("heart", "heartbeat", 31.85, 3.0, 0.8), ("click-go", "click", 34.21, 0.37, 0.6),
    ("pop-box", "pop", 35.35, 0.72, 0.3), ("wh-carry", "whoosh", 35.8, 0.57, 0.22),
    ("tick-1", "click-soft", 36.23, 0.37, 0.35), ("tick-2", "pop", 36.48, 0.72, 0.25), ("tick-3", "click-soft", 36.73, 0.37, 0.35),
    ("tick-4", "pop", 36.98, 0.72, 0.25), ("key-d30", "key-press", 37.43, 0.4, 0.55),
    ("wh-serv", "whoosh-short", 39.1, 0.57, 0.22), ("pop-firm", "pop", 41.0, 0.72, 0.22), ("pop-fde", "pop", 42.7, 0.72, 0.22),
    ("pop-sme", "pop", 45.0, 0.72, 0.22), ("riser", "riser", 43.53, 3.6, 0.15), ("hit-mark", "impact-bass-1", 47.38, 2.12, 0.35),
    ("pop-cta", "pop", 47.48, 0.72, 0.25),
]


def dur(path):
    return float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path]))


lines = {k: (VO[k], dur(f"{VOICE}/vo-{k}.mp3")) for k in VO}
order = sorted(lines.items(), key=lambda kv: kv[1][0])
for (a, (sa, da)), (b, (sb, _)) in zip(order, order[1:]):
    assert sa + da < sb, f"voice {a} overlaps {b}"
assert abs(SCENES[-1][1] + SCENES[-1][2] - TOTAL) < 1e-6
for (_, s1, d1), (_, s2, _) in zip(SCENES, SCENES[1:]):
    assert abs(s1 + d1 - s2) < 1e-6, "scenes must be contiguous"


def lane(c0, c1):
    """Music ducking: 0.42 between lines, 0.2 under the voice, 0.15 s ramps (clip time)."""
    lo, hi, r = 0.16, 0.34, 0.15
    segs = [(s, s + d) for s, d in lines.values()]
    pts = [{"t": 0, "v": lo if any(a <= c0 < b for a, b in segs) else hi}]
    for a, b in sorted(segs):
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


# ---- captions ---------------------------------------------------------------
groups = []
for k, text in CAPTIONS.items():
    start, d = lines[k]
    words = text.split()
    chunks, cur = [], []
    for w in words:
        cur.append(w)
        if len(cur) >= 4 or re.search(r"[.,:?!]$", w):
            chunks.append(cur); cur = []
    if cur:
        chunks.append(cur)
    total_chars = sum(len(" ".join(c)) for c in chunks)
    t = start + 0.05
    span = d - 0.1
    for c in chunks:
        g = " ".join(c)
        gd = span * len(g) / total_chars
        groups.append((g, round(t, 3), round(t + gd, 3)))
        t += gd

cap_html = []
cap_js = []
for i, (g, a, b) in enumerate(groups):
    cap_html.append(f'    <div id="cg{i}" class="cg"><span>{g}</span></div>')
    cap_js.append(f'      tl.set("#cg{i}", {{ opacity: 1, visibility: "visible" }}, {a}); tl.set("#cg{i}", {{ opacity: 0, visibility: "hidden" }}, {b});')

open("compositions/captions.html", "w").write("""<template>
  <style>
    #root { position: absolute; inset: 0; overflow: visible; pointer-events: none; font-family: "Inter", sans-serif; }
    .cg { position: absolute; left: 0; top: 896px; width: 1920px; text-align: center; opacity: 0; visibility: hidden; }
    .cg span { display: inline-block; padding: 8px 24px; border-radius: 14px; background: rgba(8, 13, 19, 0.86); color: #ffffff;
      font-weight: 700; font-size: 44px; line-height: 56px; letter-spacing: -0.01em; white-space: nowrap; }
  </style>
  <div id="root" data-composition-id="captions" data-width="1920" data-height="1080">
""" + "\n".join(cap_html) + """
  </div>
  <script>
    (function () {
      // Burned-in captions for muted LinkedIn autoplay: the script text, one group (<= 4 words) at a time.
      const tl = gsap.timeline({ paused: true });
""" + "\n".join(cap_js) + f"""
      tl.set({{}}, {{}}, {TOTAL});
      window.__timelines["captions"] = tl;
    }})();
  </script>
</template>
""")

# ---- index ------------------------------------------------------------------
scene_html = "\n".join(
    f'      <div id="{n}" class="clip" data-composition-id="{n}" data-composition-src="compositions/{n}.html" data-start="{s}" data-duration="{d}" '
    f'data-track-index="1" data-track-kind="graphics" data-width="1920" data-height="1080" style="z-index: {i + 1}"></div>'
    for i, (n, s, d) in enumerate(SCENES))
cap_host = (f'      <div id="captions" class="clip" data-composition-id="captions" data-composition-src="compositions/captions.html" data-start="0" '
            f'data-duration="{TOTAL}" data-track-index="2" data-track-kind="captions" data-width="1920" data-height="1080" style="z-index: 50"></div>')
vo_html = "\n".join(
    f'      <audio id="vo-{k}" class="clip" src="{VOICE}/vo-{k}.mp3" data-start="{s}" data-duration="{d:.2f}" data-track-index="{40 + i}" data-volume="1.4"></audio>'
    for i, (k, (s, d)) in enumerate(sorted(lines.items())))
stop_start = dict((n, s) for n, s, _ in SCENES)["stop"]
prove_start = dict((n, s) for n, s, _ in SCENES)["prove"]
BED = "assets/music/elegant-long.mp3"
music = f"""      <audio id="bgm-a" class="clip" src="{BED}" data-start="0" data-media-start="0" data-duration="{stop_start + 0.05}" data-track-index="20" data-volume="1" data-fade-out="0.1" data-automation="{lane(0, stop_start + 0.05)}"></audio>
      <audio id="bgm-hold" class="clip" src="assets/music/hold.mp3" data-start="{stop_start}" data-duration="{min(5.0, round(prove_start - stop_start + 0.05, 3))}" data-track-index="21" data-volume="1.0" data-fade-in="0.1" data-fade-out="0.25"></audio>
      <audio id="bgm-b" class="clip" src="{BED}" data-start="{prove_start}" data-media-start="{prove_start}" data-duration="{round(TOTAL - prove_start, 3)}" data-track-index="22" data-volume="1" data-fade-out="1.5" data-automation="{lane(prove_start, TOTAL)}"></audio>"""
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
      :root {{ --ground: #080d13; --ink: #eef8f5; --lime: #b4f768; --font-display: "Inter", sans-serif; }}
      * {{ margin: 0; padding: 0; box-sizing: border-box; }}
      html, body {{ margin: 0; width: 1920px; height: 1080px; overflow: hidden; background: var(--ground); }}
      #root {{ position: relative; width: 100%; height: 100%; font-family: var(--font-display); }}
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="{TOTAL}" data-width="1920" data-height="1080">
      <!-- v3 "Technical architecture" cut (SPEC.md). Generated by tools/build_v3.py. Earlier films: video-yc/ (v2 live on the site), tag video-yc-v1. -->
{scene_html}
{cap_host}

      <!-- Voice: AI voice "Liam" (ElevenLabs premade, eleven_v3), each line generated and Whisper-checked singly (tools/gen_lines.sh), tempo x1.12. -->
{vo_html}

      <!-- Music: elegant ElevenLabs sound-generation loop (100 BPM), ducked under the voice; held pad over the human gate. -->
{music}

      <!-- Effects: each on a visible action. -->
{sfx_html}
    </div>
    <script>
      window.__timelines = window.__timelines || {{}};
      window.__timelines["main"] = gsap.timeline({{ paused: true }});
    </script>
  </body>
</html>
""")
print(f"scenes {len(SCENES)}, captions {len(groups)} groups, voice ends {max(s + d for s, d in lines.values()):.2f}, total {TOTAL}")
