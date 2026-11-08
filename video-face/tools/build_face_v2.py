#!/usr/bin/env python3
"""Vertical face-to-camera cut v2 (1080x1920): Kerdaxis in action above Kevin while he talks.

Run from video-face/: python3 tools/build_face_v2.py. Word times: Whisper transcript of "Vidéo Kevin v2".
Each phrase drives the panel: dashboard counts the 3 items, the 6-screen path, the trap, the stop on "yes".
"""
import json

W, H = 1080, 1920
FACE_END = 11.5
TOTAL = 20.3

WORDS = [("Kerdaxis", 0.26), ("found", 0.78), ("3", 1.39), ("subscriptions", 1.56), ("I", 2.84), ("should", 3.05),
         ("cancel,", 3.47), ("but", 4.12), ("I", 4.30), ("don't", 4.36), ("have", 4.75), ("time.", 4.91),
         ("This", 5.46), ("AI", 5.74), ("agent", 6.01), ("does", 6.69), ("it", 7.23), ("for", 7.50), ("me,", 7.90),
         ("and", 8.35), ("it", 8.61), ("stops", 8.72), ("before", 9.29), ("the", 9.31), ("final", 9.53),
         ("click", 9.95), ("until", 10.52), ("I", 10.64), ("say", 10.71), ("yes.", 10.93)]
ENDS = [w[1] for w in WORDS[1:]] + [11.4]
# groups: break after punctuation or 3 words
groups, cur = [], []
for i, (w, t) in enumerate(WORDS):
    cur.append(i)
    if len(cur) == 3 or w[-1] in ".,":
        groups.append(cur); cur = []
if cur:
    groups.append(cur)

SPLIT = 0.0  # the action panel is on screen from the first frame
PANELS = [("dashv", 0.0, 4.0), ("path", 4.0, 1.4)]  # sub-compositions inside the top panel
INSERTS = [  # (id, start, duration, media_start in the 16:9 film master)
    ("ins-trap", 5.4, 2.9, 2.9),        # "This AI agent does it for me": the trap, IGNORED at master 4.5 -> 7.0 here
    ("ins-stop", 8.3, 3.2, 9.42),       # the stop; master click 12.05 lands on "yes" (10.93)
]
PROOF = ("ins-proof", FACE_END, 4.3, 44.9)  # 5 lands at master 45.23 -> 11.83 here
END = FACE_END + 4.3

SFX = [("pop-1", "pop", 1.39, 0.72, 0.3), ("pop-2", "pop", 1.75, 0.72, 0.3), ("pop-3", "pop", 2.1, 0.72, 0.3),
       ("wh-path", "whoosh", 3.95, 0.57, 0.25), ("wh-trap", "whoosh", 5.35, 0.57, 0.2), ("stamp-ign", "stamp", 7.0, 0.8, 0.45),
       ("click-yes", "click", 10.93, 0.37, 0.6), ("wh-proof", "whoosh", 11.3, 0.57, 0.25), ("hit-5", "impact-bass-1", 11.83, 2.12, 0.35),
       ("stamp-55", "stamp", 13.01, 0.8, 0.45), ("hit-end", "impact-bass-2", END + 0.1, 2.59, 0.35), ("pop-cta", "pop", END + 2.0, 0.72, 0.3)]

cap_html, cap_js = [], []
for gi, g in enumerate(groups):
    spans = "".join(f'<span id="w{i}">{WORDS[i][0]}</span> ' for i in g).strip()
    cap_html.append(f'    <div id="cg{gi}" class="cg">{spans}</div>')
    a, b = WORDS[g[0]][1], ENDS[g[-1]]
    cap_js.append(f'      tl.set("#cg{gi}", {{ opacity: 1, visibility: "visible" }}, {a}); tl.set("#cg{gi}", {{ opacity: 0, visibility: "hidden" }}, {round(b, 3)});')
    for i in g:
        cap_js.append(f'      tl.set("#w{i}", {{ color: "#d4f53c" }}, {WORDS[i][1]}); tl.set("#w{i}", {{ color: "#ffffff" }}, {round(ENDS[i], 3)});')

open("compositions/captions.html", "w").write(f"""<template>
  <style>
    #root {{ position: absolute; inset: 0; overflow: visible; pointer-events: none; font-family: "Plus Jakarta Sans", sans-serif; }}
    .cg {{ position: absolute; left: 60px; top: 1700px; width: 960px; text-align: center; opacity: 0; visibility: hidden;
      font-weight: 800; font-size: 82px; line-height: 1.1; letter-spacing: -0.03em; color: #ffffff; white-space: nowrap;
      text-shadow: 0 4px 0 #0d0d12, 0 0 18px rgba(13, 13, 18, 0.85); }}
  </style>
  <div id="root" data-composition-id="captions" data-width="{W}" data-height="{H}">
{chr(10).join(cap_html)}
  </div>
  <script>
    (function () {{
      const tl = gsap.timeline({{ paused: true }});
{chr(10).join(cap_js)}
      tl.set({{}}, {{}}, {TOTAL});
      window.__timelines["captions"] = tl;
    }})();
  </script>
</template>
""")

