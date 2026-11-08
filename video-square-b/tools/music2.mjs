// ElevenLabs sound-generation, v2: a harder, bigger track for the "agent in action" cut.
import { writeFileSync, readFileSync } from "node:fs";
const key = readFileSync(new URL("../../video-arch/.env.local", import.meta.url), "utf8").match(/^ELEVENLABS_API_KEY=(.*)$/m)[1].trim();
const text = "Seamless loop, powerful hybrid trailer EDM, exactly 124 BPM, massive punchy kick on every beat, huge sidechained supersaw chords, aggressive distorted reese bass, driving percussion, epic cinematic energy, triumphant and urgent, loud polished modern mix, instrumental, no vocals";
await Promise.all([1, 2, 3].map(async (n) => {
  const res = await fetch("https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128", {
    method: "POST", headers: { "xi-api-key": key, "content-type": "application/json" },
    body: JSON.stringify({ text, duration_seconds: 30, prompt_influence: 0.8, loop: true }),
  });
  if (!res.ok) { console.log("take", n, "FAILED", res.status); return; }
  writeFileSync(new URL(`../assets/music/power-${n}.mp3`, import.meta.url), Buffer.from(await res.arrayBuffer()));
  console.log("take", n, "ok");
}));
