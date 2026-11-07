// ---------------------------------------------------------------------------
// Commandes vocales Kerdaxis : transcription Gladia → intention.
//
// Déterministe (pas de LLM) : une phrase transcrite devient une intention
// parmi une liste fermée. La voix peut EXPLIQUER, LANCER l'audit ou PRÉPARER
// une résiliation ; elle ne peut JAMAIS donner le feu vert final d'une action
// irréversible (PRD Kerdaxis, QA §10) : ce feu vert reste un clic à l'écran.
// ---------------------------------------------------------------------------

export type VoiceIntent =
  | { kind: "explain" }
  | { kind: "audit" }
  | { kind: "savings" }
  | { kind: "cancel"; leverId: string | null }
  | { kind: "final_approval_by_voice" }
  | { kind: "unknown" };

/** Minuscules, sans accents ni apostrophes typographiques. */
export function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[’`]/g, "'")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

const has = (t: string, words: RegExp) => words.test(t);

const APPROVE = /\b(confirme|confirmer|valide|valider|j'approuve|approuve|feu vert|vas-y|go ahead|confirm|approve|approved|i approve)\b/;
const CANCEL = /\b(resilie|resilier|resiliation|annule|annuler|arrete|arreter|stoppe|cancel|unsubscribe|terminate|stop)\b/;
const AUDIT = /\b(trouve|trouver|cherche|chercher|analyse|analyser|audit|inutilise|inutilises|inutilisees|find|search|scan|unused|look for)\b/;
const SAVINGS = /\b(combien|economie|economies|economiser|recuperer|how much|savings|save|saving)\b/;
const EXPLAIN = /\b(explique|expliquer|c'est quoi|comment ca marche|presente|explain|what is|what's|how does|tell me about)\b/;

/**
 * Interprète une transcription. `levers` = leviers affichés (id + libellé) :
 * une résiliation vise le levier dont le nom est prononcé.
 */
export function parseIntent(text: string, levers: { id: string; label: string }[]): VoiceIntent {
  const t = normalize(text);
  if (!t) return { kind: "unknown" };

  // Un feu vert dicté n'est jamais exécuté : on le reconnaît pour l'expliquer.
  if (has(t, APPROVE) && !has(t, AUDIT) && !has(t, EXPLAIN)) return { kind: "final_approval_by_voice" };

  if (has(t, CANCEL)) {
    const lever = levers.find((l) => {
      const name = normalize(l.label).split(/[\s/·×]+/)[0];
      return name.length >= 3 && t.includes(name);
    });
    return { kind: "cancel", leverId: lever ? lever.id : null };
  }
  if (has(t, AUDIT)) return { kind: "audit" };
  if (has(t, SAVINGS)) return { kind: "savings" };
  if (has(t, EXPLAIN)) return { kind: "explain" };
  return { kind: "unknown" };
}
