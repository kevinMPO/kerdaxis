#!/usr/bin/env python3
"""Square v5 (1080x1080): the real Kerdaxis app in action, captured in production as a guest (replay of the real
recorded H Company session), a premium music bed, voice-led pacing.
Run from video-square-c/: python3 tools/build_square.py. The voice is the clock (Whisper word timings)."""
import json, re, subprocess

SCENES = [("hook", 0.0, 2.9), ("app", 2.9, 24.7), ("connect", 27.6, 6.3), ("firms", 33.9, 3.9), ("end", 37.8, 5.7)]
TOTAL = 43.5
VO = {"01": 0.4, "02": 3.0, "03": 6.7, "04": 10.9, "05": 16.3, "06": 20.7, "07": 24.7, "08": 27.9, "09": 34.1, "10": 38.0}
CAPTIONED = {"02", "03", "04", "05", "06", "08"}
TEXT = {}
src = subprocess.check_output(["node", "--input-type=module", "-e", 'const {LINES}=await import("./tools/lines.mjs"); console.log(JSON.stringify(LINES))']).decode()
for l in json.loads(src):
    TEXT[l["id"]] = l["text"]
SFX = [("click-replay", "click", 7.45, 0.37, 0.45), ("pop-log", "pop", 14.82, 0.72, 0.3), ("click-go", "click", 20.92, 0.37, 0.55),
       ("ping-done", "ping", 22.2, 1.32, 0.4), ("pop-num", "pop", 24.1, 0.72, 0.25), ("pop-foot", "pop", 25.3, 0.72, 0.25),
       ("pop-q", "pop", 28.89, 0.72, 0.2), ("pop-s", "pop", 29.89, 0.72, 0.18), ("pop-cu", "pop", 32.79, 0.72, 0.25),
       ("hit-mark", "impact-bass-2", 39.6, 2.59, 0.25), ("pop-cta", "pop", 40.3, 0.72, 0.25)]


def dur(p):
    return float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", p]))


lines = [(i, f"assets/voice/vo-{i}.mp3", s, dur(f"assets/voice/vo-{i}.mp3")) for i, s in VO.items()]
for a, b in zip(lines, lines[1:]):
    assert a[2] + a[3] < b[2], f"voice {a[0]} overlaps {b[0]}"
for (_, s1, d1), (_, s2, _) in zip(SCENES, SCENES[1:]):
    assert abs(s1 + d1 - s2) < 1e-6, (s1, d1, s2)
assert abs(SCENES[-1][1] + SCENES[-1][2] - TOTAL) < 1e-6
segs = [(s, s + d) for _, _, s, d in lines]


def lane(c0, c1, lo, hi, r=0.2):
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


groups = []
for i, _, start, d in lines:
    if i not in CAPTIONED:
        continue
    chunks, cur = [], []
    for w in TEXT[i].split():
        cur.append(w)
        if len(cur) >= 4 or re.search(r"[.,:?!]$", w):
            chunks.append(cur); cur = []
    if cur:
        chunks.append(cur)
    total = sum(len(" ".join(c)) for c in chunks); t, span = start + 0.05, d - 0.1
    for c in chunks:
        g = " ".join(c); gd = span * len(g) / total
        groups.append((g, round(t, 3), round(t + gd, 3))); t += gd
cap_html = "\n".join(f'    <div id="cg{k}" class="cg"><span>{g}</span></div>' for k, (g, a, b) in enumerate(groups))
cap_js = "\n".join(f'      tl.set("#cg{k}", {{ opacity: 1, visibility: "visible" }}, {a}); tl.set("#cg{k}", {{ opacity: 0, visibility: "hidden" }}, {b});' for k, (g, a, b) in enumerate(groups))
open("compositions/captions.html", "w").write(f"""<template>
  <style>
    #root {{ position: absolute; inset: 0; overflow: visible; pointer-events: none; font-family: "Plus Jakarta Sans", sans-serif; }}
    .cg {{ position: absolute; left: 0; top: 950px; width: 1080px; text-align: center; opacity: 0; visibility: hidden; }}
    .cg span {{ display: inline-block; padding: 6px 22px; border-radius: 14px; background: #f4f4f8; color: #0d0d12; font-weight: 800; font-size: 46px; line-height: 62px; letter-spacing: -0.02em; white-space: nowrap; }}
  </style>
  <div id="root" data-composition-id="captions" data-width="1080" data-height="1080">
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
scenes = "\n".join(f'      <div id="{n}" class="clip" data-composition-id="{n}" data-composition-src="compositions/{n}.html" data-start="{s}" data-duration="{d}" data-track-index="1" data-track-kind="graphics" data-width="1080" data-height="1080" style="z-index: {k + 1}"></div>' for k, (n, s, d) in enumerate(SCENES))
vo = "\n".join(f'      <audio id="vo-{i}" class="clip" src="{f}" data-start="{s}" data-duration="{d:.2f}" data-track-index="{40 + k}" data-volume="1.3"></audio>' for k, (i, f, s, d) in enumerate(lines))
sfx = "\n".join(f'      <audio id="sfx-{k}" class="clip" src="assets/sfx/{f}.mp3" data-start="{s}" data-duration="{d}" data-track-index="{60 + k}" data-volume="{v}"></audio>' for k, (n, f, s, d, v) in enumerate(SFX))
music = f"""      <audio id="bgm-a" class="clip" src="assets/music/premium-2.mp3" data-start="0" data-duration="30" data-track-index="20" data-volume="1" data-fade-in="0.4" data-automation="{lane(0, 30, 0.08, 0.24)}"></audio>
      <audio id="bgm-b" class="clip" src="assets/music/premium-2.mp3" data-start="30" data-duration="{round(TOTAL - 30, 2)}" data-track-index="21" data-volume="1" data-fade-out="2.2" data-automation="{lane(30, TOTAL, 0.08, 0.24)}"></audio>"""
h = open("index.html").read()
a = h.index('<div id="root"'); b = h.index("    <script>")
h = h[:a] + f'''<div id="root" data-composition-id="main" data-start="0" data-duration="{TOTAL}" data-width="1080" data-height="1080">
      <!-- Square v5: the real Kerdaxis app in action (production captures, replay of the real recorded session). Built by tools/build_square.py. -->
{scenes}
      <div id="captions" class="clip" data-composition-id="captions" data-composition-src="compositions/captions.html" data-start="0" data-duration="{TOTAL}" data-track-index="2" data-track-kind="captions" data-width="1080" data-height="1080" style="z-index: 50"></div>

{vo}

{music}
{sfx}
    </div>
''' + h[b:]
open("index.html", "w").write(h)
print(f"scenes {len(SCENES)}, voice {len(lines)}, captions {len(groups)}, voice ends {max(s + d for _, _, s, d in lines):.2f}, total {TOTAL}")
