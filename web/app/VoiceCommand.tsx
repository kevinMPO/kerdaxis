"use client";

// ---------------------------------------------------------------------------
// « Explain this » à la voix, avec Gladia (transcription en direct).
//
// Tu parles → le micro est converti en PCM 16 bits / 16 kHz → le SDK officiel
// Gladia l'envoie sur la session ouverte par le serveur (clé jamais exposée)
// → la première phrase finale devient une intention (lib/voice/intents.ts)
// → Kerdaxis agit et répond, à l'écran et à voix haute (synthèse vocale du
// navigateur : Gladia transcrit, il ne parle pas).
// ---------------------------------------------------------------------------

import React, { useEffect, useRef, useState } from "react";
import { GladiaClient, type LiveV2Session } from "@gladiaio/sdk";

type Phase = "idle" | "connecting" | "listening" | "thinking";

const TXT = {
  fr: {
    idle: "Explique-moi",
    listening: "Je t'écoute…",
    connecting: "Connexion…",
    stop: "Arrêter",
    hint: "Ex. : « explique-moi », « trouve mes abonnements inutilisés », « résilie Nuvio »",
    by: "Transcription en direct : Gladia",
    mic: "Micro refusé ou indisponible.",
  },
  en: {
    idle: "Explain this",
    listening: "Listening…",
    connecting: "Connecting…",
    stop: "Stop",
    hint: "e.g. “explain this”, “find my unused subscriptions”, “cancel Nuvio”",
    by: "Live transcription: Gladia",
    mic: "Microphone denied or unavailable.",
  },
};

/** Float32 [-1, 1] au taux du navigateur → PCM 16 bits à 16 kHz. */
function toPcm16k(input: Float32Array, inRate: number): Int16Array {
  const ratio = inRate / 16000;
  const n = Math.floor(input.length / ratio);
  const out = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(input.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let j = start; j < end; j++) sum += input[j];
    const v = Math.max(-1, Math.min(1, sum / Math.max(1, end - start)));
    out[i] = v < 0 ? v * 0x8000 : v * 0x7fff;
  }
  return out;
}

// --- Réponse parlée --------------------------------------------------------
// 1) Voix de synthèse de qualité (ElevenLabs, via /api/voice : clé côté
//    serveur) si elle est configurée ; 2) sinon, la MEILLEURE voix installée
//    sur l'appareil (Premium / Enhanced / Natural / Google) plutôt que la voix
//    par défaut du navigateur, souvent robotique.

let premiumAvailable: boolean | null = null; // inconnu tant qu'on n'a pas essayé
let currentAudio: HTMLAudioElement | null = null;

function stopSpeaking() {
  if (currentAudio) {
    currentAudio.pause();
    URL.revokeObjectURL(currentAudio.src);
    currentAudio = null;
  }
  if (typeof window !== "undefined") window.speechSynthesis?.cancel();
}

function voicesReady(): Promise<SpeechSynthesisVoice[]> {
  const now = window.speechSynthesis.getVoices();
  if (now.length) return Promise.resolve(now);
  return new Promise((resolve) => {
    const done = () => resolve(window.speechSynthesis.getVoices());
    window.speechSynthesis.addEventListener("voiceschanged", done, { once: true });
    setTimeout(done, 800);
  });
}

/** Classe les voix installées : les voix « naturelles » d'abord. */
export function pickVoice(voices: SpeechSynthesisVoice[], lang: string): SpeechSynthesisVoice | null {
  const want = lang === "fr" ? "fr" : "en";
  const score = (v: SpeechSynthesisVoice) => {
    let s = 0;
    if (/premium|enhanced|natural|neural|amélioré|améliorée/i.test(v.name)) s += 10;
    if (/google|microsoft .*online/i.test(v.name)) s += 6;
    if (/amélie|amelie|audrey|aurélie|thomas|marie|denise|henri|samantha|ava|allison|aria|jenny|guy/i.test(v.name)) s += 2;
    if (want === "fr" && /fr-FR/i.test(v.lang)) s += 1;
    if (want === "en" && /en-US|en-GB/i.test(v.lang)) s += 1;
    if (/compact|eloquence|grandma|grandpa|zarvox|bells|bad news|bahh|bubbles|cellos|jester|organ|trinoids|whisper|wobble|superstar|boing/i.test(v.name)) s -= 20;
    return s;
  };
  const candidates = voices.filter((v) => v.lang.toLowerCase().startsWith(want));
  return candidates.sort((a, b) => score(b) - score(a))[0] ?? null;
}

