import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { extractTextItems } from "unpdf";
import {
  cleanLabel,
  groupLines,
  parseMoney,
  parseStatement,
  type StatementLine,
  type StatementTextItem,
} from "@/lib/statement/parse";

const SAMPLE_PDF = fileURLToPath(new URL("../../../public/samples/releve-exemple.pdf", import.meta.url));

/** A line from cells laid out left to right, 100 points apart unless positioned. */
function line(...cells: Array<string | [string, number]>): StatementLine {
  return {
    cells: cells.map((cell, index) =>
      Array.isArray(cell) ? { text: cell[0], center: cell[1] } : { text: cell, center: index * 100 },
    ),
  };
}

describe("parseMoney", () => {
  it("should read French, English and signed amounts", () => {
    expect(parseMoney("1 240,00")).toBe(1240);
    expect(parseMoney("1,234.56")).toBe(1234.56);
    expect(parseMoney("-12,50 €")).toBe(-12.5);
    expect(parseMoney("+6 500,00 EUR")).toBe(6500);
    expect(parseMoney("1.234,56")).toBe(1234.56);
  });

  it("should reject numbers without cents, which are references rather than amounts", () => {
    expect(parseMoney("2026")).toBeNull();
    expect(parseMoney("FAC2026")).toBeNull();
  });
});

describe("cleanLabel", () => {
  it("should strip operation prefixes, card masks and SEPA references", () => {
    expect(cleanLabel("PRLV SEPA NOTION LABS INC /RUM NOT0042117")).toEqual({
      label: "Notion Labs Inc",
      operationType: "direct_debit",
      isFx: false,
    });
    expect(cleanLabel("CB SLACK TECHNOLOGIES DU 050826 CARTE XXXX4821").label).toBe("Slack Technologies");
    expect(cleanLabel("VIR SEPA RECU CLIENT LAMBDA SAS /REF FAC2026-081")).toMatchObject({
      label: "Client Lambda SAS",
      operationType: "transfer",
    });
  });

  it("should never keep an IBAN or a long account number in the label", () => {
    const { label } = cleanLabel("VIR SEPA EMIS FR76 3000 6000 0112 3456 7890 189 LOYER 12345678901");
    expect(label).not.toMatch(/FR76|\d{5,}/);
    expect(label).toContain("Loyer");
  });

  it("should flag bank FX commissions", () => {
    expect(cleanLabel("COMMISSION FRAIS DE CHANGE USD")).toMatchObject({ operationType: "bank_fee", isFx: true });
    expect(cleanLabel("FRAIS TENUE DE COMPTE")).toMatchObject({ operationType: "bank_fee", isFx: false });
  });

  it("should keep a mixed-case label as written", () => {
    expect(cleanLabel("CB Figma Inc").label).toBe("Figma Inc");
  });
});

describe("groupLines", () => {
  it("should merge runs on the same baseline and order them left to right", () => {
    const items: StatementTextItem[] = [
      { str: "10,00", x: 430, y: 700.4, width: 20 },
      { str: "03/09/2026", x: 40, y: 700, width: 40 },
      { str: "NOTION", x: 150, y: 699.2, width: 30 },
      { str: "Next line", x: 40, y: 685, width: 30 },
      { str: "   ", x: 300, y: 700, width: 5 },
    ];
    const lines = groupLines([items]);
    expect(lines.map((l) => l.cells.map((c) => c.text))).toEqual([["03/09/2026", "NOTION", "10,00"], ["Next line"]]);
  });
});

describe("parseStatement", () => {
  it("should assign unsigned amounts to the Debit or Credit column of the header", () => {
    const parsed = parseStatement([
      line(["Date", 50], ["Libellé", 200], ["Débit", 440], ["Crédit", 510]),
      line(["03/09/2026", 50], ["PRLV SEPA NOTION", 200], ["10,00", 440]),
      line(["08/09/2026", 50], ["VIR SEPA RECU CLIENT BOREAL", 200], ["4 432,00", 512]),
    ]);
    expect(parsed.transactions).toEqual([
      { date: "2026-09-03", label: "Notion", amount: 10, side: "debit", operationType: "direct_debit", isFx: false },
      { date: "2026-09-08", label: "Client Boreal", amount: 4432, side: "credit", operationType: "transfer", isFx: false },
    ]);
  });

  it("should use the sign when there is no Debit / Credit header, and ignore the running balance", () => {
    const parsed = parseStatement([
      line("2026-09-03", "CB FIGMA", "-48,00", "1 200,00"),
      line("2026-09-04", "VIREMENT CLIENT", "+500,00", "1 700,00"),
    ]);
    expect(parsed.transactions.map((t) => [t.label, t.amount, t.side])).toEqual([
      ["Figma", 48, "debit"],
      ["Client", 500, "credit"],
    ]);
  });

  it("should read a row printed as a single text run", () => {
    const parsed = parseStatement([line("14/10/2026 CB CANVA CARTE XXXX4821 11,99 €")]);
    expect(parsed.transactions).toEqual([
      { date: "2026-10-14", label: "Canva", amount: 11.99, side: "debit", operationType: "card", isFx: false },
    ]);
  });

  it("should date dd/mm rows with the statement's year and drop the value date", () => {
    const parsed = parseStatement([
      line("Période du 01/09/2026 au 30/09/2026"),
      line("01/09/2026", "Ancien solde", "100,00"),
      line("05/09", "05/09", "CB SLACK", "-8,75"),
    ]);
    expect(parsed.transactions).toEqual([
      { date: "2026-09-05", label: "Slack", amount: 8.75, side: "debit", operationType: "card", isFx: false },
    ]);
  });

  it("should skip balance and total rows, impossible dates and rows without an amount", () => {
    const parsed = parseStatement([
      line("30/09/2026", "Total des opérations", "-1 000,00"),
      line("31/02/2026", "CB GHOST", "-9,99"),
      line("12/09/2026", "CB WITHOUT AMOUNT"),
      line("30/09/2026", "Nouveau solde au 30/09/2026", "2 345,67"),
    ]);
    expect(parsed.transactions).toEqual([]);
    expect(parsed.closingBalance).toBe(2345.67);
  });
});

describe("sample statement PDF", () => {
  it("should read every operation and the closing balance of public/samples/releve-exemple.pdf", async () => {
    const { items } = await extractTextItems(new Uint8Array(readFileSync(SAMPLE_PDF)));
    const parsed = parseStatement(groupLines(items));

    expect(parsed.transactions).toHaveLength(64);
    expect(parsed.closingBalance).toBe(15738.16);
    expect(parsed.transactions.filter((t) => t.side === "credit").map((t) => t.amount)).toEqual([6500, 4432, 6500]);
    expect(parsed.transactions.filter((t) => t.label === "Figma").map((t) => t.amount)).toEqual([42, 42, 48]);
    expect(parsed.transactions.every((t) => !/XXXX|FR00|\d{5,}/.test(t.label))).toBe(true);
  });
});
