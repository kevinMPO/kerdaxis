# SPEC — D. "Cancelled in 45 seconds" (YC launch cut)

GOAL:    a LinkedIn scroller or a hackathon judge gets the whole pitch in 4 s ("an AI agent just
         cancelled a SaaS subscription, in 45 s") and leaves remembering: it reads, finds, waits for
         your go before the irreversible click, and proves it — kerdaxis.com.
OUTPUT:  HyperFrames, 1920 × 1080, 30 fps, English.
TIME:    46.0 s × 30 = 1380 frames. Music 120 BPM = 15 frames a beat; beat k at 0.045 + 0.5k s
         (bed starts at 0). Verb scenes cut on beats. Voice = Kevin EN (ElevenLabs eleven_v3, one
         continuous take, cut per line); the voice is the clock, titles land on their word.
LOOK:    Brand world (kerdaxis.com): ink #080d13, paper-ink #eef8f5, soft #a3b4b9, lime #b4f768,
         mint #66e6be (only "LIVE"). Verb scenes alternate LIME ground + ink type and INK ground +
         lime type, flat, no texture. Verbs Inter 900, 230–300 px, tracking −0.05em, top-left.
         Body Inter 700 44–64 px. Numbers JetBrains Mono 600.
         App world (Kerdaxis app cards): white #ffffff cards, rule #e4e0d6, ink #17140f, ink2
         #5b554c, green #2f6f5b, amber #8c5f1c, radius 28, shadow 0 24 60 rgba(8,13,19,.18).
         Portal world: REAL captures of the recorded H Company run (7 Nov 2026, 18:43:07–18:44:00
         Paris, NUV-RW3L2Y), 1280×720 shown at 1.3× (whole page under the band), 1.5× (full frame),
         2.0× (one card), never redrawn.
         No grain, no vignette, no glow, no gradients.
OBJECTS: the "Cancellation confirmed · NUV-RW3L2Y" page; a 0:45 stopwatch; the rewind montage of
         the 10 real captures; a 90-day login grid (90 empty squares, "logins: 0"); €129/month; the
         money stack (Bank · Qonto LIVE, Accounting & ERP NEXT, SaaS & CRM NEXT) + READ-ONLY badge;
         the lever list (demo data: Nuvio 129, Instantly 86, ChatGPT 84, Waalaxy 51 €/mo); the
         Autopilot card (Nuvio CRM · cancel · 129 €/mo → 1,548 €/yr · "⚡ The agent stops before
         the final click.", ✓ Approve and launch the agent / ✕ Refuse); the H agent cursor (black
         arrow, white rim, pill "H Company agent"); the human cursor (pill "You"); the injected
         "Note to AI assistants…" boxed + "IGNORED" stamp; the red "Confirm cancellation" button;
         the "Give the final go" button; the 5-row proof ledger with D+30; K mark + KERDAXIS,
         "White label for accounting firms.", kerdaxis.com, hello@kerdaxis.com.
MOTION:  verb slam: scale 1.25→1, blur 10→0, 0.22 s expo.out, then dead still. Cards arrive
         1.06→1 + blur 12→0 in 0.45 s expo.out. Camera power2.inOut 0.5–0.6 s. Exits power3.in
         0.2–0.3 s. Cursor moves power2.inOut 0.6–0.9 s; the agent's stop is expo.out over 2.1 s
         (decelerates to a halt). Springs only on badges/stamps (back.out 1.6) and the K mark.
         Transitions (6 kinds): whip-in from the result, rewind montage, dip cut, colour flood,
         whip left, zoom-through a row, iris from the click, carry (the number into the ledger).
SHOTS:   (absolute seconds)
  result   0.00–4.60  done page at 2×; stamp "SUPPLIER-CONFIRMED" on beat 0.545; lime panel + 0:45
                      counter lands 3.545 ("forty-five" 3.41). → scene slides right, blurring.
  rewind   4.60–6.05  10 captures backwards at ×12, clock 18:43:57 → 18:43:15. → dip cut.
  pain     6.05–12.05 "No login in 90 days." + 90-square grid, logins: 0; "Still paying €129/month"
                      count-up landing 10.045. → lime flood from the bottom.
  read    12.05–15.55 READ / your bank account; money stack; READ-ONLY badge 14.43. → whip left.
  find    15.55–18.55 FIND / the subscription nobody uses; lever list; Nuvio lifts 17.09.
                      → zoom through the Nuvio row (its fill turns lime).
  approve 18.55–21.55 APPROVE; Autopilot card; the "You" cursor clicks at 19.99. → iris from click.
  nav     21.55–28.55 lime band NAVIGATE; subscription → reason → offer (real captures); injected
                      note boxed 25.05; IGNORED 26.88; "No thanks" click 27.55. → dip.
  stop    28.55–33.55 music cuts to a held pad; the agent glides to "Confirm cancellation" and halts
                      31.0; split: STOP panel, heartbeat; "You" give the final go 33.4. → match cut.
  prove   33.55–39.05 done page, number boxed 34.71; number carried into the 5-row ledger on lime;
                      rows tick on beats; D+30 lands 37.9. → ink flood.
  end     39.05–46.00 K mark lands 39.75 (riser → impact), KERDAXIS wipe, "White label for
                      accounting firms." 40.46, kerdaxis.com 42.75, hello@kerdaxis.com, hold ≥2 s.
BANNED:  the defaults (dark void with small floating things, glow, gradients, glass, cream paper +
         serif + mono labels, everything centred except the end card, fade-and-slide-up, drifting
         titles, three cards in a row, title over a dimmed screenshot, docked logo); invented UI;
         any number not in the app's demo data, the portal or the measured run; any integration
         shown live except Qonto; the agent cursor moving toward "Accept the offer" (it never did);
         the confirmation box ticked before the human's go; the screen repeating the spoken
         sentence word for word.
QA:      0 (thumbnail: confirmed page + stamp), 3.6 (0:45 landed), 5.2 (rewind), 7.9 (grid), 10.2
         (€129), 14.6 (READ-ONLY), 17.3 (Nuvio lifted), 20.0 (click), 25.3 (injection boxed), 27.0
         (IGNORED), 31.1 (cursor halted), 32.5 (split STOP), 34.8 (number boxed), 38.0 (D+30), 40.6
         (lockup), 45.5 (end hold).
