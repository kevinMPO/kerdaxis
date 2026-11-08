// ElevenLabs sound-generation: the square film's music loop (instrumental, built to loop).
import { writeFileSync, readFileSync } from "node:fs";
const key = readFileSync(new URL("../../video-arch/.env.local", import.meta.url), "utf8").match(/^ELEVENLABS_API_KEY=(.*)$/m)[1].trim();
const text = "Seamless loop, punchy confident tech launch track, exactly 124 BPM, hard sidechained four-on-the-floor kick, tight claps, rolling sub bass, bright catchy plucked synth hook, big modern drop energy, polished loud mix, instrumental, no vocals";
for (const n of [1, 2]) {
  const res = await fetch("https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128", {
    method: "POST", headers: { "xi-api-key": key, "content-type": "application/json" },
    body: JSON.stringify({ text, duration_seconds: 30, prompt_influence: 0.75, loop: true }),
  });
  if (!res.ok) { console.log("take", n, "FAILED", res.status, (await res.text()).slice(0, 160)); continue; }
  writeFileSync(new URL(`../assets/music/drive-${n}.mp3`, import.meta.url), Buffer.from(await res.arrayBuffer()));
  console.log("take", n, "ok");
}
