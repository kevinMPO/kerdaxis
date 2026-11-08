// ElevenLabs sound-generation: a premium bed made to sit under a voiceover.
import { writeFileSync, readFileSync } from "node:fs";
const key = readFileSync(new URL("../../video-arch/.env.local", import.meta.url), "utf8").match(/^ELEVENLABS_API_KEY=(.*)$/m)[1].trim();
const text = "Seamless loop, premium modern tech brand music for a product film with voiceover, 112 BPM, warm analog synth pads, tight soft kick and crisp hi-hats, pulsing round bass, gentle plucked arpeggio, optimistic and confident, spacious, high fidelity studio mix, no harsh distortion, instrumental, no vocals";
await Promise.all([1, 2, 3].map(async (n) => {
  const res = await fetch("https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_192", {
    method: "POST", headers: { "xi-api-key": key, "content-type": "application/json" },
    body: JSON.stringify({ text, duration_seconds: 30, prompt_influence: 0.7, loop: true }),
  });
  if (!res.ok) { console.log("take", n, "FAILED", res.status, (await res.text()).slice(0, 120)); return; }
  writeFileSync(new URL(`../assets/music/premium-${n}.mp3`, import.meta.url), Buffer.from(await res.arrayBuffer()));
  console.log("take", n, "ok");
}));
