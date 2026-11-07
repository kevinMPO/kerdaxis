// ---------------------------------------------------------------------------
// Les captures d'écran de l'article d'aide officiel, lues par un agent H Company.
//
// Beaucoup d'articles disent « cliquez sur le bouton ci-dessous » et ne donnent
// le vrai libellé QUE dans une capture. Linkup liste les images mais ne les voit
// pas ; un agent H est un modèle de vision : il les lit (jointes au message,
// sans navigateur) et rend les étapes avec les libellés exacts.
//
// Contraintes de l'API H constatées le 2026-11-07 :
//  - seules les DEUX dernières images d'un message restent visibles : une
//    session par paire de captures, en parallèle ;
//  - un schéma de réponse dont le titre commence par « _ » fait échouer la
//    session (« internal error ») ;
//  - un champ avec valeur par défaut revient à null : tout est requis, et null
//    est ramené à vide ;
//  - un agent sans environnement doit déclarer au moins un outil client.
// ---------------------------------------------------------------------------

import { z } from "zod";
import { cancelSession, createSession, getChanges, getSession, postToolResult, type ToolCall } from "../hcompany";
import { fetchArticle } from "./linkup";
import { ResearchError, type ScreenshotReading } from "./types";

const MAX_SCREENSHOTS = 6;
const SCREENSHOTS_PER_READER = 2;
/** Logos, icônes et badges pèsent quelques Ko ; une capture d'interface rarement moins. */
const MIN_SCREENSHOT_BYTES = 15_000;
const MAX_SCREENSHOT_BYTES = 1_500_000;
const MAX_TOTAL_SCREENSHOT_BYTES = 6_000_000;
const DOWNLOAD_TIMEOUT_MS = 20_000;
const READER_TIMEOUT_MS = 180_000;
const READER_POLL_SECONDS = 10;
const ARTICLE_EXCERPT_CHARS = 8_000;
const MAX_READER_STEPS = 12;
const SCREENSHOT_MEDIA_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const NON_SCREENSHOT_URL_HINTS = ["logo", "icon", "favicon", "avatar", "badge", "emoji", "sprite", "supported_browsers"];
/** Les centres d'aide enveloppent souvent l'image dans un lien vers elle-même : [![alt](src)](href). */
const MARKDOWN_IMAGE_PATTERN = /\[?!\[[^\]]*\]\(([^)\s]+)[^)]*\)(?:\]\([^)]*\))?/g;
const H_FAILED_STATUSES = new Set(["failed", "timed_out", "interrupted"]);

const READER_INSTRUCTIONS = `You read screenshots from a merchant's official help article about cancelling a subscription.
Another agent will then cancel the subscription in the real site, so it needs the exact labels it will see.

- Only describe what the screenshots show. Never invent a label you cannot read.
- A screenshot is relevant only if it shows a step of cancelling the MAIN paid plan. Leave out screenshots about
  add-ons, extra services, other products, deleting the account or workspace, admin dashboards, or checking the
  status after cancelling, and write no steps for them. If none of the attached screenshots is relevant, answer
  with empty lists.
- retention_traps are only offers meant to keep the customer paying (discount, free months, pause, downgrade,
  switch to annual). Not buttons that undo a cancellation.
- Use the article text around each [Screenshot N] marker to understand what that screenshot illustrates.
- You only get some of the article's screenshots. Describe only the ones attached and use their numbers.
- You have no browser. Answer straight away. Call flag_unreadable_screenshot only for a screenshot you cannot read.`;

const READER_ANSWER_SCHEMA = {
  title: "ReaderAnswer",
  type: "object",
  properties: {
    relevant_screenshots: {
      type: "array",
      items: { type: "integer" },
      description: "Numbers of the attached screenshots that show a step of cancelling the main paid plan",
    },
    steps: {
      type: "array",
      items: { type: "string" },
      description:
        'Ordered steps to cancel the main paid plan, from the relevant screenshots only, one click each, with the exact button or menu label in double quotes and where it sits, for example: Click "Billing" in the left sidebar.',
    },
    final_confirm_label: {
      type: "string",
      description: "Exact label of the final button that ends the subscription, empty string if not shown",
    },
    retention_traps: {
      type: "array",
      items: { type: "string" },
      description: "Discount, pause or downgrade offers visible in the screenshots",
    },
  },
  required: ["relevant_screenshots", "steps", "final_confirm_label", "retention_traps"],
};

