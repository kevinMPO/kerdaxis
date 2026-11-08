// Generates public/samples/releve-exemple.pdf: a FICTIONAL three-month bank
// statement (fictional company, fictional bank, fake IBAN with a wrong checksum)
// used to try the PDF import without a Qonto account.
//
// Plain PDF 1.4 written by hand (Helvetica, WinAnsi): no dependency.
// Usage: node scripts/generate-sample-statement.mjs [output.pdf]

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUTPUT = resolve(process.argv[2] ?? `${HERE}/../public/samples/releve-exemple.pdf`);

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN_X = 40;
const TOP_Y = 790;
const ROW_HEIGHT = 15;
const ROWS_PER_PAGE = 38;
const FONT_SIZE = 9;
const OPENING_BALANCE_CENTS = 842_015;
const COLUMNS = { date: MARGIN_X, value: 100, label: 150, debit: 430, credit: 500 };

const MONTHS = [8, 9, 10];
const YEAR = 2026;

/** [day, label, debitEuros | null, creditEuros | null] per month index (0 = August). */
const monthly = (day, label, debit, months = [0, 1, 2]) =>
  months.map((m) => ({ m, day, label, debit: Array.isArray(debit) ? debit[m] : debit, credit: null }));

const ROWS = [
  ...monthly(1, "VIR SEPA EMIS LOYER BUREAU ATELIER /REF LOY2026", 950),
  ...monthly(2, "CB AWS EMEA CARTE XXXX4821", [41.2, 38.9, 44.1]),
  ...monthly(3, "PRLV SEPA NOTION LABS INC /RUM NOT0042117", 10),
  ...monthly(5, "CB SLACK TECHNOLOGIES DU 050826 CARTE XXXX4821", 8.75),
  ...monthly(6, "PRLV SEPA GOOGLE WORKSPACE", 14.4),
  ...monthly(6, "PRLV SEPA GOOGLE WORKSPACE", 14.4),
  ...monthly(9, "CB NETFLIX.COM CARTE XXXX4821", 13.49),
  ...monthly(10, "PRLV SEPA HISCOX ASSURANCE RC PRO", 46),
  ...monthly(12, "CB ADOBE CREATIVE CLOUD CARTE XXXX4821", 71.99),
  ...monthly(14, "CB FIGMA CARTE XXXX4821", [42, 42, 48]),
  ...monthly(15, "PRLV SEPA URSSAF ILE DE FRANCE", 1240),
  ...monthly(15, "PRLV SEPA HUBSPOT", 60),
  ...monthly(17, "CB CANVA CARTE XXXX4821", 11.99),
  ...monthly(18, "CB ZOOM.US CARTE XXXX4821", 15.99),
  ...monthly(20, "CB OPENAI CHATGPT SUBSCR CARTE XXXX4821", 23),
  ...monthly(22, "CB SPOTIFY CARTE XXXX4821", 10.99),
  ...monthly(28, "FRAIS TENUE DE COMPTE", 9),
  { m: 0, day: 13, label: "COMMISSION FRAIS DE CHANGE USD", debit: 2.4, credit: null },
  { m: 1, day: 13, label: "COMMISSION FRAIS DE CHANGE USD", debit: 3.1, credit: null },
  { m: 2, day: 13, label: "COMMISSION FRAIS DE CHANGE USD", debit: 1.8, credit: null },
  { m: 0, day: 19, label: "CB CAPCUT CARTE XXXX4821", debit: 9.99, credit: null },
  { m: 2, day: 21, label: "CB LOOM CARTE XXXX4821", debit: 15, credit: null },
  { m: 0, day: 23, label: "CB CARREFOUR MARKET CARTE XXXX4821", debit: 86.4, credit: null },
  { m: 2, day: 11, label: "CB CARREFOUR MARKET CARTE XXXX4821", debit: 142.1, credit: null },
  { m: 0, day: 26, label: "CB AIR FRANCE CARTE XXXX4821", debit: 412, credit: null },
  { m: 1, day: 17, label: "CB SNCF CONNECT CARTE XXXX4821", debit: 186, credit: null },
  { m: 2, day: 4, label: "CB APPLE STORE CARTE XXXX4821", debit: 1499, credit: null },
  { m: 0, day: 10, label: "VIR SEPA RECU CLIENT LAMBDA SAS /REF FAC2026-081", debit: null, credit: 6500 },
  { m: 1, day: 8, label: "VIR SEPA RECU CLIENT BOREAL /REF FAC2026-092", debit: null, credit: 4432 },
  { m: 2, day: 10, label: "VIR SEPA RECU CLIENT LAMBDA SAS /REF FAC2026-103", debit: null, credit: 6500 },
];

const pad = (n) => String(n).padStart(2, "0");
const toCents = (euros) => Math.round(euros * 100);