export async function speak(text: string, lang: string): Promise<void> {
  if (typeof window === "undefined") return;
  stopSpeaking();

  if (premiumAvailable !== false) {
    try {
      const r = await fetch("/api/voice", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text, lang }),
      });
      if (r.ok && (r.headers.get("content-type") ?? "").startsWith("audio/")) {
        premiumAvailable = true;
        const url = URL.createObjectURL(await r.blob());
        currentAudio = new Audio(url);
        await currentAudio.play();
        return;
      }
      if (r.status === 503) premiumAvailable = false; // pas de clé : inutile de réessayer
    } catch {
      /* réseau : repli sur la voix de l'appareil */
    }
  }

  if (!("speechSynthesis" in window)) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang === "fr" ? "fr-FR" : "en-US";
  const voice = pickVoice(await voicesReady(), lang);
  if (voice) {
    u.voice = voice;
    u.lang = voice.lang;
  }
  u.rate = 1;
  u.pitch = 1;
  window.speechSynthesis.speak(u);
}

export default function VoiceCommand({
  lang,
  onCommand,
}: {
  lang: string;
  /** Reçoit la phrase finale, agit, et renvoie la réponse à afficher/dire. */
  onCommand: (text: string) => string;
}) {
  const t = lang === "fr" ? TXT.fr : TXT.en;
  const [phase, setPhase] = useState<Phase>("idle");
  const [partial, setPartial] = useState("");
  const [heard, setHeard] = useState("");
  const [reply, setReply] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const sessionRef = useRef<LiveV2Session | null>(null);
  const audioRef = useRef<{ ctx: AudioContext; stream: MediaStream; node: ScriptProcessorNode } | null>(null);
  const handledRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cleanupAudio = () => {
    const a = audioRef.current;
    audioRef.current = null;
    if (a) {
      a.node.disconnect();
      a.stream.getTracks().forEach((tr) => tr.stop());
      a.ctx.close().catch(() => undefined);
    }
    if (timerRef.current) clearTimeout(timerRef.current);
  };

  const stop = () => {
    cleanupAudio();
    const s = sessionRef.current;
    sessionRef.current = null;
    if (s) s.stopRecording();
  };

  useEffect(() => () => stop(), []);

  const handleFinal = (text: string) => {
    if (handledRef.current || !text.trim()) return;
    handledRef.current = true;
    stop();
    setHeard(text.trim());
    setPartial("");
    setPhase("thinking");
    const r = onCommand(text.trim());
    setReply(r);
    void speak(r, lang);
    setPhase("idle");
  };

  const start = async () => {
    setErr(null);
    setHeard("");
    setReply("");
    setPartial("");
    handledRef.current = false;
    stopSpeaking();
    setPhase("connecting");
    try {
      // 1) Micro d'abord : si l'utilisateur refuse, on n'ouvre pas de session payante.
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
      // 2) Session Gladia ouverte par le serveur (clé côté serveur).
      const r = await fetch("/api/voice/gladia", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lang }),
      });
      const init = await r.json();
      if (!r.ok) {
        stream.getTracks().forEach((tr) => tr.stop());
        throw new Error(init.error ?? "gladia");
      }
      // Le SDK exige une clé ou une URL de relais ; on ne lui donne qu'une URL
      // de notre origine, jamais appelée par connectSession.
      const client = new GladiaClient({ apiUrl: `${window.location.origin}/api/voice` });
      const session = client.liveV2().connectSession({ id: init.id, url: init.url });
      sessionRef.current = session;
      session.on("message", (msg) => {
        if (msg.type !== "transcript") return;
        const text = msg.data.utterance.text;
        if (msg.data.is_final) handleFinal(text);
        else setPartial(text);
      });
      session.on("error", () => setErr("Gladia"));

      // 3) Audio : ~128 ms par bloc, converti en PCM 16 kHz.
      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const node = ctx.createScriptProcessor(4096, 1, 1);
      node.onaudioprocess = (e) => {
        const pcm = toPcm16k(e.inputBuffer.getChannelData(0), ctx.sampleRate);
        sessionRef.current?.sendAudio(pcm.buffer);
      };
      source.connect(node);
      node.connect(ctx.destination);
      audioRef.current = { ctx, stream, node };
      setPhase("listening");
      // Garde-fou : on coupe au bout de 15 s.
      timerRef.current = setTimeout(() => {
        if (!handledRef.current) {
          stop();
          setPhase("idle");
        }
      }, 15000);
    } catch (e) {
      cleanupAudio();
      setPhase("idle");
      setErr(e instanceof DOMException ? t.mic : e instanceof Error ? e.message : String(e));
    }
  };

  const active = phase === "listening" || phase === "connecting";

  return (
    <div className="kv">
      <style>{CSS}</style>
      {(active || heard || reply || err) && (
        <div className="kv-card" role="status" aria-live="polite">
          <p className="kv-by">🎙 {t.by}</p>
          {active && <p className="kv-live">{partial || <span className="kv-dim">{t.hint}</span>}</p>}
          {heard && <p className="kv-heard">« {heard} »</p>}
          {reply && <p className="kv-reply">{reply}</p>}
          {err && <p className="kv-err">{err}</p>}
        </div>
      )}
      <button
        className={"arg-voice-btn" + (active ? " on" : "")}
        onClick={() => (active ? (stop(), setPhase("idle")) : void start())}
        aria-label={active ? t.stop : t.idle}
      >
        <span className="arg-voice-ico">{phase === "connecting" ? "…" : active ? "⏹" : "🎙"}</span>
        <span className="arg-voice-txt">{phase === "listening" ? t.listening : phase === "connecting" ? t.connecting : t.idle}</span>
      </button>
    </div>
  );
}

