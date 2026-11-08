// ---------------------------------------------------------------------------
// Bank statement (PDF text) → transactions, by fixed rules only.
//
// Runs in the browser: the PDF never leaves the user's machine, only the
// parsed rows (date, cleaned label, amount, side) are sent to the engine.
// No model reads the statement and no amount is guessed (rule #2): a row
// without a date AND a readable amount is skipped, never estimated.
//
// Rule #3: IBANs, card numbers and long references are stripped from the
// label here, before anything is sent anywhere.
// ---------------------------------------------------------------------------

/** One text run of the PDF, as positioned by pdf.js (origin bottom-left). */
export interface StatementTextItem {
  str: string;
  x: number;
  y: number;
  width: number;
}

export interface StatementCell {
  text: string;
  /** Horizontal center, used to match an amount to its Debit / Credit column. */
  center: number;
}

export interface StatementLine {
  cells: StatementCell[];
}

export type StatementSide = "debit" | "credit";

export interface StatementTx {
  /** YYYY-MM-DD */
  date: string;
  /** Cleaned merchant name: no operation prefix, no IBAN, no reference. */
  label: string;
  /** EUR, always positive. */
  amount: number;
  side: StatementSide;
  operationType: StatementOperationType;
  isFx: boolean;
}

export type StatementOperationType = "card" | "direct_debit" | "transfer" | "bank_fee" | "other";

export interface ParsedStatement {
  transactions: StatementTx[];
  /** Closing balance read on the statement ("nouveau solde"), null when absent. */
  closingBalance: number | null;
}

/** Two runs closer than this (PDF points) vertically are on the same printed line. */
const LINE_Y_TOLERANCE = 2.5;
const MIN_MONTH = 1;
const MAX_MONTH = 12;
const MIN_DAY = 1;
const MAX_DAY = 31;
const TWO_DIGIT_YEAR_BASE = 2000;

const FULL_DATE = /^(\d{2})[/.-](\d{2})[/.-](\d{4}|\d{2})(?!\d)/;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})(?!\d)/;
const SHORT_DATE = /^(\d{2})[/.](\d{2})(?![/.-]?\d)/;
const ANY_DATE_PREFIX = /^\s*(?:\d{2}[/.-]\d{2}(?:[/.-](?:\d{4}|\d{2}))?|\d{4}-\d{2}-\d{2})(?!\d)\s*/;

const MONEY_BODY = String.raw`[-+−]?\s?(?:\d{1,3}(?:[   .,']\d{3})+|\d+)[.,]\d{1,2}`;
const MONEY_CELL = new RegExp(String.raw`^${MONEY_BODY}\s?(?:€|EUR)?$`, "i");
const MONEY_AT_END = new RegExp(String.raw`(${MONEY_BODY})\s?(?:€|EUR)?\s*$`, "i");

const HEADER_DEBIT = /d[ée]bit/i;
const HEADER_CREDIT = /cr[ée]dit/i;
const HEADER_BALANCE = /^(solde|balance)$/i;

const CLOSING_BALANCE = /nouveau solde|solde final|solde au|closing balance|solde cr[ée]diteur|solde d[ée]biteur/i;
const NOT_A_TRANSACTION = /\b(ancien|nouveau)\s+solde\b|\bsolde\s+(au|initial|final|cr[ée]diteur|d[ée]biteur|pr[ée]c[ée]dent)\b|\btotal\b|\bopening balance\b|\bclosing balance\b/i;

const OPERATION_PREFIXES: ReadonlyArray<[RegExp, StatementOperationType]> = [
  [/^(?:PRLV|PR[EÉ]L[EÈ]VEMENT)(?:\s+SEPA)?\b/i, "direct_debit"],
  [/^(?:PAIEMENT\s+(?:PAR\s+)?(?:CB|CARTE)|ACHAT\s+CB|FACTURE\s+CARTE|CARTE|CB)\b/i, "card"],
  [/^(?:VIR(?:EMENT)?(?:\s+SEPA)?(?:\s+(?:RE[CÇ]U|EMIS|[EÉ]MIS|INSTANTAN[EÉ]))?)\b/i, "transfer"],
  [/^(?:FRAIS|COMMISSION|COTISATION|ABONNEMENT\s+BANCAIRE)\b/i, "bank_fee"],
];
const FX_FEE = /\b(?:frais|commission)\b.*\b(?:change|conversion)\b|\bfx\b/i;

