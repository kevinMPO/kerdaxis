#!/bin/bash
# Generate each line on its own (AI voice "Liam", eleven_v3), retry until Whisper hears the whole line
# (last word present) and the brand as Kerdaxis/Kurdaxis. Output: assets/voice/vo-XX.mp3 (silence-trimmed).
set -u
cd "$(dirname "$0")/.."
W=$(mktemp -d)
KEY=$(grep -E '^ELEVENLABS_API_KEY=' .env.local | cut -d= -f2-)
node -e '
const {LINES}=await import("./tools/lines.mjs"); for (const l of LINES) console.log([l.id, l.v3??l.text, l.text].join("\t"));
' --input-type=module > "$W/lines.tsv"
while IFS=$'\t' read -r id spoken text; do
  [ -n "${ONLY:-}" ] && [[ " $ONLY " != *" $id "* ]] && continue
  last=$(echo "$text" | awk '{print $NF}' | tr -d '.,?!:' | tr 'A-Z' 'a-z')
  for n in 1 2 3 4 5; do
    f="$W/$id-$n.mp3"
    curl -s -X POST "https://api.elevenlabs.io/v1/text-to-speech/TX3LPaxmHKxFdv7VOQHJ?output_format=mp3_44100_128" \
      -H "xi-api-key: $KEY" -H "content-type: application/json" \
      -d "$(python3 -c 'import json,sys;print(json.dumps({"text":sys.argv[1],"model_id":"eleven_v3","voice_settings":{"stability":0.5,"similarity_boost":0.85}}))' "$spoken")" -o "$f"
    mkdir -p "$W/t$id$n"
    ffmpeg -hide_banner -loglevel error -y -f lavfi -t 0.6 -i anullsrc=r=44100:cl=mono -i "$f" -f lavfi -t 0.8 -i anullsrc=r=44100:cl=mono -filter_complex "[0][1][2]concat=n=3:v=0:a=1" "$W/t$id$n/in.wav"
    npx hyperframes transcribe "$W/t$id$n/in.wav" -d "$W/t$id$n" -l en -m medium.en --json >/dev/null 2>&1
    txt=$(python3 -c 'import json,sys
j=json.load(open(sys.argv[1])); w=j if isinstance(j,list) else j.get("words") or j.get("segments")
print(" ".join((x.get("text") or x.get("word") or "").strip() for x in w))' "$W/t$id$n/transcript.json")
    low=$(echo "$txt" | tr 'A-Z' 'a-z')
    ok=1
    [[ "$low" == *"$last"* ]] || ok=0
    if [[ "$spoken" == *"Kehr-daxis"* ]]; then echo "$low" | grep -q -E "kerdaxis|curdaxis|kurdaxis" || ok=0; fi
    echo "$id try $n ok=$ok: $txt"
    if [ $ok = 1 ]; then
      ffmpeg -hide_banner -loglevel error -y -i "$f" -af "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.05,areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.15,areverse" -c:a libmp3lame -b:a 192k "assets/voice/vo-$id.mp3"
      break
    fi
  done
done < "$W/lines.tsv"