const UNREADABLE_TOOL = {
  name: "flag_unreadable_screenshot",
  description: "Report a screenshot you cannot read (blurry, cropped, not a UI). Returns \"noted\".",
  input_schema: {
    type: "object",
    properties: {
      number: { type: "integer", description: "The screenshot number, as in [Screenshot N]" },
      reason: { type: "string", description: "Why it cannot be read, a few words" },
    },
    required: ["number", "reason"],
  },
};

const nullToEmptyList = z.preprocess((value) => value ?? [], z.array(z.string()));
const ReaderAnswer = z.object({
  relevant_screenshots: z.preprocess((value) => value ?? [], z.array(z.number().int())),
  steps: nullToEmptyList,
  final_confirm_label: z.preprocess((value) => value ?? "", z.string()),
  retention_traps: nullToEmptyList,
});
type ReaderAnswer = z.infer<typeof ReaderAnswer>;

interface Screenshot {
  url: string;
  dataUri: string;
  sizeBytes: number;
}

export function looksLikeScreenshotUrl(url: string): boolean {
  const path = url.toLowerCase().split("?")[0];
  return !/\.(svg|gif|ico)$/.test(path) && !NON_SCREENSHOT_URL_HINTS.some((hint) => path.includes(hint));
}

/** Remplace chaque image gardée par [Screenshot N] et retire les autres (et leurs URL signées). */
export function articleWithMarkers(markdown: string, keptUrls: string[]): string {
  const numbers = new Map(keptUrls.map((url, index) => [url, index + 1]));
  return markdown
    .replace(MARKDOWN_IMAGE_PATTERN, (_match, url: string) => {
      const number = numbers.get(url);
      return number ? `[Screenshot ${number}]` : "";
    })
    .slice(0, ARTICLE_EXCERPT_CHARS);
}

async function downloadScreenshots(imageUrls: string[]): Promise<Screenshot[]> {
  const screenshots: Screenshot[] = [];
  let totalBytes = 0;
  for (const url of [...new Set(imageUrls)]) {
    if (screenshots.length === MAX_SCREENSHOTS) break;
    if (!looksLikeScreenshotUrl(url)) continue;
    let response: Response;
    try {
      response = await fetch(url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS), cache: "no-store" });
    } catch {
      continue;
    }
    if (!response.ok) continue;
    const mediaType = (response.headers.get("content-type") ?? "").split(";")[0].trim();
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!SCREENSHOT_MEDIA_TYPES.has(mediaType) || bytes.length < MIN_SCREENSHOT_BYTES || bytes.length > MAX_SCREENSHOT_BYTES) continue;
    if (totalBytes + bytes.length > MAX_TOTAL_SCREENSHOT_BYTES) break;
    totalBytes += bytes.length;
    screenshots.push({ url, dataUri: `data:${mediaType};base64,${bytes.toString("base64")}`, sizeBytes: bytes.length });
  }
  return screenshots;
}

function parseReaderAnswer(raw: unknown): ReaderAnswer {
  let value = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      throw new ResearchError("Réponse du lecteur H illisible");
    }
  }
  const parsed = ReaderAnswer.safeParse(value);
  if (!parsed.success) throw new ResearchError("Réponse du lecteur H hors schéma");
  return parsed.data;
}

/** Une session H par lot : lance, répond aux appels d'outil, attend la réponse. */
async function readBatch(merchant: string, article: string, batch: Screenshot[], firstNumber: number): Promise<ReaderAnswer> {
  const numbers = batch.map((_shot, offset) => `Screenshot ${firstNumber + offset}`).join(", ");
  const session = await createSession(
    {
      agent: {
        name: "kerdaxis-doc-reader",
        description: "Reads help-center screenshots and lists the exact UI labels of a cancellation path.",
        instructions: READER_INSTRUCTIONS,
        environments: [],
        tools: [UNREADABLE_TOOL],
        answer_format: READER_ANSWER_SCHEMA,
      },
      messages: [
        {
          type: "user_message",
          message: `Attached, in this order: ${numbers} from ${merchant}'s official help article on cancelling. Full article text:\n\n${article}`,
          images: batch.map((shot) => shot.dataUri),
        },
      ],
      max_time_s: Math.round(READER_TIMEOUT_MS / 1000),
    },
    crypto.randomUUID(),
  );
  if (!session) throw new ResearchError("Session de lecture H non créée");

  const deadline = Date.now() + READER_TIMEOUT_MS;
  const answeredCalls = new Set<string>();
  let fromIndex = 0;
  while (Date.now() < deadline) {
    const changes = await getChanges(session.id, fromIndex, READER_POLL_SECONDS);
    if (changes) {
      fromIndex = (changes.first_index ?? fromIndex) + (changes.new_events ?? []).length;
      for (const call of changes.pending_tool_calls ?? []) await answerToolCall(session.id, call, answeredCalls);
      if (changes.answer != null) return parseReaderAnswer(changes.answer);
      if (H_FAILED_STATUSES.has(changes.status)) throw new ResearchError(`Lecteur H : session ${changes.status} (${changes.error ?? "sans détail"})`);
      if (changes.status !== "completed" && changes.status !== "idle") continue;
    }
    const current = await getSession(session.id);
    if (current?.latest_answer != null) return parseReaderAnswer(current.latest_answer);
    const status = current?.status?.status ?? "";
    if (H_FAILED_STATUSES.has(status) || status === "completed") {
      throw new ResearchError(`Lecteur H terminé sans réponse (${status}) : ${current?.status?.error ?? "sans détail"}`);
    }
  }
  await cancelSession(session.id).catch(() => undefined);
  throw new ResearchError("Lecteur H trop lent");
}

