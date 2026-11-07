#!/usr/bin/env node
// ElevenLabs voiceover + music for the Kerdaxis film.
// Key: ELEVENLABS_API_KEY (env only, never written to disk).
// Voice: ELEVENLABS_VOICE_ID (default "Brian", calm confident narrator).
//
//   node tools/elevenlabs-vo.mjs voice          # all lines → assets/voice/eleven/vo-XX.mp3 + lines.json
//   node tools/elevenlabs-vo.mjs voice 05 10    # only some lines
//   node tools/elevenlabs-vo.mjs music          # → assets/music/bgm.mp3
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
// Also reads video/.env.local (gitignored): ELEVENLABS_API_KEY=...
const envFile = join(ROOT, ".env.local");
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
const KEY = process.env.ELEVENLABS_API_KEY;
if (!KEY) {
  console.error("ELEVENLABS_API_KEY is not set.");
  process.exit(2);
}
const VOICE = process.env.ELEVENLABS_VOICE_ID || "nPczCjzI2devNBz1zQrb"; // Brian
const MODEL = process.env.ELEVENLABS_MODEL || "eleven_multilingual_v2";
const API = "https://api.elevenlabs.io/v1";

// Script v7 (VOICEOVER.md). `speed` is ElevenLabs' 0.7–1.2 range.
export const LINES = [
  { id: "01", text: "A supplier page told our agent to accept the offer... It didn't." },
  { id: "02", text: "Kerdaxis reads your money stack. Today: Qonto, read-only. Sage and Pennylane are next." },
  { id: "03", text: "A deterministic engine counts every euro. The AI only labels." },
  { id: "04", text: "Nuvio CRM: nobody has logged in for ninety days. You approve the cancellation." },
  { id: "05", text: "Then a real H Company agent opens the supplier's site, and clicks for you. The page tries to hijack it... Ignored." },
  { id: "06", text: "Before the one click you can't undo, it stops. And waits for you." },
  { id: "07", text: "Cancellation confirmed, by the supplier itself. Kerdaxis keeps the proof, and checks your bank statement thirty days later." },
  { id: "08", text: "The whole run: about forty-five seconds. Under three cents." },
  { id: "09", text: "Built for accounting firms, under your own brand." },
  { id: "10", text: "Your workflow? Our Forward Deployed Engineers adapt H Company's computer-use to it." },
  { id: "11", text: "Kerdaxis dot com." },
];

const SPEED = Object.fromEntries(
  (process.env.VO_SPEED || "").split(",").filter(Boolean).map((p) => p.split("=")),
);

async function post(path, body) {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "xi-api-key": KEY, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = (await res.text()).slice(0, 400);
    throw new Error(`ElevenLabs ${res.status} ${path.split("?")[0]}: ${t}`);
  }
  return res;
}

async function voice(only) {
  const out = join(ROOT, "assets/voice/eleven");
  mkdirSync(out, { recursive: true });
  const metaPath = join(out, "lines.json");
  const meta = existsSync(metaPath) ? JSON.parse(readFileSync(metaPath, "utf8")) : {};
  for (let i = 0; i < LINES.length; i++) {
    const l = LINES[i];
    if (only.length && !only.includes(l.id)) continue;
    const speed = Number(SPEED[l.id] ?? process.env.VO_SPEED_ALL ?? 1.0);
    const res = await post(`/text-to-speech/${VOICE}/with-timestamps?output_format=mp3_44100_128`, {
      text: l.text,
      model_id: MODEL,
      previous_text: LINES[i - 1]?.text,
      next_text: LINES[i + 1]?.text,
      voice_settings: { stability: 0.5, similarity_boost: 0.8, style: 0.25, use_speaker_boost: true, speed },
    });
    const j = await res.json();
    writeFileSync(join(out, `vo-${l.id}.mp3`), Buffer.from(j.audio_base64, "base64"));
    const a = j.alignment;
    const end = a.character_end_times_seconds.at(-1);
    meta[l.id] = { text: l.text, speed, speech_end_s: end, alignment: a };
    console.log(`vo-${l.id}  ${end.toFixed(2)} s  (speed ${speed})  ${l.text}`);
  }
  writeFileSync(metaPath, JSON.stringify(meta, null, 1));
}

async function music() {
  const out = join(ROOT, "assets/music");
  mkdirSync(out, { recursive: true });
  const prompt =
    process.env.MUSIC_PROMPT ||
    "Instrumental only, no vocals. Modern minimal tech product film score, 100 BPM. " +
      "Opens tense and sparse: muted pulsing synth bass and soft ticking hi-hats. " +
      "Builds steadily with a warm arpeggiated synth and light percussion, confident and focused, never aggressive. " +
      "Around the middle, the beat drops out to a held suspended pad for a few seconds (a moment of waiting), " +
      "then resolves into a bright, optimistic, uplifting groove with a clean piano motif. " +
      "Ends on a clear final chord with a short natural tail. Clean mix, leaves room for a voiceover.";
  const res = await post(`/music?output_format=mp3_44100_128`, {
    prompt,
    music_length_ms: Number(process.env.MUSIC_MS || 70000),
    model_id: "music_v1",
  });
  writeFileSync(join(out, "bgm.mp3"), Buffer.from(await res.arrayBuffer()));
  writeFileSync(join(out, "bgm.prompt.txt"), prompt + "\n");
  console.log("music → assets/music/bgm.mp3");
}

const [cmd, ...rest] = process.argv.slice(2);
if (cmd === "voice") await voice(rest);
else if (cmd === "music") await music();
else {
  console.error("usage: elevenlabs-vo.mjs voice [ids…] | music");
  process.exit(1);
}