const LABEL_NOISE: readonly RegExp[] = [
  /\s\/(?:REF|ECH|MDT|RUM|ID|LIB|FRM|DE|MOTIF)\b.*$/i,
  /\b(?:REF|RUM|MANDAT|ID EMETTEUR)\s*[:.]?\s*\S+/gi,
  /\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){3,7}(?:\s?[A-Z0-9]{1,3})?\b/g,
  /\bCARTE\s+(?:X+|\*+)?\d{2,4}\b/gi,
  /\b(?:X{2,}|\*{2,})\d{2,4}\b/gi,
  /\bDU\s+\d{6}\b/gi,
  /\b\d{2}[/.]\d{2}(?:[/.]\d{2,4})?\b/g,
  /\b\d{5,}\b/g,
];

/** Kept in capitals when an all-caps label is title-cased. */
const ACRONYMS: ReadonlySet<string> = new Set([
  "AWS", "OVH", "SNCF", "SAS", "SARL", "SA", "EDF", "SFR", "RC", "URSSAF", "USD", "EUR", "GBP", "IA", "AI", "TV", "BNP", "LCL", "CIC", "RATP", "HT", "TTC",
]);

/** Groups positioned text runs into printed lines, top to bottom, cells left to right. */
export function groupLines(pages: StatementTextItem[][]): StatementLine[] {
  const lines: StatementLine[] = [];
  for (const items of pages) {
    const visible = items
      .filter((item) => item.str.trim().length > 0)
      .sort((a, b) => b.y - a.y || a.x - b.x);
    let currentY: number | null = null;
    let current: StatementTextItem[] = [];
    const flush = (): void => {
      if (current.length === 0) return;
      const cells = current
        .sort((a, b) => a.x - b.x)
        .map((item) => ({ text: item.str.replace(/\s+/g, " ").trim(), center: item.x + item.width / 2 }));
      lines.push({ cells });
      current = [];
    };
    for (const item of visible) {
      if (currentY !== null && Math.abs(item.y - currentY) > LINE_Y_TOLERANCE) flush();
      if (current.length === 0) currentY = item.y;
      current.push(item);
    }
    flush();
  }
  return lines;
}

