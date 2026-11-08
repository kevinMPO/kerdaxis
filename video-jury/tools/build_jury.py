#!/usr/bin/env python3
"""Jury cut = Kevin face-to-camera intro (Kerdaxis in action beside him) + the hackathon film shifted by OFFSET:
Act 1 (business, video-yc v2) + UNDER THE HOOD + Act 2 (technical, video-arch v3, LLM node = H Company Holo).

Writes index.html and compositions/captions.html. Run from video-jury/: python3 tools/build_jury.py
The voice is the clock; scene starts are fixed here. The H Company execution appears once.
"""
import json, re, subprocess

OFFSET = 11.5  # Kevin intro
SCENES0 = [
    # Act 1 — business (video-yc v2)
    ("result", 0.0, 4.6), ("market", 4.6, 5.85), ("analyze", 10.45, 5.3), ("detect", 15.75, 3.85),
    ("compare", 19.6, 2.7), ("recommend", 22.3, 4.3), ("approve", 26.6, 3.0),
    # Bridge
    ("bridge", 29.6, 2.3),
    # Act 2 — technical (video-arch v3)
    ("connect", 31.9, 6.3), ("orchestrate", 38.2, 9.3), ("navigate", 47.5, 6.0), ("stop", 53.5, 5.0),
    ("prove", 58.5, 4.0), ("services", 62.5, 7.6), ("finale", 70.1, 5.5),
]
SCENES = [(n, round(s + OFFSET, 3), d) for n, s, d in SCENES0]
TOTAL = round(75.6 + OFFSET, 3)

# (id, file, start, caption) — captions are the script, digits for numbers.
VO0 = [
    ("a01", "act1/vo-01", 0.3, "Our AI agent just cancelled a SaaS subscription. In 45 seconds."),
    ("a02", "act1/vo-02", 4.7, "33 million businesses in the EU. Most can't afford a full-time CFO."),
    ("a03", "act1/vo-03", 10.5, "Kerdaxis is their AI CFO. A deterministic engine reads every transaction."),
    ("a04", "act1/vo-04", 15.8, "It detects waste: unused tools, duplicates, price rises."),
    ("a05", "act1/vo-05", 19.65, "It compares alternatives on the web, with Linkup."),
    ("a06", "act1/vo-06", 22.35, "Then it recommends: cancel, downgrade, switch, or renegotiate."),
    ("a07", "act1/vo-07", 26.65, "Nuvio CRM: unused. You approve."),
    ("b02", "act2/vo-02", 31.95, "Kerdaxis connects through MCP and APIs, and can use H Company's computer use when software has no integration."),
    ("b03", "act2/vo-03", 38.25, "Mastra orchestrates agents and tools. Our deterministic engine calculates every euro, while the agent harness controls execution, permissions and evidence."),
    ("b05a", "act2/vo-05a", 47.8, "H Company's agent executes inside a real interface, ignores malicious page instructions,"),
    ("b05b", "act2/vo-05b", 53.6, "and stops before the irreversible click until a human approves."),
    ("b06", "act2/vo-06", 58.6, "The supplier confirms. Kerdaxis records the proof and schedules the bank check."),
    ("b07", "act2/vo-07", 62.6, "Services as Software: accounting firms distribute it, Forward Deployed Engineers adapt it, and SMEs get the work done."),
]

