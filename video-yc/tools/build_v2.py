#!/usr/bin/env python3
"""Builds index.html and compositions/captions.html for film v2 ("AI CFO" cut).

The voice is the clock: each line's start is fixed here, scenes are cut around it.
Captions are the script text (digits for numbers), timed proportionally to characters
over each line's spoken span (the lines are silence-trimmed, so speech fills the file).
Run from video-yc/:  python3 tools/build_v2.py
"""
import json, re, subprocess

FPS = 30
VOICE = "assets/voice/ai-v2/fast"

# scene id, start, duration (seconds)
SCENES = [
    ("result", 0.0, 4.6), ("market", 4.6, 5.85), ("analyze", 10.45, 5.3), ("detect", 15.75, 3.85),
    ("compare", 19.6, 2.7), ("recommend", 22.3, 4.3), ("approve", 26.6, 3.0), ("navigate", 29.6, 7.2),
    ("stop", 36.8, 5.2), ("prove", 42.0, 3.6), ("end", 45.6, 5.4),
]
TOTAL = 51.0

# voice line id -> start (s)
VO = {"01": 0.3, "02": 4.7, "03": 10.5, "04": 15.8, "05": 19.65, "06": 22.35, "07": 26.65,
      "08": 29.75, "09": 36.8, "10": 42.05, "11": 45.7}

CAPTIONS = {
    "01": "Our AI agent just cancelled a SaaS subscription. In 45 seconds.",
    "02": "33 million businesses in the EU. Most can't afford a full-time CFO.",
    "03": "Kerdaxis is their AI CFO. A deterministic engine reads every transaction.",
    "04": "It detects waste: unused tools, duplicates, price rises.",
    "05": "It compares alternatives on the web, with Linkup.",
    "06": "Then it recommends: cancel, downgrade, switch, or renegotiate.",
    "07": "Nuvio CRM: unused. You approve.",
    "08": "An H Company agent opens the supplier's site. The page tells it to accept a discount. It doesn't.",
    "09": "Before the one click you can't undo, it stops. And waits for you.",
    "10": "The supplier confirms. The bank check is scheduled for day 30.",
    # 11 is not captioned: the end card shows the same words on screen.
}

# (id, file, start, duration, volume)
SFX = [
    ("hit-stamp", "stamp", 0.44, 0.8, 0.7), ("hit-count", "pop", 3.43, 0.72, 0.35), ("wh-market", "whoosh-short", 4.45, 0.57, 0.25),
    ("hit-33", "impact-bass-1", 4.62, 2.12, 0.25), ("wh-flood1", "whoosh-short", 9.95, 0.57, 0.25),
    ("hit-analyze", "impact-bass-1", 10.4, 2.12, 0.2), ("tick-a1", "click-soft", 10.85, 0.37, 0.3), ("tick-a2", "click-soft", 11.25, 0.37, 0.3),
    ("pop-rule", "pop", 12.8, 0.72, 0.3), ("wh-left", "whoosh", 15.42, 0.57, 0.3),
    ("pop-d0", "pop", 16.0, 0.72, 0.3), ("pop-d1", "click-soft", 17.05, 0.37, 0.35), ("pop-d3", "pop", 18.15, 0.72, 0.25),
    ("pop-d4", "click-soft", 18.65, 0.37, 0.3), ("wh-detect", "whoosh-short", 19.3, 0.57, 0.25),
    ("hit-compare", "stamp", 19.52, 0.8, 0.4), ("pop-c", "pop", 20.05, 0.72, 0.25), ("wh-comp", "whoosh-short", 22.6, 0.57, 0.25),
    ("hit-rec", "impact-bass-1", 22.26, 2.12, 0.2), ("pop-r0", "pop", 22.73, 0.72, 0.3), ("pop-r1", "click-soft", 23.58, 0.37, 0.35),
    ("pop-r2", "pop", 24.38, 0.72, 0.3), ("pop-r3", "click-soft", 25.28, 0.37, 0.35), ("wh-zoom", "whoosh", 26.05, 0.57, 0.3),
    ("hit-approve", "stamp", 26.52, 0.8, 0.45), ("click-ok", "click", 28.89, 0.37, 0.6), ("wh-iris", "whoosh-short", 29.5, 0.57, 0.25),
    ("click-n1", "click-soft", 30.63, 0.37, 0.45), ("click-n2", "click-soft", 31.55, 0.37, 0.45), ("click-n3", "click-soft", 32.15, 0.37, 0.45),
    ("wh-push", "whoosh", 32.55, 0.57, 0.2), ("pop-inj", "pop", 32.98, 0.72, 0.3), ("hit-ignored", "stamp", 34.7, 0.8, 0.7),
    ("click-n4", "click-soft", 35.45, 0.37, 0.45), ("wh-dip", "whoosh-short", 36.4, 0.57, 0.25),
    ("tapestop", "tapestop", 35.95, 0.85, 0.6), ("wh-split", "whoosh-short", 39.25, 0.57, 0.2), ("heart", "heartbeat", 39.37, 3.0, 0.9),
    ("build", "build", 39.5, 2.48, 0.3), ("click-go", "click", 41.58, 0.37, 0.65),
    ("drop", "drophit", 41.93, 1.48, 0.45), ("pop-box", "pop", 42.05, 0.72, 0.35), ("wh-carry", "whoosh", 42.4, 0.57, 0.25),
    ("tick-1", "click-soft", 42.93, 0.37, 0.4), ("tick-2", "pop", 43.18, 0.72, 0.3), ("tick-3", "click-soft", 43.43, 0.37, 0.4),
    ("tick-4", "pop", 43.68, 0.72, 0.3), ("key-d30", "key-press", 44.62, 0.4, 0.6), ("riser", "riser", 42.68, 3.6, 0.18),
    ("hit-mark", "impact-bass-1", 46.08, 2.12, 0.4), ("pop-cta", "pop", 46.73, 0.72, 0.3),
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
    lo, hi, r = 0.2, 0.42, 0.15
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
music = f"""      <audio id="bgm-a" class="clip" src="assets/music/bed2-long.mp3" data-start="0" data-media-start="0.24" data-duration="{stop_start + 0.05}" data-track-index="20" data-volume="1" data-fade-out="0.1" data-automation="{lane(0, stop_start + 0.05)}"></audio>
      <audio id="bgm-hold" class="clip" src="assets/music/hold.mp3" data-start="{stop_start}" data-duration="{min(5.0, round(prove_start - stop_start + 0.05, 3))}" data-track-index="21" data-volume="1.2" data-fade-in="0.1" data-fade-out="0.25"></audio>
      <audio id="bgm-b" class="clip" src="assets/music/bed2-long.mp3" data-start="{prove_start}" data-media-start="{prove_start + 0.24}" data-duration="{round(TOTAL - prove_start, 3)}" data-track-index="22" data-volume="1" data-fade-out="1.5" data-automation="{lane(prove_start, TOTAL)}"></audio>"""
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
      <!-- v2 "AI CFO" cut (SPEC.md). Generated by tools/build_v2.py — edit timings there. v1 = git tag video-yc-v1. -->
{scene_html}
{cap_host}

      <!-- Voice: AI voice "Liam" (ElevenLabs premade, eleven_v3), tempo x1.12; lines 02/03/07/10/11 regenerated singly (brand + truncation checks). -->
{vo_html}

      <!-- Music: ElevenLabs sound-generation loop (120 BPM), ducked under the voice; tape stop into STOP, held pad, build + drop into PROVE. -->
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
