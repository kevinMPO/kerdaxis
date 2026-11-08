#!/usr/bin/env python3
"""Square v4 "An AI CFO with hands" (1080x1080), following the LinkedIn post: hook, CONNECT/ANALYZE/COMPARE,
EXECUTE (x2 zoom + spotlight), the trap, APPROVE, VERIFY + 5/5, accounting firms, end card with two CTAs.
Run from video-square-b/: python3 tools/build_square.py. The voice is the clock (Whisper word timings)."""
import json, re, subprocess

SCENES = [("hook", 0.0, 2.4), ("sec1", 2.4, 4.8), ("exec", 7.2, 7.9), ("approve", 15.1, 5.2), ("verify", 20.3, 5.6),
          ("firms", 25.9, 5.1), ("end", 31.0, 5.5)]
TOTAL = 36.5
VO = {"01": 0.2, "02": 2.5, "03": 7.3, "04": 11.6, "05": 15.4, "06": 19.55, "07": 22.4, "08": 26.0, "09": 31.1}
CAPTIONED = {"02", "03", "04", "07"}  # elsewhere the screen already carries the words
WAIT0, GO = 17.27, 19.95  # music cut from "stops" to the human click
TEXT = {}
src = subprocess.check_output(["node", "--input-type=module", "-e", 'const {LINES}=await import("./tools/lines.mjs"); console.log(JSON.stringify(LINES))']).decode()
for l in json.loads(src):
    TEXT[l["id"]] = l["text"]
TEXT["04"] = "The page tells it to accept a discount. It says no."
TEXT["05"] = "Before the final click, it stops, and waits for you."

SFX = [("cl-hook", "click", 1.55, 0.37, 0.5)]
for t in (2.6, 3.9, 5.3, 7.25, 15.15, 20.3):  # chapter slams
    SFX += [(f"slam{t}", "impact-bass-1", t, 2.12, 0.28)]
SFX += [(f"cl{t}", "click-soft", round(7.2 + t, 3), 0.37, 0.45) for t in (0.95, 1.6, 2.25, 2.85, 3.3)]
SFX += [("pop-inj", "pop", 12.04, 0.72, 0.3), ("stamp-no", "stamp", 13.99, 0.8, 0.6), ("cl-no", "click-soft", 14.15, 0.37, 0.45),
        ("tape", "tapestop", 17.1, 0.85, 0.4), ("heart", "heartbeat", 17.6, 3.0, 0.55), ("click-go", "click", GO, 0.37, 0.6),
        ("cl-conf", "click-soft", 20.8, 0.37, 0.45), ("stamp-conf", "stamp", 21.25, 0.8, 0.5), ("hit-5", "impact-bass-1", 22.48, 2.12, 0.45),
        ("hit-55", "impact-bass-2", 23.04, 2.59, 0.5), ("pop-f1", "pop", 26.2, 0.72, 0.25), ("pop-f2", "pop", 27.9, 0.72, 0.25),
        ("pop-f3", "pop", 29.48, 0.72, 0.25), ("hit-mark", "impact-bass-2", 33.55, 2.59, 0.4), ("pop-cta", "pop", 34.0, 0.72, 0.3)]


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
M2 = round(GO, 2)
music = f"""      <audio id="bgm-a" class="clip" src="assets/music/power-2.mp3" data-start="0" data-media-start="0.02" data-duration="{WAIT0}" data-track-index="20" data-volume="1" data-fade-out="0.15" data-automation="{lane(0, WAIT0, 0.07, 0.2)}"></audio>
      <audio id="bgm-hold" class="clip" src="assets/music/hold.mp3" data-start="{WAIT0 + 0.05}" data-duration="{round(GO - WAIT0 - 0.05, 2)}" data-track-index="21" data-volume="0.45" data-fade-in="0.3" data-fade-out="0.1"></audio>
      <audio id="bgm-b" class="clip" src="assets/music/power-2.mp3" data-start="{GO}" data-media-start="{M2}" data-duration="{round(30 - M2, 2)}" data-track-index="22" data-volume="1" data-automation="{lane(GO, 30 - M2 + GO, 0.07, 0.2)}"></audio>
      <audio id="bgm-c" class="clip" src="assets/music/power-2.mp3" data-start="{round(GO + 30 - M2, 2)}" data-duration="{round(TOTAL - (GO + 30 - M2), 2)}" data-track-index="23" data-volume="1" data-fade-out="2.0" data-automation="{lane(GO + 30 - M2, TOTAL, 0.07, 0.2)}"></audio>"""
h = open("index.html").read()
a = h.index('<div id="root"'); b = h.index("    <script>")
h = h[:a] + f'''<div id="root" data-composition-id="main" data-start="0" data-duration="{TOTAL}" data-width="1080" data-height="1080">
      <!-- Square v4 "An AI CFO with hands", following the LinkedIn post. Built by tools/build_square.py. -->
{scenes}
      <div id="captions" class="clip" data-composition-id="captions" data-composition-src="compositions/captions.html" data-start="0" data-duration="{TOTAL}" data-track-index="2" data-track-kind="captions" data-width="1080" data-height="1080" style="z-index: 50"></div>

{vo}

{music}
{sfx}
    </div>
''' + h[b:]
open("index.html", "w").write(h)
print(f"scenes {len(SCENES)}, voice {len(lines)}, captions {len(groups)}, voice ends {max(s + d for _, _, s, d in lines):.2f}, total {TOTAL}")