VO = [(i, f, round(s + OFFSET, 3), c) for i, f, s, c in VO0]
S1 = 25.9   # v3 → merged shift for connect/orchestrate (v3 connect 5.7 → 31.6)… adjusted below per scene
SFX0 = [
    # Act 1 (video-yc v2 times)
    ("hit-stamp", "stamp", 0.44, 0.8, 0.7), ("hit-count", "pop", 3.43, 0.72, 0.35), ("wh-market", "whoosh-short", 4.45, 0.57, 0.25),
    ("hit-33", "impact-bass-1", 4.62, 2.12, 0.25), ("wh-flood1", "whoosh-short", 9.95, 0.57, 0.25),
    ("hit-analyze", "impact-bass-1", 10.4, 2.12, 0.2), ("tick-a1", "click-soft", 10.85, 0.37, 0.3), ("tick-a2", "click-soft", 11.25, 0.37, 0.3),
    ("pop-rule", "pop", 12.8, 0.72, 0.3), ("wh-left", "whoosh", 15.42, 0.57, 0.3),
    ("pop-d0", "pop", 16.0, 0.72, 0.3), ("pop-d1", "click-soft", 17.05, 0.37, 0.35), ("pop-d3", "pop", 18.15, 0.72, 0.25),
    ("pop-d4", "click-soft", 18.65, 0.37, 0.3), ("wh-detect", "whoosh-short", 19.3, 0.57, 0.25),
    ("hit-compare", "stamp", 19.52, 0.8, 0.4), ("pop-c", "pop", 20.05, 0.72, 0.25), ("wh-comp", "whoosh-short", 22.6, 0.57, 0.25),
    ("hit-rec", "impact-bass-1", 22.26, 2.12, 0.2), ("pop-r0", "pop", 22.73, 0.72, 0.3), ("pop-r1", "click-soft", 23.18, 0.37, 0.35),
    ("pop-r2", "pop", 23.63, 0.72, 0.3), ("pop-r3", "click-soft", 24.08, 0.37, 0.35), ("wh-zoom", "whoosh", 26.05, 0.57, 0.3),
    ("hit-approve", "stamp", 26.52, 0.8, 0.45), ("click-ok", "click", 28.89, 0.37, 0.6),
    # Bridge
    ("tapestop", "tapestop", 29.0, 0.85, 0.5), ("wh-bridge", "whoosh", 29.55, 0.57, 0.3), ("hit-hood", "impact-bass-1", 29.92, 2.12, 0.35),
    # Act 2 — connect / orchestrate (v3 times + 26.2)
    ("pop-q", "pop", 32.8, 0.72, 0.25), ("pop-ui", "pop", 34.6, 0.72, 0.22), ("wh-orch", "whoosh-short", 38.05, 0.57, 0.22),
    ("hit-mastra", "impact-bass-1", 38.2, 2.12, 0.18), ("pop-eng", "pop", 40.35, 0.72, 0.25), ("pop-calc", "click-soft", 41.55, 0.37, 0.3),
    ("pop-hco", "pop", 43.15, 0.72, 0.25), ("pop-pol", "click-soft", 44.25, 0.37, 0.3), ("pop-hum", "pop", 44.85, 0.72, 0.25),
    ("pop-led", "click-soft", 46.05, 0.37, 0.3),
    # Execute (navigate local x1.11 + 47.5, stop + 53.5)
    ("wh-iris", "whoosh-short", 47.4, 0.57, 0.22), ("click-n1", "click-soft", 48.37, 0.37, 0.45), ("click-n2", "click-soft", 49.0, 0.37, 0.45),
    ("wh-push", "whoosh", 49.33, 0.57, 0.2), ("pop-inj", "pop", 50.7, 0.72, 0.3), ("hit-ignored", "stamp", 52.28, 0.8, 0.65),
    ("click-n3", "click-soft", 52.89, 0.37, 0.45), ("wh-dip", "whoosh-short", 53.17, 0.57, 0.22),
    ("heart", "heartbeat", 53.85, 3.0, 0.8), ("click-go", "click", 56.31, 0.37, 0.6),
    # Prove / services / finale (v3 times + 23.2)
    ("pop-box", "pop", 58.55, 0.72, 0.3), ("wh-carry", "whoosh", 59.0, 0.57, 0.22),
    ("tick-1", "click-soft", 59.43, 0.37, 0.35), ("tick-2", "pop", 59.68, 0.72, 0.25), ("tick-3", "click-soft", 59.93, 0.37, 0.35),
    ("tick-4", "pop", 60.18, 0.72, 0.25), ("key-d30", "key-press", 60.63, 0.4, 0.55),
    ("wh-serv", "whoosh-short", 62.3, 0.57, 0.22), ("pop-firm", "pop", 64.2, 0.72, 0.22), ("pop-fde", "pop", 65.9, 0.72, 0.22),
    ("pop-sme", "pop", 68.2, 0.72, 0.22), ("riser", "riser", 66.73, 3.6, 0.15), ("hit-mark", "impact-bass-1", 70.58, 2.12, 0.35),
    ("pop-cta", "pop", 70.68, 0.72, 0.25),
]

SFX = [(n, f, round(s + OFFSET, 3), d, v) for n, f, s, d, v in SFX0] + [
    ("pop-1", "pop", 1.39, 0.72, 0.3), ("pop-2", "pop", 1.75, 0.72, 0.3), ("pop-3", "pop", 2.1, 0.72, 0.3),
    ("wh-path", "whoosh", 3.95, 0.57, 0.25), ("wh-trap", "whoosh", 5.35, 0.57, 0.2), ("stamp-ign", "stamp", 7.0, 0.8, 0.45),
    ("click-yes", "click", 10.93, 0.37, 0.6), ("wh-act1", "whoosh", 11.35, 0.57, 0.3)]
ACT2 = dict((n, s) for n, s, _ in SCENES)["connect"]
STOP = dict((n, s) for n, s, _ in SCENES)["stop"]
PROVE = dict((n, s) for n, s, _ in SCENES)["prove"]


