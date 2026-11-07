// ---------------------------------------------------------------------------
// Les tutoriels vidéo comme documentation : Linkup trouve une vidéo « comment
// résilier », Gladia l'écoute directement depuis le lien YouTube et son étape
// audio-to-LLM en tire des étapes numérotées. Second usage de Gladia dans
// Kerdaxis, à côté des commandes vocales en direct.
// ---------------------------------------------------------------------------

import { z } from "zod";
import { searchTutorialVideos } from "./linkup";
import { ResearchError, type VideoTutorial } from "./types";

const GLADIA_URL = "https://api.gladia.io/v2/pre-recorded";
const REQUEST_TIMEOUT_MS = 60_000;
const JOB_TIMEOUT_MS = 240_000;
const POLL_MS = 2_000;
const MAX_CANDIDATES = 4;
const MAX_VIDEO_STEPS = 12;
const YOUTUBE_ID_PATTERN = /(?:[?&]v=|youtu\.be\/|\/shorts\/)([A-Za-z0-9_-]{11})/;
const NUMBERING_PATTERN = /^\s*(\d+[.)]|[-*•])\s*/;

const STEPS_PROMPT =
  "From this tutorial transcript, list ONLY the exact UI steps to cancel the subscription, one per line, " +
  "numbered, with button or menu labels in double quotes. No intro, no outro, no tips.";
const RELEVANCE_PROMPT = (merchant: string) =>
  `Answer with one word, YES or NO. Does this video teach how a subscriber cancels their own ${merchant} ` +
  "subscription? Answer NO only if it shows a business cancelling its customers' subscriptions from an admin " +
  "or merchant dashboard.";

const GladiaJob = z.object({
  status: z.string(),
  error_code: z.unknown().optional(),
  result: z
    .object({
      metadata: z.object({ audio_duration: z.number().nullish() }).passthrough().nullish(),
      audio_to_llm: z
        .object({ results: z.array(z.object({ results: z.object({ response: z.unknown() }).passthrough().nullish() }).passthrough()).nullish() })
        .passthrough()
        .nullish(),
    })
    .passthrough()
    .nullish(),
});

function gladiaKey(): string {
  const key = process.env.GLADIA_API_KEY;
  if (!key) throw new ResearchError("GLADIA_API_KEY manquante");
  return key;
}

/** Gladia refuse les liens du type youtube.com/watch?ntb=1&v=ID : on reconstruit l'URL simple. */
export function canonicalVideoUrl(url: string): string {
  const match = YOUTUBE_ID_PATTERN.exec(url);
  return match ? `https://www.youtube.com/watch?v=${match[1]}` : url;
}

export function parseNumberedSteps(answer: string): string[] {
  return answer
    .split("\n")
    .map((line) => line.replace(NUMBERING_PATTERN, "").trim())
    .filter(Boolean)
    .slice(0, MAX_VIDEO_STEPS);
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

async function transcribe(merchant: string, title: string, url: string): Promise<VideoTutorial> {
  const headers = { "x-gladia-key": gladiaKey(), "content-type": "application/json" };
  const created = await fetch(GLADIA_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({
      audio_url: url,
      audio_to_llm: true,
      audio_to_llm_config: { prompts: [STEPS_PROMPT, RELEVANCE_PROMPT(merchant)] },
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!created.ok) throw new ResearchError(`Gladia refuse la vidéo (${created.status})`);
  const { id } = z.object({ id: z.string() }).parse(await created.json());

  const deadline = Date.now() + JOB_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const polled = await fetch(`${GLADIA_URL}/${id}`, { headers, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    const job = GladiaJob.safeParse(await polled.json());
    if (!job.success) throw new ResearchError("Réponse Gladia illisible");
    if (job.data.status === "error") throw new ResearchError(`Gladia n'a pas pu transcrire la vidéo (${String(job.data.error_code)})`);
    if (job.data.status === "done") {
      const answers = (job.data.result?.audio_to_llm?.results ?? []).map((item) => String(item.results?.response ?? ""));
      if (answers.length < 2) throw new ResearchError("Gladia n'a rendu aucune analyse");
      if (!answers[1].trim().toUpperCase().startsWith("YES")) throw new ResearchError("Vidéo côté marchand, pas côté abonné");
      const steps = parseNumberedSteps(answers[0]);
      if (steps.length === 0) throw new ResearchError("Aucune étape entendue dans la vidéo");
      return { url, title, steps, durationSeconds: job.data.result?.metadata?.audio_duration ?? null };
    }
    await sleep(POLL_MS);
  }
  throw new ResearchError("Gladia trop lent sur la vidéo");
}

/** Essaie les meilleures vidéos dans l'ordre et rend la première dont Gladia tire des étapes. */
export async function learnFromVideo(merchant: string): Promise<VideoTutorial> {
  const candidates = (await searchTutorialVideos(merchant)).slice(0, MAX_CANDIDATES);
  let lastError: unknown = null;
  for (const candidate of candidates) {
    try {
      return await transcribe(merchant, candidate.title, canonicalVideoUrl(candidate.url));
    } catch (error) {
      lastError = error;
    }
  }
  throw new ResearchError(`Aucune vidéo exploitable : ${lastError instanceof Error ? lastError.message : "aucune vidéo trouvée"}`);
}
