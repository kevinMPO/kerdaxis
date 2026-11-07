# REVIEW — v3 technical architecture film

- `check`: 0 errors. Warnings kept: streaming demo transactions (motion texture, not reading text) and
  the closing-line hold, which the checker reports below 2 s although snapshots show the full end card
  readable from ~47.3 s to 49.9 s (2.6 s); the figure shrinks when the card is brought forward, so it
  is a measurement artefact.
- Snapshots read for every scene; fixed: overlapping chips/titles (connect, market), node text clipped,
  PROVE title under the ledger card, engine chips replaced by a subtitle swap, all type ≥ 28 px.
- Voice: each line regenerated until Whisper heard the complete line (line 6 took 4 tries for the
  brand). Final-mix transcript matches the script word for word; "Kerdaxis" heard correctly.
  Line starts measured in the mix: 0.00 / 6.23 / 11.90 / 21.57 / 27.02 / 35.74 / 39.00 s.
- Sound: −14.3 LUFS, peak −1.3 dB. Measured, not heard.