def dur(path):
    return float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path]))


lines = [(i, f"assets/voice/{f}.mp3", s, dur(f"assets/voice/{f}.mp3"), c) for i, f, s, c in VO]
for a, b in zip(lines, lines[1:]):
    assert a[2] + a[3] < b[2], f"voice {a[0]} overlaps {b[0]}"
for (_, s1, d1), (_, s2, _) in zip(SCENES, SCENES[1:]):
    assert abs(s1 + d1 - s2) < 1e-6, "scenes must be contiguous"
assert abs(SCENES[-1][1] + SCENES[-1][2] - TOTAL) < 1e-6
segs = [(0.26, 11.2)] + [(s, s + d) for _, _, s, d, _ in lines]


def lane(c0, c1, lo, hi, r=0.15):
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


# captions: Kevin's words first (Whisper times of "Vidéo Kevin v2"), then the script lines
FACE_WORDS = [("Kerdaxis", 0.26), ("found", 0.78), ("3", 1.39), ("subscriptions", 1.56), ("I", 2.84), ("should", 3.05),
    ("cancel,", 3.47), ("but", 4.12), ("I", 4.30), ("don't", 4.36), ("have", 4.75), ("time.", 4.91), ("This", 5.46), ("AI", 5.74),
    ("agent", 6.01), ("does", 6.69), ("it", 7.23), ("for", 7.50), ("me,", 7.90), ("and", 8.35), ("it", 8.61), ("stops", 8.72),
    ("before", 9.29), ("the", 9.31), ("final", 9.53), ("click", 9.95), ("until", 10.52), ("I", 10.64), ("say", 10.71), ("yes.", 10.93)]
FACE_ENDS = [w[1] for w in FACE_WORDS[1:]] + [11.4]
groups, cur = [], []
for i, (w, t) in enumerate(FACE_WORDS):
    cur.append(i)
    if len(cur) == 3 or w[-1] in ".,":
        groups.append((" ".join(FACE_WORDS[j][0] for j in cur), FACE_WORDS[cur[0]][1], round(FACE_ENDS[cur[-1]], 3))); cur = []
for _, _, start, d, text in lines:
    words, chunks, cur = text.split(), [], []
    for w in words:
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
cap_html = "\n".join(f'    <div id="cg{i}" class="cg"><span>{g}</span></div>' for i, (g, a, b) in enumerate(groups))
cap_js = "\n".join(f'      tl.set("#cg{i}", {{ opacity: 1, visibility: "visible" }}, {a}); tl.set("#cg{i}", {{ opacity: 0, visibility: "hidden" }}, {b});'
                   for i, (g, a, b) in enumerate(groups))