/** "1 234,56" | "1,234.56" | "-12.00 €" → signed number, or null. */
export function parseMoney(raw: string): number | null {
  const compact = raw.replace(/€|EUR/gi, "").replace(/[\s  ']/g, "").replace("−", "-");
  const match = /^([-+]?)([\d.,]+)$/.exec(compact);
  if (!match) return null;
  const [, sign, digits] = match;
  const decimal = /[.,](\d{1,2})$/.exec(digits);
  if (!decimal) return null;
  const integerPart = digits.slice(0, decimal.index).replace(/[.,]/g, "");
  const value = Number(`${integerPart}.${decimal[1]}`);
  if (!Number.isFinite(value)) return null;
  return sign === "-" ? -value : value;
}

function isValidDay(year: number, month: number, day: number): boolean {
  if (month < MIN_MONTH || month > MAX_MONTH || day < MIN_DAY || day > MAX_DAY) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function isoDay(year: number, month: number, day: number): string | null {
  if (!isValidDay(year, month, day)) return null;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Year written in full on the line, if any (used to date "dd/mm" rows). */
function fullYearAtStart(text: string): number | null {
  const iso = ISO_DATE.exec(text);
  if (iso) return Number(iso[1]);
  const full = FULL_DATE.exec(text);
  if (!full) return null;
  const year = Number(full[3]);
  return full[3].length === 2 ? TWO_DIGIT_YEAR_BASE + year : year;
}

function dateAtStart(text: string, fallbackYear: number): string | null {
  const iso = ISO_DATE.exec(text);
  if (iso) return isoDay(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const full = FULL_DATE.exec(text);
  if (full) {
    const year = full[3].length === 2 ? TWO_DIGIT_YEAR_BASE + Number(full[3]) : Number(full[3]);
    return isoDay(year, Number(full[2]), Number(full[1]));
  }
  const short = SHORT_DATE.exec(text);
  if (short) return isoDay(fallbackYear, Number(short[2]), Number(short[1]));
  return null;
}

function mostFrequent(values: number[]): number | null {
  const counts = new Map<number, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  let best: number | null = null;
  let bestCount = 0;
  for (const [value, count] of counts) {
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}

function titleCase(word: string): string {
  if (ACRONYMS.has(word)) return word;
  return word.charAt(0) + word.slice(1).toLowerCase();
}

/** Operation prefix, FX flag and a clean merchant name, with personal identifiers removed. */
export function cleanLabel(raw: string): { label: string; operationType: StatementOperationType; isFx: boolean } {
  let text = raw.replace(/\s+/g, " ").trim();
  const isFx = FX_FEE.test(text);
  let operationType: StatementOperationType = "other";
  for (const [prefix, type] of OPERATION_PREFIXES) {
    if (prefix.test(text)) {
      operationType = type;
      if (type !== "bank_fee") text = text.replace(prefix, "").trim();
      break;
    }
  }
  for (const noise of LABEL_NOISE) text = text.replace(noise, " ");
  text = text.replace(/\s+/g, " ").replace(/^[\s\-:/.]+|[\s\-:/.]+$/g, "").trim();
  const isAllCaps = text === text.toUpperCase();
  const label = isAllCaps ? text.split(" ").map(titleCase).join(" ") : text;
  return { label, operationType, isFx };
}

interface Columns {
  debit: number | null;
  credit: number | null;
  balance: number | null;
}

function readHeader(line: StatementLine): Columns | null {
  const find = (re: RegExp): number | null => line.cells.find((cell) => re.test(cell.text))?.center ?? null;
  const debit = find(HEADER_DEBIT);
  const credit = find(HEADER_CREDIT);
  if (debit === null || credit === null) return null;
  return { debit, credit, balance: find(HEADER_BALANCE) };
}

function nearestColumn(center: number, columns: Columns): keyof Columns | null {
  let best: keyof Columns | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const key of ["debit", "credit", "balance"] as const) {
    const columnCenter = columns[key];
    if (columnCenter === null) continue;
    const distance = Math.abs(center - columnCenter);
    if (distance < bestDistance) {
      best = key;
      bestDistance = distance;
    }
  }
  return best;
}

interface Amount {
  value: number;
  side: StatementSide;
}

/** Reads the amount of a row: by Debit / Credit column when the header was seen, else by sign. */
function readAmount(cells: StatementCell[], text: string, columns: Columns | null): { amount: Amount; moneyTexts: string[] } | null {
  const moneyCells = cells.filter((cell) => MONEY_CELL.test(cell.text));
  if (moneyCells.length > 0 && columns) {
    for (const cell of moneyCells) {
      const column = nearestColumn(cell.center, columns);
      const value = parseMoney(cell.text);
      if (value === null || value === 0 || (column !== "debit" && column !== "credit")) continue;
      return { amount: { value: Math.abs(value), side: column }, moneyTexts: moneyCells.map((c) => c.text) };
    }
    return null;
  }
  // Without a Debit / Credit header, a second amount on the row is the running balance.
  const amountText = moneyCells[0]?.text ?? MONEY_AT_END.exec(text)?.[1];
  if (!amountText) return null;
  const value = parseMoney(amountText);
  if (value === null || value === 0) return null;
  const side: StatementSide = value > 0 && /^\s*\+/.test(amountText) ? "credit" : "debit";
  const moneyTexts = moneyCells.length > 0 ? moneyCells.map((c) => c.text) : [amountText];
  return { amount: { value: Math.abs(value), side }, moneyTexts };
}

function stripMoney(text: string, moneyTexts: string[]): string {
  let out = text;
  for (const money of moneyTexts) {
    const at = out.lastIndexOf(money);
    if (at >= 0) out = `${out.slice(0, at)} ${out.slice(at + money.length)}`;
  }
  return out.replace(/\s(?:€|EUR)(?=\s|$)/gi, " ");
}

/** Lines of a statement → its transactions and closing balance. */
export function parseStatement(lines: StatementLine[], today: Date = new Date()): ParsedStatement {
  const texts = lines.map((line) => line.cells.map((cell) => cell.text).join(" "));
  const fallbackYear =
    mostFrequent(texts.map(fullYearAtStart).filter((year): year is number => year !== null)) ?? today.getUTCFullYear();

  const transactions: StatementTx[] = [];
  let columns: Columns | null = null;
  let closingBalance: number | null = null;

  lines.forEach((line, index) => {
    const text = texts[index];
    const header = readHeader(line);
    if (header) {
      columns = header;
      return;
    }
    if (CLOSING_BALANCE.test(text)) {
      const balanceText = MONEY_AT_END.exec(text)?.[1];
      const balance = balanceText ? parseMoney(balanceText) : null;
      if (balance !== null) closingBalance = balance;
    }
    const date = dateAtStart(text.trim(), fallbackYear);
    if (!date || NOT_A_TRANSACTION.test(text)) return;

    const read = readAmount(line.cells, text, columns);
    if (!read) return;

    // A second date right after the first is the value date.
    const withoutDates = text.replace(ANY_DATE_PREFIX, "").replace(ANY_DATE_PREFIX, "");
    const { label, operationType, isFx } = cleanLabel(stripMoney(withoutDates, read.moneyTexts));
    if (!label) return;
    transactions.push({ date, label, amount: read.amount.value, side: read.amount.side, operationType, isFx });
  });

  return { transactions, closingBalance };
}