async function answerToolCall(sessionId: string, call: ToolCall, answered: Set<string>): Promise<void> {
  const key = call.id ?? `${call.tool_name}:${JSON.stringify(call.args)}`;
  if (answered.has(key)) return;
  answered.add(key);
  await postToolResult(sessionId, call, "noted");
}

/** Lit les captures de l'article officiel et rend les étapes qu'elles montrent, dans l'ordre de la page. */
export async function readDocScreenshots(merchant: string, docUrl: string): Promise<ScreenshotReading> {
  if (!docUrl) throw new ResearchError("Pas d'article officiel à lire");
  const { markdown, imageUrls } = await fetchArticle(docUrl);
  const screenshots = await downloadScreenshots(imageUrls);
  if (screenshots.length === 0) {
    throw new ResearchError(`Aucune capture d'interface dans l'article (${imageUrls.length} images, aucune retenue)`);
  }
  const article = articleWithMarkers(markdown, screenshots.map((shot) => shot.url));
  const batchStarts = Array.from({ length: Math.ceil(screenshots.length / SCREENSHOTS_PER_READER) }, (_v, i) => i * SCREENSHOTS_PER_READER);
  // Un lot en échec ne perd que ses propres captures.
  const results = await Promise.allSettled(
    batchStarts.map((start) => readBatch(merchant, article, screenshots.slice(start, start + SCREENSHOTS_PER_READER), start + 1)),
  );
  return mergeReadings(docUrl, screenshots.length, batchStarts, results);
}

/** Fusionne les lots dans l'ordre de la page (exporté pour les tests). */
export function mergeReadings(
  docUrl: string,
  screenshotsSent: number,
  batchStarts: number[],
  results: PromiseSettledResult<ReaderAnswer>[],
): ScreenshotReading {
  const relevant: number[] = [];
  const steps: string[] = [];
  const traps: string[] = [];
  let finalConfirmLabel = "";
  let firstFailure: unknown = null;
  results.forEach((result, index) => {
    if (result.status === "rejected") {
      firstFailure ??= result.reason;
      return;
    }
    const first = batchStarts[index] + 1;
    const inBatch = (n: number) => n >= first && n < first + SCREENSHOTS_PER_READER && n <= screenshotsSent;
    const batchRelevant = result.value.relevant_screenshots.filter(inBatch);
    if (batchRelevant.length === 0) return;
    relevant.push(...batchRelevant);
    steps.push(...result.value.steps.map((step) => step.trim()).filter(Boolean));
    traps.push(...result.value.retention_traps);
    finalConfirmLabel = result.value.final_confirm_label.trim().replace(/^"+|"+$/g, "") || finalConfirmLabel;
  });
  if (results.every((result) => result.status === "rejected")) {
    throw new ResearchError(`Lecteur H en échec sur tous les lots : ${firstFailure instanceof Error ? firstFailure.message : firstFailure}`);
  }
  if (relevant.length === 0 || steps.length === 0) {
    throw new ResearchError(`Les ${screenshotsSent} captures ne montrent pas le parcours de résiliation`);
  }
  return {
    docUrl,
    screenshotsSent,
    relevantScreenshots: relevant,
    steps: [...new Set(steps)].slice(0, MAX_READER_STEPS),
    finalConfirmLabel,
    retentionTraps: [...new Set(traps)],
  };
}