open("compositions/captions.html", "w").write(f"""<template>
  <style>
    #root {{ position: absolute; inset: 0; overflow: visible; pointer-events: none; font-family: "Inter", sans-serif; }}
    .cg {{ position: absolute; left: 0; top: 896px; width: 1920px; text-align: center; opacity: 0; visibility: hidden; }}
    .cg span {{ display: inline-block; padding: 8px 24px; border-radius: 14px; background: rgba(8, 13, 19, 0.86); color: #ffffff;
      font-weight: 700; font-size: 44px; line-height: 56px; letter-spacing: -0.01em; white-space: nowrap; }}
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

scene_html = "\n".join(
    f'      <div id="{n}" class="clip" data-composition-id="{n}" data-composition-src="compositions/{n}.html" data-start="{s}" data-duration="{d}" '
    f'data-track-index="1" data-track-kind="graphics" data-width="1920" data-height="1080" style="z-index: {i + 1}"></div>'
    for i, (n, s, d) in enumerate(SCENES))
vo_html = "\n".join(
    f'      <audio id="vo-{i}" class="clip" src="{f}" data-start="{s}" data-duration="{d:.2f}" data-track-index="{40 + k}" data-volume="1.4"></audio>'
    for k, (i, f, s, d, _) in enumerate(lines))
music = f"""      <audio id="bgm-intro" class="clip" src="assets/music/elegant-long.mp3" data-start="0" data-duration="{OFFSET}" data-track-index="19" data-volume="1" data-fade-in="0.3" data-fade-out="0.3" data-automation="{lane(0, OFFSET, 0.09, 0.2)}"></audio>
      <audio id="bgm-act1" class="clip" src="assets/music/bed2-long.mp3" data-start="{OFFSET}" data-media-start="0.24" data-duration="29.85" data-track-index="20" data-volume="1" data-fade-out="0.4" data-automation="{lane(OFFSET, OFFSET + 29.85, 0.2, 0.42)}"></audio>
      <audio id="bgm-act2a" class="clip" src="assets/music/elegant-long.mp3" data-start="{ACT2 - 0.3}" data-duration="{round(STOP + 0.05 - ACT2 + 0.3, 3)}" data-track-index="21" data-volume="1" data-fade-in="0.6" data-fade-out="0.2" data-automation="{lane(ACT2 - 0.3, STOP + 0.05, 0.16, 0.34)}"></audio>
      <audio id="bgm-hold" class="clip" src="assets/music/hold.mp3" data-start="{STOP}" data-duration="5.0" data-track-index="22" data-volume="1.0" data-fade-in="0.1" data-fade-out="0.25"></audio>
      <audio id="bgm-act2b" class="clip" src="assets/music/elegant-long.mp3" data-start="{PROVE}" data-media-start="{round(PROVE - ACT2 + 0.3, 3)}" data-duration="{round(TOTAL - PROVE, 3)}" data-track-index="23" data-volume="1" data-fade-out="1.5" data-automation="{lane(PROVE, TOTAL, 0.16, 0.34)}"></audio>"""
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
      #intro {{ position: absolute; inset: 0; background: #0d0d12; overflow: hidden; }}
      #i-face {{ position: absolute; left: 0; top: 0; width: 640px; height: 1080px; object-fit: cover; }}
      .i-panel {{ position: absolute; left: 650px; top: 70px; transform: scale(1.17); transform-origin: 0 0; }}
      .i-film {{ position: absolute; left: 640px; top: 180px; width: 1280px; height: 720px; }}
      #i-tag {{ position: absolute; left: 680px; top: 76px; height: 58px; padding: 0 22px; border-radius: 29px; background: #1a1a23; border: 2px solid #2a2a36;
        color: #f4f4f8; font-family: "Plus Jakarta Sans", sans-serif; font-weight: 700; font-size: 28px; line-height: 54px; white-space: nowrap; }}
      #i-tag i {{ display: inline-block; width: 12px; height: 12px; margin-right: 12px; border-radius: 6px; background: #d4f53c; vertical-align: 2px; }}
      :root {{ --ground: #080d13; --ink: #eef8f5; --lime: #b4f768; --font-display: "Inter", sans-serif; }}
      * {{ margin: 0; padding: 0; box-sizing: border-box; }}
      html, body {{ margin: 0; width: 1920px; height: 1080px; overflow: hidden; background: var(--ground); }}
      #root {{ position: relative; width: 100%; height: 100%; font-family: var(--font-display); }}
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="{TOTAL}" data-width="1920" data-height="1080">
      <!-- Jury cut: Kevin intro (0-{OFFSET} s), then the hackathon cut: Act 1 business (video-yc v2) + UNDER THE HOOD + Act 2 technical (video-arch v3). Built by tools/build_hack.py. -->
      <!-- Intro: Kevin's take (iPhone, voice on the video) left; Kerdaxis in action right, driven by his words. -->
      <div id="intro">
        <video id="i-face" class="clip" src="assets/media/face2.mp4" data-start="0" data-duration="{OFFSET}" data-track-index="5" data-has-audio="true" data-volume="1" playsinline></video>
        <div id="pn-dashv" class="clip i-panel" data-composition-id="dashv" data-composition-src="compositions/dashv.html" data-start="0" data-duration="4.0" data-track-index="6" data-track-kind="graphics" data-width="1080" data-height="820"></div>
        <div id="pn-path" class="clip i-panel" data-composition-id="path" data-composition-src="compositions/path.html" data-start="4.0" data-duration="1.4" data-track-index="6" data-track-kind="graphics" data-width="1080" data-height="820"></div>
        <video id="i-trap" class="clip i-film" src="assets/media/film.mp4" data-start="5.4" data-duration="2.9" data-media-start="2.9" data-track-index="7" muted playsinline></video>
        <video id="i-stop" class="clip i-film" src="assets/media/film.mp4" data-start="8.3" data-duration="3.2" data-media-start="9.42" data-track-index="7" muted playsinline></video>
        <div id="i-tag" class="clip" data-start="8.3" data-duration="3.2" data-track-index="8"><i></i>H Company agent · recorded run, demo portal</div>
      </div>
{scene_html}
      <div id="captions" class="clip" data-composition-id="captions" data-composition-src="compositions/captions.html" data-start="0" data-duration="{TOTAL}" data-track-index="2" data-track-kind="captions" data-width="1920" data-height="1080" style="z-index: 50"></div>

      <!-- Voice: AI voice "Liam" (ElevenLabs eleven_v3), lines Whisper-checked; act-2 line 5 split at "and stops". -->
{vo_html}

      <!-- Music: act 1 energetic 120 BPM loop, act 2 elegant 100 BPM loop, held pad over the human gate; ducked under the voice. -->
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