const CSS = `
.kv{display:flex;flex-direction:column;align-items:flex-end;gap:10px;}
.kv-card{max-width:min(340px,calc(100vw - 24px));background:rgba(17,26,34,.92);-webkit-backdrop-filter:blur(16px);backdrop-filter:blur(16px);
  border:1px solid var(--c-line-strong,#3b4d58);border-radius:16px;padding:14px 16px;color:var(--c-ink,#eef8f5);
  box-shadow:0 24px 60px rgba(0,0,0,.5),inset 0 1px 0 rgba(255,255,255,.04);animation:argRise .25s cubic-bezier(.23,1,.32,1) both;}
.kv-by{margin:0 0 8px;font-family:var(--f-mono,'JetBrains Mono',monospace);font-size:10.5px;font-weight:500;letter-spacing:.08em;text-transform:uppercase;color:var(--c-vert,#66e6be);}
.kv-live{margin:0;font-size:14.5px;color:var(--c-ink,#eef8f5);min-height:20px;}
.kv-dim{color:var(--c-ink2,#a3b4b9);font-size:12.5px;}
.kv-heard{margin:0 0 8px;font-size:13.5px;font-style:italic;color:var(--c-ink2,#a3b4b9);}
.kv-reply{margin:0;font-size:14px;color:var(--c-ink,#eef8f5);line-height:1.5;}
.kv-err{margin:8px 0 0;font-size:12.5px;color:var(--c-clay,#ff8f7e);}
@media(prefers-reduced-motion:reduce){.kv-card{animation:none;}}
`;
