// ---------------------------------------------------------------------------
// Ce que Kerdaxis sait du parcours de résiliation d'un fournisseur RÉEL, et
// d'où il le sait. Rempli par la recherche (Linkup, captures lues par un agent
// H Company, tutoriel vidéo écouté par Gladia), puis remis à l'agent qui agit.
// ---------------------------------------------------------------------------

/** Parcours décrit par la documentation écrite officielle (Linkup). */
export interface WrittenPath {
  steps: string[];
  finalConfirmLabel: string;
  retentionTraps: string[];
  officialDocUrl: string;
  sourceUrls: string[];
  depthUsed: "deep" | "standard";
}

/** Étapes lues dans les captures d'écran de l'article officiel (agent H Company, sans navigateur). */
export interface ScreenshotReading {
  docUrl: string;
  screenshotsSent: number;
  relevantScreenshots: number[];
  steps: string[];
  finalConfirmLabel: string;
  retentionTraps: string[];
}

/** Étapes entendues dans un tutoriel vidéo (Gladia, transcription + audio-to-LLM). */
export interface VideoTutorial {
  url: string;
  title: string;
  steps: string[];
  durationSeconds: number | null;
}

export interface CancelResearch {
  merchant: string;
  researchedAt: string;
  written: WrittenPath;
  screenshots: ScreenshotReading | null;
  screenshotsError: string | null;
  video: VideoTutorial | null;
  videoError: string | null;
}

export class ResearchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResearchError";
  }
}