panel_html = "\n".join(
    f'        <div id="pn-{n}" class="clip" data-composition-id="{n}" data-composition-src="compositions/{n}.html" data-start="{s}" data-duration="{d}" data-track-index="3" data-track-kind="graphics" data-width="{W}" data-height="820"></div>'
    for n, s, d in PANELS)
ins_html = "\n".join(
    f'        <video id="{n}" class="clip film" src="assets/media/film.mp4" data-start="{s}" data-duration="{d}" data-media-start="{m}" data-track-index="3" muted playsinline></video>'
    for n, s, d, m in INSERTS + [PROOF])
sfx_html = "\n".join(
    f'      <audio id="sfx-{n}" class="clip" src="assets/sfx/{f}.mp3" data-start="{s}" data-duration="{d}" data-track-index="{60 + i}" data-volume="{v}"></audio>'
    for i, (n, f, s, d, v) in enumerate(SFX))
lane = json.dumps({"version": 1, "lanes": [{"target": "volume", "points": [
    {"t": 0, "v": 0.1}, {"t": FACE_END - 0.2, "v": 0.1}, {"t": FACE_END + 0.3, "v": 0.42}]}]}).replace('"', "&quot;")

open("index.html", "w").write(f"""<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width={W}, height={H}" />
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.15.0/dist/gsap.min.js"></script>
    <style>
      @font-face {{ font-family: "Plus Jakarta Sans"; src: url("assets/fonts/plus-jakarta-sans-latin.woff2") format("woff2"); font-weight: 400 800; font-style: normal; }}
      @font-face {{ font-family: "Fira Code"; src: url("assets/fonts/fira-code-latin.woff2") format("woff2"); font-weight: 400 500; font-style: normal; }}
      * {{ margin: 0; padding: 0; box-sizing: border-box; }}
      html, body {{ margin: 0; width: {W}px; height: {H}px; overflow: hidden; background: #0d0d12; }}
      #root {{ position: relative; width: 100%; height: 100%; font-family: "Plus Jakarta Sans", sans-serif; color: #f4f4f8; }}
      #facebox {{ position: absolute; left: 0; top: 0; width: {W}px; height: {H}px; overflow: hidden; }}
      #face {{ position: absolute; left: 0; top: 0; width: {W}px; height: {H}px; object-fit: cover; }}
      #filmbox {{ position: absolute; left: 0; top: 0; width: {W}px; height: 820px; background: #0d0d12; overflow: hidden; }}
      .film {{ position: absolute; left: 0; top: 150px; width: {W}px; height: 608px; }}
      #tag {{ position: absolute; left: 60px; top: 66px; height: 56px; padding: 0 22px; border-radius: 28px; background: #1a1a23; border: 2px solid #2a2a36;
        font-weight: 700; font-size: 30px; line-height: 52px; white-space: nowrap; }}
      #tag i {{ display: inline-block; width: 12px; height: 12px; margin-right: 12px; border-radius: 6px; background: #d4f53c; vertical-align: 2px; }}
      #unused-brand {{ position: absolute; left: 60px; top: 80px; height: 60px; padding: 0 24px; border-radius: 30px; background: rgba(13, 13, 18, 0.9); font-family: "Fira Code", monospace; font-size: 30px; line-height: 60px; letter-spacing: 0.12em; color: #d4f53c; white-space: nowrap; }}
      #proofcap {{ position: absolute; left: 0; top: 900px; width: {W}px; text-align: center; }}
      #proofcap b {{ display: block; font-weight: 800; font-size: 66px; letter-spacing: -0.03em; line-height: 1.15; }}
      #proofcap span {{ display: block; margin-top: 18px; font-size: 38px; color: #a9a9bb; }}
      #endcard {{ position: absolute; inset: 0; background: #0d0d12; }}
      #e-mark {{ position: absolute; left: 404px; top: 560px; width: 272px; height: 272px; }}
      #e-mark svg {{ width: 272px; height: 272px; }}
      #e-word {{ position: absolute; left: 0; top: 880px; width: {W}px; text-align: center; font-weight: 800; font-size: 132px; letter-spacing: -0.045em; }}
      #e-line {{ position: absolute; left: 0; top: 1080px; width: {W}px; text-align: center; font-weight: 800; font-size: 84px; letter-spacing: -0.04em; white-space: nowrap; }}
      #e-ai {{ position: relative; z-index: 0; isolation: isolate; display: inline-block; padding: 0 10px; color: #0d0d12; }}
      #e-hl {{ position: absolute; left: 0; right: 0; bottom: -4px; height: 96px; background: #d4f53c; z-index: -1; transform-origin: 0 50%; }}
      #e-btn {{ position: absolute; left: 190px; top: 1300px; width: 700px; height: 120px; border-radius: 24px; background: #d4f53c; color: #0d0d12;
        font-weight: 800; font-size: 54px; line-height: 120px; text-align: center; }}
      #e-url {{ position: absolute; left: 0; top: 1460px; width: {W}px; text-align: center; font-size: 42px; color: #a9a9bb; }}
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="{TOTAL}" data-width="{W}" data-height="{H}">
      <!-- Built by tools/build_face.py. Kevin's iPhone take (voice kept on the video), film v4 inserts muted. -->
      <div id="facebox">
        <video id="face" class="clip" data-layout-allow-overflow src="assets/media/face2.mp4" data-start="0" data-duration="{FACE_END}" data-track-index="1" data-has-audio="true" data-volume="1" playsinline></video>
      </div>
      <div id="filmbox">
        <div id="tag" class="clip" data-start="5.4" data-duration="{round(FACE_END - 5.4, 2)}" data-track-index="5" style="z-index: 5"><i></i>H Company agent · recorded run, demo portal</div>
{panel_html}
{ins_html}
      </div>
      <div id="proofcap" class="clip" data-start="{FACE_END}" data-duration="4.3" data-track-index="6"><b>5/5 cancellations<br />confirmed by Stripe</b><span>Stripe customer portal · test mode</span></div>
      <div id="endcard" class="clip" data-start="{END}" data-duration="{round(TOTAL - END, 2)}" data-track-index="7">
        <div id="e-mark"><svg viewBox="0 0 24 24" aria-label="Kerdaxis"><defs><linearGradient id="kfs" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8fdc3c"/><stop offset="1" stop-color="#2e8b1f"/></linearGradient><linearGradient id="kfl" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2e8b1f"/><stop offset="1" stop-color="#a6e33a"/></linearGradient></defs><rect x="2.5" y="1.5" width="6.5" height="21" rx="2.2" fill="url(#kfs)"/><path d="M11.2 12.6 19.4 22.5H22L13.6 11.2z" fill="url(#kfl)"/><path d="M3.5 22.5 16.2 1.5h5.8L9.4 22.5z" fill="#d4f53c"/></svg></div>
        <div id="e-word">Kerdaxis</div>
        <div id="e-line">Let <span id="e-ai"><span id="e-hl"></span>AI</span> do the work.</div>
        <div id="e-btn">See it live, no signup</div>
        <div id="e-url">kerdaxis.com</div>
      </div>
      <div id="captions" class="clip" data-composition-id="captions" data-composition-src="compositions/captions.html" data-start="0" data-duration="{FACE_END}" data-track-index="2" data-track-kind="captions" data-width="{W}" data-height="{H}" style="z-index: 50"></div>

      <audio id="bgm" class="clip" src="assets/music/bed2-long.mp3" data-start="0" data-media-start="0.24" data-duration="{TOTAL}" data-track-index="20" data-volume="1" data-fade-in="0.4" data-fade-out="1.4" data-automation="{lane}"></audio>
{sfx_html}
    </div>
    <script>
      window.__timelines = window.__timelines || {{}};
      const tl = gsap.timeline({{ paused: true }});
      // From frame 0: Kerdaxis in action in the top panel, Kevin in the lower part of the frame.
      gsap.set("#face", {{ y: 560 }});
      // Proof: the film box takes the whole top, the face is gone (the face clip ends at {FACE_END}).
      tl.fromTo("#proofcap", {{ opacity: 0, y: 20 }}, {{ opacity: 1, y: 0, duration: 0.35, ease: "expo.out" }}, {FACE_END + 0.5});
      // End card.
      tl.fromTo("#e-mark", {{ opacity: 0, y: -240, rotation: -24, scale: 0.6, transformOrigin: "50% 50%" }}, {{ opacity: 1, y: 0, rotation: 0, scale: 1, duration: 0.5, ease: "back.out(1.4)" }}, {END + 0.1});
      tl.fromTo("#e-word", {{ opacity: 0, y: 20 }}, {{ opacity: 1, y: 0, duration: 0.35, ease: "expo.out" }}, {END + 0.4});
      tl.fromTo("#e-line", {{ opacity: 0, y: 20 }}, {{ opacity: 1, y: 0, duration: 0.35, ease: "expo.out" }}, {END + 0.9});
      gsap.set("#e-hl", {{ scaleX: 0 }});
      tl.to("#e-hl", {{ scaleX: 1, duration: 0.4, ease: "power3.out" }}, {END + 1.2});
      tl.fromTo("#e-btn", {{ opacity: 0, scale: 0.9, transformOrigin: "50% 50%" }}, {{ opacity: 1, scale: 1, duration: 0.35, ease: "back.out(1.5)" }}, {END + 2.0});
      tl.fromTo("#e-url", {{ opacity: 0 }}, {{ opacity: 1, duration: 0.3 }}, {END + 2.3});
      tl.set({{}}, {{}}, {TOTAL});
      window.__timelines["main"] = tl;
    </script>
  </body>
</html>
""")
print(f"words {len(WORDS)}, caption groups {len(groups)}, end card at {END:.2f}, total {TOTAL}")
