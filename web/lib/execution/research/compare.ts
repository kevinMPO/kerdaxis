// ---------------------------------------------------------------------------
// La recherche Linkup a-t-elle servi ? Confronte le parcours documenté à ce que
// l'agent H Company a réellement fait, sans LLM : les libellés de boutons que
// la doc cite entre guillemets sont cherchés dans le journal de l'agent.
//
// Seuls les événements écrits PAR l'agent (actions, pages vues) et sa réponse
// comptent. Les messages système de Kerdaxis citent eux-mêmes les libellés de
// la doc : les compter ferait confirmer la doc par la doc.
//
// Module pur (aucun accès réseau ni disque) : utilisable côté serveur et testé seul.
// ---------------------------------------------------------------------------

/** D'où vient le libellé du bouton final remis à l'agent. */
export type FinalLabelSource = "docs" | "screenshots" | "catalog";

/**
 * - `seen`     : un libellé cité par la doc apparaît dans le journal de l'agent ;
 * - `not_seen` : la doc cite un libellé, l'agent ne l'a jamais nommé ;
 * - `no_label` : l'étape ne cite aucun libellé, rien à vérifier.
 */
export type StepCheck = "seen" | "not_seen" | "no_label";

export interface CheckedStep {
  text: string;
  labels: string[];
  check: StepCheck;
}

export interface ResearchRunCheck {
  steps: CheckedStep[];
  /** Étapes qui citent au moins un libellé. */
  labelledSteps: number;
  /** Parmi elles, celles dont un libellé apparaît dans le journal de l'agent. */
  seenSteps: number;
  finalLabel: { label: string; source: FinalLabelSource; check: StepCheck };
  /** Ce que l'agent a écrit dans sa réponse (écarts avec la doc, notamment). */
  agentNotes: string | null;
}

export interface RunEvent {
  kind: string;
  message: string;
}

const AGENT_EVENT_KINDS = new Set(["agent", "observation"]);
const MAX_LABEL_CHARS = 60;
const MAX_NOTES_CHARS = 400;
const QUOTED = /"([^"]+)"|“([^”]+)”|«\s*([^»]+?)\s*»/g;

/** Libellés cités entre guillemets droits, typographiques ou français. */
export function quotedLabels(text: string): string[] {
  const labels: string[] = [];
  for (const match of text.matchAll(QUOTED)) {
    const label = (match[1] ?? match[2] ?? match[3] ?? "").trim();
    if (label && label.length <= MAX_LABEL_CHARS && !labels.includes(label)) labels.push(label);
  }
  return labels;
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function checkLabels(labels: string[], agentText: string): StepCheck {
  if (labels.length === 0) return "no_label";
  return labels.some((label) => agentText.includes(normalize(label))) ? "seen" : "not_seen";
}

/** Textes de la réponse structurée de l'agent (`notes`, `page_summary`, `button_label`…). */
function answerTexts(answer: unknown): string[] {
  if (!answer || typeof answer !== "object") return [];
  return Object.values(answer as Record<string, unknown>).filter((value): value is string => typeof value === "string");
}

function notesOf(answer: unknown): string | null {
  if (!answer || typeof answer !== "object") return null;
  const notes = (answer as Record<string, unknown>).notes;
  if (typeof notes !== "string" || !notes.trim()) return null;
  const trimmed = notes.trim();
  return trimmed.length > MAX_NOTES_CHARS ? `${trimmed.slice(0, MAX_NOTES_CHARS)}…` : trimmed;
}

/**
 * Confronte le parcours recherché au journal de l'exécution.
 * `null` tant que l'agent n'a rien fait : il n'y a encore rien à comparer.
 */
export function checkResearchAgainstRun(
  playbook: { steps: string[]; finalButtonLabel: string; finalLabelSource?: FinalLabelSource },
  events: RunEvent[],
  answer: unknown,
): ResearchRunCheck | null {
  const agentEvents = events.filter((event) => AGENT_EVENT_KINDS.has(event.kind));
  if (agentEvents.length === 0) return null;
  const agentText = normalize([...agentEvents.map((event) => event.message), ...answerTexts(answer)].join("\n"));

  const steps = playbook.steps.map((text) => {
    const labels = quotedLabels(text);
    return { text, labels, check: checkLabels(labels, agentText) };
  });
  const labelled = steps.filter((step) => step.check !== "no_label");
  return {
    steps,
    labelledSteps: labelled.length,
    seenSteps: labelled.filter((step) => step.check === "seen").length,
    finalLabel: {
      label: playbook.finalButtonLabel,
      source: playbook.finalLabelSource ?? "catalog",
      check: checkLabels(playbook.finalButtonLabel ? [playbook.finalButtonLabel] : [], agentText),
    },
    agentNotes: notesOf(answer),
  };
}
