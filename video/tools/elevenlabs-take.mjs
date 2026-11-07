#!/usr/bin/env node
// One continuous ElevenLabs take of the whole script, then cut per line using
// the character timestamps. A single read keeps intonation flowing from line to
// line (11 separate calls sound like 11 cold starts, i.e. "robotic").
//
//   node tools/elevenlabs-take.mjs           → assets/voice/<OUT>/vo-XX.mp3 + take.mp3 + lines.json
//   node tools/elevenlabs-take.mjs bed       → assets/music/bed-loop.mp3 (sound-generation loop)
//
// Env: ELEVENLABS_API_KEY (or video/.env.local), ELEVENLABS_VOICE_ID,
//      ELEVENLABS_MODEL (default eleven_v3), STABILITY (v3: 0 | 0.5 | 1), OUT.
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { LINES } from "./lines.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const envFile = join(ROOT, ".env.local");
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
const KEY = process.env.ELEVENLABS_API_KEY;
if (!KEY) throw new Error("ELEVENLABS_API_KEY is not set");
const API = "https://api.elevenlabs.io/v1";

async function post(path, body) {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "xi-api-key": KEY, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`ElevenLabs ${res.status} ${path.split("?")[0]}: ${(await res.text()).slice(0, 400)}`);
  return res;
}

async function take() {
  const voice = process.env.ELEVENLABS_VOICE_ID || "Y9Apbk2QHfCgA6Y4Z3Zo"; // Kevin EN
  const model = process.env.ELEVENLABS_MODEL || "eleven_v3";
  const out = join(ROOT, "assets/voice", process.env.OUT || "kevin-v3");
  mkdirSync(out, { recursive: true });

  // Lines separated by blank lines: the model breathes between them.
  const SEP = "\n\n";
  const text = LINES.map((l) => l.v3 ?? l.text).join(SEP);
  const res = await post(`/text-to-speech/${voice}/with-timestamps?output_format=mp3_44100_128`, {
    text,
    model_id: model,
    voice_settings: {
      stability: Number(process.env.STABILITY ?? 0.5),
      similarity_boost: 0.85,
      ...(model === "eleven_v3" ? {} : { style: 0.35, use_speaker_boost: true }),
    },
  });
  const j = await res.json();
  const takePath = join(out, "take.mp3");
  writeFileSync(takePath, Buffer.from(j.audio_base64, "base64"));
  const a = j.alignment;
  const chars = a.characters.join("");

  // Locate each line in the aligned text, cut from its first character to its
  // last, with a little air on both sides.
  const meta = {};
  let cursor = 0;
  for (const l of LINES) {
    const t = l.v3 ?? l.text;
    const i = chars.indexOf(t, cursor);
    if (i < 0) throw new Error(`line ${l.id} not found in alignment`);
    const j2 = i + t.length - 1;
    cursor = j2 + 1;
    const start = Math.max(0, a.character_start_times_seconds[i] - 0.06);
    const end = a.character_end_times_seconds[j2] + 0.12;
    const file = join(out, `vo-${l.id}.mp3`);
    execFileSync("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-y", "-i", takePath,
      "-ss", start.toFixed(3), "-to", end.toFixed(3),
      "-af", "afade=t=in:d=0.02,areverse,afade=t=in:d=0.06,areverse",
      "-c:a", "libmp3lame", "-b:a", "192k", file,
    ]);
    // Word timings relative to the cut, for syncing beats.
    const rel = [];
    for (let k = i; k <= j2; k++) rel.push(a.character_start_times_seconds[k] - start);
    meta[l.id] = { text: t, duration_s: end - start, char_starts: rel };
    console.log(`vo-${l.id}  ${(end - start).toFixed(2)} s  ${t}`);
  }
  writeFileSync(join(out, "lines.json"), JSON.stringify({ voice, model, lines: meta }, null, 1));
}

async function bed() {
  const out = join(ROOT, "assets/music");
  mkdirSync(out, { recursive: true });
  const prompt =
    process.env.BED_PROMPT ||
    "Seamless loop of a soft modern tech background music bed, 100 BPM: warm muted synth pad, gentle plucked arpeggio, light soft kick and shaker, calm, confident, optimistic, no melody lead, no vocals";
  const res = await post(`/sound-generation?output_format=mp3_44100_128`, {
    text: prompt,
    duration_seconds: Number(process.env.BED_SECONDS || 22),
    prompt_influence: 0.6,
    loop: true,
  });
  writeFileSync(join(out, "bed-loop.mp3"), Buffer.from(await res.arrayBuffer()));
  writeFileSync(join(out, "bed-loop.prompt.txt"), prompt + "\n");
  console.log("bed → assets/music/bed-loop.mp3");
}

const cmd = process.argv[2];
if (cmd === "bed") await bed();
else await take();
