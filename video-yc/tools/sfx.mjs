// ElevenLabs sound-generation: the music bed loop and two custom effects.
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const env = join(ROOT, ".env.local");
if (existsSync(env)) for (const l of readFileSync(env, "utf8").split("\n")) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const JOBS = {
  bed2: { out: "assets/music/bed2-120.mp3", seconds: 30, loop: true, influence: 0.75,
    text: "Seamless loop, high-energy tech startup launch anthem, exactly 120 BPM, punchy sidechained four-on-the-floor kick, crisp claps and open hi-hats, driving distorted sub bass, bright catchy synth lead hook, euphoric supersaw chords, modern EDM pop production, polished, loud, confident, instrumental, no vocals" },
  tapestop: { out: "assets/sfx/tapestop.mp3", seconds: 1.2, loop: false, influence: 0.8,
    text: "Music tape stop effect, a beat slowing down abruptly to silence, pitch dropping" },
  build: { out: "assets/sfx/build.mp3", seconds: 2.5, loop: false, influence: 0.8,
    text: "Short EDM snare roll build-up with rising white noise sweep, accelerating, ending abruptly, no drop" },
  drophit: { out: "assets/sfx/drophit.mp3", seconds: 1.5, loop: false, influence: 0.8,
    text: "Huge cinematic EDM drop impact, deep sub boom and crash cymbal, punchy" },
  bed: { out: "assets/music/bed-120.mp3", seconds: 16, loop: true, influence: 0.7,
    text: "Seamless loop, upbeat modern tech startup launch music, exactly 120 BPM, punchy four-on-the-floor kick, tight claps on 2 and 4, bright plucky synth arpeggio, deep warm sub bass, energetic and confident, instrumental, no vocals" },
  hold: { out: "assets/music/hold.mp3", seconds: 5, loop: false, influence: 0.6,
    text: "Tense held synth pad note, suspended, quiet, cinematic, no drums, slowly fading" },
  heartbeat: { out: "assets/sfx/heartbeat.mp3", seconds: 3, loop: false, influence: 0.8,
    text: "Two deep slow human heartbeats, close, cinematic, clean, no music" },
  rewind: { out: "assets/sfx/rewind.mp3", seconds: 1.6, loop: false, influence: 0.8,
    text: "Fast VHS tape rewind sound, high pitched whirring sweep, short" },
  stamp: { out: "assets/sfx/stamp.mp3", seconds: 0.8, loop: false, influence: 0.8,
    text: "Single heavy rubber stamp hitting paper on a desk, punchy thud" },
};
const want = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(JOBS);
await Promise.all(want.map(async (k) => {
  const j = JOBS[k];
  const res = await fetch("https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128", {
    method: "POST", headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY, "content-type": "application/json" },
    body: JSON.stringify({ text: j.text, duration_seconds: j.seconds, prompt_influence: j.influence, loop: j.loop }),
  });
  if (!res.ok) { console.log(k, "FAILED", res.status, (await res.text()).slice(0, 200)); return; }
  mkdirSync(dirname(join(ROOT, j.out)), { recursive: true });
  writeFileSync(join(ROOT, j.out), Buffer.from(await res.arrayBuffer()));
  console.log(k, "→", j.out);
}));