function formatEuros(cents) {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const whole = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${sign}${whole},${pad(abs % 100)}`;
}

const rows = ROWS.map((row) => ({ ...row, month: MONTHS[row.m] })).sort(
  (a, b) => a.month - b.month || a.day - b.day,
);

const closingCents = rows.reduce(
  (sum, row) => sum - toCents(row.debit ?? 0) + toCents(row.credit ?? 0),
  OPENING_BALANCE_CENTS,
);

function escapePdf(text) {
  return text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function textAt(x, y, text, font = "F1", size = FONT_SIZE) {
  return `BT /${font} ${size} Tf ${x} ${y} Td (${escapePdf(text)}) Tj ET\n`;
}

const statementRows = [
  { kind: "balance", text: `Ancien solde au 01/08/${YEAR}`, cents: OPENING_BALANCE_CENTS },
  ...rows.map((row) => ({ kind: "tx", row })),
  { kind: "balance", text: `Nouveau solde au 31/10/${YEAR}`, cents: closingCents },
];

const pages = [];
for (let i = 0; i < statementRows.length; i += ROWS_PER_PAGE) pages.push(statementRows.slice(i, i + ROWS_PER_PAGE));

function pageContent(pageRows, pageIndex) {
  let y = TOP_Y;
  let out = "";
  out += textAt(MARGIN_X, y, "BANQUE EXEMPLE - Relevé de compte (document fictif)", "F2", 13);
  y -= 18;
  out += textAt(MARGIN_X, y, "Titulaire : ATELIER EXEMPLE SAS (société fictive)");
  y -= 12;
  out += textAt(MARGIN_X, y, "IBAN : FR00 0000 0000 0000 0000 0000 000 - BIC : EXMPFRPP");
  y -= 12;
  out += textAt(MARGIN_X, y, `Période du 01/08/${YEAR} au 31/10/${YEAR}`);
  y -= 24;
  out += textAt(COLUMNS.date, y, "Date", "F2");
  out += textAt(COLUMNS.value, y, "Valeur", "F2");
  out += textAt(COLUMNS.label, y, "Libellé de l'opération", "F2");
  out += textAt(COLUMNS.debit, y, "Débit (€)", "F2");
  out += textAt(COLUMNS.credit, y, "Crédit (€)", "F2");
  y -= ROW_HEIGHT;
  for (const entry of pageRows) {
    if (entry.kind === "balance") {
      out += textAt(COLUMNS.label, y, entry.text, "F2");
      out += textAt(COLUMNS.credit, y, formatEuros(entry.cents), "F2");
    } else {
      const { row } = entry;
      const date = `${pad(row.day)}/${pad(row.month)}/${YEAR}`;
      out += textAt(COLUMNS.date, y, date);
      out += textAt(COLUMNS.value, y, `${pad(row.day)}/${pad(row.month)}`);
      out += textAt(COLUMNS.label, y, row.label);
      if (row.debit !== null) out += textAt(COLUMNS.debit, y, formatEuros(toCents(row.debit)));
      if (row.credit !== null) out += textAt(COLUMNS.credit, y, formatEuros(toCents(row.credit)));
    }
    y -= ROW_HEIGHT;
  }
  out += textAt(MARGIN_X, 40, `Document fictif généré pour tester Kerdaxis. Page ${pageIndex + 1}/${pages.length}`, "F1", 7);
  return out;
}

/** WinAnsi: Latin-1 for accents, 0x80 for the euro sign. */
function winAnsi(text) {
  return Buffer.from(text.replace(/€/g, "\x80"), "latin1");
}

const objects = [];
const addObject = (body) => {
  objects.push(body);
  return objects.length;
};

const catalogId = addObject(null);
const pagesId = addObject(null);
const regularFontId = addObject(winAnsi("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"));
const boldFontId = addObject(winAnsi("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>"));

const pageIds = pages.map((pageRows, index) => {
  const stream = winAnsi(pageContent(pageRows, index));
  const contentId = addObject(
    Buffer.concat([winAnsi(`<< /Length ${stream.length} >>\nstream\n`), stream, winAnsi("\nendstream")]),
  );
  return addObject(
    winAnsi(
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
        `/Resources << /Font << /F1 ${regularFontId} 0 R /F2 ${boldFontId} 0 R >> >> /Contents ${contentId} 0 R >>`,
    ),
  );
});

objects[catalogId - 1] = winAnsi(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
objects[pagesId - 1] = winAnsi(
  `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`,
);

const chunks = [winAnsi("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n")];
let offset = chunks[0].length;
const offsets = [];
objects.forEach((body, index) => {
  offsets.push(offset);
  const chunk = Buffer.concat([winAnsi(`${index + 1} 0 obj\n`), body, winAnsi("\nendobj\n")]);
  chunks.push(chunk);
  offset += chunk.length;
});
const xref =
  `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` +
  offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("") +
  `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${offset}\n%%EOF\n`;
chunks.push(winAnsi(xref));

mkdirSync(dirname(OUTPUT), { recursive: true });
writeFileSync(OUTPUT, Buffer.concat(chunks));
process.stdout.write(`${OUTPUT} (${rows.length} operations, ${pages.length} pages, closing ${formatEuros(closingCents)} €)\n`);
