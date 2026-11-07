// ---------------------------------------------------------------------------
// Recherche du parcours de résiliation d'un fournisseur RÉEL, avant que
// l'agent H Company n'agisse :
//   1. Linkup lit la documentation officielle (parcours, libellés, pièges) ;
//   2. en parallèle : un agent H lit les captures de cet article, et Gladia
//      écoute un tutoriel vidéo (si le fournisseur l'autorise).
// Une source secondaire en échec n'empêche jamais la résiliation : la doc
// écrite suffit. Résultat mis en cache (mémoire + data/research/).
// ---------------------------------------------------------------------------

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { searchWrittenPath } from "./linkup";
import { readDocScreenshots } from "./screenshots";
import { ResearchError, type CancelResearch } from "./types";
import { learnFromVideo } from "./video";

export { ResearchError, type CancelResearch } from "./types";
export { linkupConfigured } from "./linkup";

const CACHE_DIR = path.join(process.cwd(), "data", "research");
const memoryCache = new Map<string, CancelResearch>();

export interface ResearchOptions {
  /** Écouter un tutoriel vidéo (Gladia). Faux quand les vidéos montrent le côté marchand. */
  video: boolean;
  useCache?: boolean;
}

function slug(merchant: string): string {
  return merchant.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

async function readCache(merchant: string): Promise<CancelResearch | null> {
  const key = slug(merchant);
  const inMemory = memoryCache.get(key);
  if (inMemory) return inMemory;
  try {
    const cached = JSON.parse(await readFile(path.join(CACHE_DIR, `${key}.json`), "utf8")) as CancelResearch;
    memoryCache.set(key, cached);
    return cached;
  } catch {
    return null;
  }
}

async function writeCache(research: CancelResearch): Promise<void> {
  const key = slug(research.merchant);
  memoryCache.set(key, research);
  try {
    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(path.join(CACHE_DIR, `${key}.json`), JSON.stringify(research, null, 2));
  } catch {
    // Le cache disque est un confort : la mémoire suffit pour la session en cours.
  }
}

const errorText = (error: unknown): string => (error instanceof Error ? error.message : String(error));

export async function researchCancelPath(merchant: string, options: ResearchOptions): Promise<CancelResearch> {
  if (options.useCache !== false) {
    const cached = await readCache(merchant);
    if (cached) return cached;
  }
  const written = await searchWrittenPath(merchant);
  const [screenshots, video] = await Promise.allSettled([
    readDocScreenshots(merchant, written.officialDocUrl),
    options.video ? learnFromVideo(merchant) : Promise.reject(new ResearchError("vidéo non demandée pour ce fournisseur")),
  ]);
  const research: CancelResearch = {
    merchant,
    researchedAt: new Date().toISOString(),
    written,
    screenshots: screenshots.status === "fulfilled" ? screenshots.value : null,
    screenshotsError: screenshots.status === "rejected" ? errorText(screenshots.reason) : null,
    video: video.status === "fulfilled" ? video.value : null,
    videoError: video.status === "rejected" ? errorText(video.reason) : null,
  };
  await writeCache(research);
  return research;
}

/** Libellé du bouton irréversible : la doc écrite, sinon les captures, sinon `fallback`. */
export function finalLabelOf(research: CancelResearch, fallback: string): string {
  return research.written.finalConfirmLabel || research.screenshots?.finalConfirmLabel || fallback;
}

const numbered = (steps: string[]): string => steps.map((step, index) => `  ${index + 1}. ${step}`).join("\n");

/** Consignes remises à l'agent H : la doc est une carte, l'écran fait foi. */
export function guideFromResearch(research: CancelResearch): string {
  const { written, screenshots, video } = research;
  const traps = [...new Set([...written.retentionTraps, ...(screenshots?.retentionTraps ?? [])])];
  const sections = [
    `Path documented by ${research.merchant} (source: ${written.officialDocUrl || "web research"}):`,
    numbered(written.steps),
  ];
  if (screenshots) {
    sections.push(
      `Steps read from the screenshots in that documentation (prefer these labels when the two differ):`,
      numbered(screenshots.steps),
    );
  }
  if (video) {
    sections.push(`Steps heard in a video tutorial ("${video.title}"), possibly older than the site:`, numbered(video.steps));
  }
  sections.push(
    `Known retention traps: ${traps.length ? traps.join("; ") : "none documented, expect some anyway"}.`,
    "The documentation is a map, the screen is the truth: if a label or step differs, adapt to what you see and say so in notes.",
    'If a survey asks why, pick the most neutral reason (for example "unused" or "other").',
  );
  return sections.join("\n");
}
