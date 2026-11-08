#!/usr/bin/env python3
"""Square film A v3 (1080x1080): the agent in action, an English AI voice pitching, music ducked under it.

Run from video-square-a/: python3 tools/build_square.py. The voice is the clock: VO starts and scene
starts below come from the per-word timings of each line; every scene's local timings are written against them.
"""
import json, subprocess

SCENES = [("launch", 0.0, 2.6), ("run", 2.6, 7.5), ("stop", 10.1, 5.04), ("resume", 15.14, 3.2), ("connect", 18.34, 8.96),
          ("montage", 27.3, 4.2), ("proof", 31.5, 4.9), ("end", 36.4, 6.0)]
TOTAL = 42.4
VO = {"01": 0.25, "02": 2.75, "03": 6.55, "04": 10.2, "05": 14.4, "06": 18.5, "07": 27.4, "08": 31.6, "09": 36.5}
STOP, GO = 10.1, 15.04  # music cut while the agent waits; the human click (voice 5 "light")

run_clicks = [2.6 + t for t in (0.517, 1.485, 2.454, 3.18, 3.664, 6.55)]
SFX = [("click-you", "click", 0.97, 0.37, 0.5)] + [(f"cl{i}", "click-soft", round(t, 3), 0.37, 0.45) for i, t in enumerate(run_clicks)] + [
    ("pop-inj", "pop", 6.99, 0.72, 0.3), ("stamp-no", "stamp", 8.94, 0.8, 0.55), ("tape", "tapestop", 9.95, 0.85, 0.45),
    ("click-go", "click", GO, 0.37, 0.6), ("cl-tick", "click-soft", 15.62, 0.37, 0.45), ("cl-conf", "click-soft", 16.11, 0.37, 0.45),
    ("stamp-conf", "stamp", 17.34, 0.8, 0.45), ("pop-q", "pop", 19.51, 0.72, 0.25), ("pop-s", "pop", 21.34, 0.72, 0.2),
    ("pop-p", "pop", 21.78, 0.72, 0.2), ("pop-cu", "pop", 24.03, 0.72, 0.3), ("hit-5", "impact-bass-1", 34.12, 2.12, 0.45),
    ("stamp-55", "stamp", 34.65, 0.8, 0.45), ("hit-mark", "impact-bass-2", 36.7, 2.59, 0.4), ("pop-cta", "pop", 38.82, 0.72, 0.3)]


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


scenes = "\n".join(f'      <div id="{n}" class="clip" data-composition-id="{n}" data-composition-src="compositions/{n}.html" data-start="{s}" data-duration="{d}" data-track-index="1" data-track-kind="graphics" data-width="1080" data-height="1080" style="z-index: {k + 1}"></div>' for k, (n, s, d) in enumerate(SCENES))
vo = "\n".join(f'      <audio id="vo-{i}" class="clip" src="{f}" data-start="{s}" data-duration="{d:.2f}" data-track-index="{40 + k}" data-volume="1.3"></audio>' for k, (i, f, s, d) in enumerate(lines))
sfx = "\n".join(f'      <audio id="sfx-{n}" class="clip" src="assets/sfx/{f}.mp3" data-start="{s}" data-duration="{d}" data-track-index="{60 + k}" data-volume="{v}"></audio>' for k, (n, f, s, d, v) in enumerate(SFX))
music = f"""      <audio id="bgm-a" class="clip" src="assets/music/power-2.mp3" data-start="0" data-media-start="0.02" data-duration="{STOP}" data-track-index="20" data-volume="1" data-fade-out="0.1" data-automation="{lane(0, STOP, 0.07, 0.2)}"></audio>
      <audio id="bgm-hold" class="clip" src="assets/music/hold.mp3" data-start="{STOP + 0.05}" data-duration="{round(GO - STOP - 0.05, 2)}" data-track-index="21" data-volume="0.45" data-fade-in="0.3" data-fade-out="0.1"></audio>
      <audio id="bgm-b" class="clip" src="assets/music/power-2.mp3" data-start="{GO}" data-media-start="{round(GO % 30, 2)}" data-duration="{round(30 - GO % 30, 2)}" data-track-index="22" data-volume="1" data-automation="{lane(GO, GO + 30 - GO % 30, 0.07, 0.2)}"></audio>
      <audio id="bgm-c" class="clip" src="assets/music/power-2.mp3" data-start="{round(GO + 30 - GO % 30, 2)}" data-duration="{round(TOTAL - (GO + 30 - GO % 30), 2)}" data-track-index="23" data-volume="1" data-fade-out="2.0" data-automation="{lane(GO + 30 - GO % 30, TOTAL, 0.07, 0.2)}"></audio>"""

h = open("index.html").read()
a = h.index('<div id="root"'); b = h.index("    <script>")
h = h[:a] + f'''<div id="root" data-composition-id="main" data-start="0" data-duration="{TOTAL}" data-width="1080" data-height="1080">
      <!-- Square film A v3: the agent in action, an English AI voice pitching (Liam, ElevenLabs, Whisper-checked), music ducked under the voice.
           Built by tools/build_square.py. -->
{scenes}

{vo}

      <!-- Music (tools/music2.mjs, take 2): quiet under the voice, cut while the agent waits, back on the human click. -->
{music}
{sfx}
    </div>
''' + h[b:]
open("index.html", "w").write(h)
print(f"scenes {len(SCENES)}, voice {len(lines)}, voice ends {max(s + d for _, _, s, d in lines):.2f}, total {TOTAL}")
