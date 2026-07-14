import { XMLParser } from "fast-xml-parser";

/**
 * Parser faktur ustrukturyzowanych KSeF: schematy FA(2) i FA(3).
 *
 * Czysta funkcja: string XML na wejściu, obiekt domenowy na wyjściu. Bez bazy, bez sieci.
 * Dzięki temu ten sam kod obsługuje trzy scenariusze — fakturę pobraną z KSeF, plik XML
 * wgrany przez użytkownika i fixture w teście — i jest pokryty testami jednostkowymi.
 *
 * Filozofia parsowania: schemat FA jest ogromny (kilkaset pól), a nam potrzeba kilkunastu.
 * Czytamy tylko to, co realnie trafia do ewidencji, i jesteśmy TOLERANCYJNI na braki
 * (opcjonalny termin płatności, brak rachunku, jedna albo wiele pozycji). Faktura z KSeF
 * jest już zwalidowana przez MF — naszym zadaniem jest ją zrozumieć, nie zwalidować drugi raz.
 *
 * Różnice FA(2) → FA(3), które nas dotyczą:
 *  - inny namespace (2023/06/29/12648 vs 2025/06/25/13775) i WariantFormularza (2 vs 3),
 *  - dłuższy dopuszczalny numer rachunku (32 → 34 znaki),
 *  - dodatkowe pola, których nie czytamy.
 * Struktura pól, na których nam zależy (P_1, P_2, P_13_x, P_14_x, P_15, FaWiersz), jest wspólna —
 * dlatego jeden parser obsługuje oba schematy, a wersję tylko rozpoznajemy i zapisujemy.
 */

export type FaSchemaVersion = "FA(2)" | "FA(3)" | "FA(?)";

export type FaParty = {
  nip: string | null;
  name: string;
  address: string | null;
};

export type FaLine = {
  no: number;
  name: string;
  unit: string | null;
  quantity: number | null;
  unitPriceNet: number | null;
  netValue: number | null;
  vatRate: string | null;
};

export type ParsedInvoice = {
  schemaVersion: FaSchemaVersion;
  number: string;
  issueDate: string;
  saleDate: string | null;
  dueDate: string | null;
  currency: string;
  seller: FaParty;
  buyer: FaParty;
  netAmount: number;
  vatAmount: number;
  grossAmount: number;
  paymentAccount: string | null;
  lines: FaLine[];
};

export class FaParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FaParseError";
  }
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@",
  // Wyłączamy automatyczną konwersję na liczby: numer faktury "2026/07/001" zostałby
  // zamieniony na coś, czym nie jest, a NIP z wiodącym zerem straciłby to zero.
  // Konwersje robimy sami, świadomie, tam gdzie faktycznie chodzi o liczbę.
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  // Namespace'y są w schemacie FA obecne, ale nas nie interesują przy odczycie —
  // wersję schematu rozpoznajemy z WariantFormularza / KodFormularza.
  removeNSPrefix: true,
});

/** Wyciąga wartość spod ścieżki, odporny na braki węzłów pośrednich. */
function get(node: unknown, ...path: string[]): unknown {
  let current = node;
  for (const key of path) {
    if (current === null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function text(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "object") return null;
  const result = String(value).trim();
  return result === "" ? null : result;
}

/** Kwoty w FA są zapisane z kropką dziesiętną. Brak pola = 0, nie NaN. */
function amount(value: unknown): number {
  const raw = text(value);
  if (raw === null) return 0;
  const parsed = Number(raw.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Element, który w XML-u może wystąpić raz albo wiele razy — fast-xml-parser da obiekt albo tablicę. */
function toArray(value: unknown): unknown[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function detectSchemaVersion(header: unknown): FaSchemaVersion {
  const variant = text(get(header, "WariantFormularza"));
  if (variant === "2") return "FA(2)";
  if (variant === "3") return "FA(3)";

  // Fallback: atrybut kodSystemowy, np. kodSystemowy="FA (2)".
  const systemCode = text(get(header, "KodFormularza", "@kodSystemowy")) ?? "";
  if (systemCode.includes("2")) return "FA(2)";
  if (systemCode.includes("3")) return "FA(3)";

  return "FA(?)";
}

function parseParty(node: unknown): FaParty {
  const identity = get(node, "DaneIdentyfikacyjne");
  const address = get(node, "Adres");

  // Adres w FA bywa opisany dwiema liniami (AdresL1/AdresL2) albo rozbity na pola.
  // Sklejamy to, co jest — pusty adres jest dopuszczalny.
  const parts = [
    text(get(address, "AdresL1")),
    text(get(address, "AdresL2")),
    text(get(address, "Ulica")),
    text(get(address, "NrDomu")),
    text(get(address, "KodPocztowy")),
    text(get(address, "Miejscowosc")),
  ].filter((part): part is string => part !== null);

  return {
    nip: text(get(identity, "NIP")),
    // Nazwa pełna albo (dla osoby fizycznej) imię + nazwisko.
    name:
      text(get(identity, "Nazwa")) ??
      [text(get(identity, "ImiePierwsze")), text(get(identity, "Nazwisko"))].filter(Boolean).join(" ") ??
      "",
    address: parts.length > 0 ? [...new Set(parts)].join(", ") : null,
  };
}

/**
 * Termin płatności. FA dopuszcza kilka form: konkretną datę, opis słowny ("14 dni od dostawy"),
 * a w FA(3) także liczbę jednostek czasu od zdarzenia. Bierzemy tylko konkretną datę —
 * reszta nie da się jednoznacznie policzyć bez kontekstu, a zgadywanie terminu płatności
 * w systemie księgowym jest gorsze niż jego brak.
 */
function parseDueDate(fa: unknown): string | null {
  const payments = toArray(get(fa, "Platnosc"));

  for (const payment of payments) {
    for (const term of toArray(get(payment, "TerminPlatnosci"))) {
      const date = text(get(term, "Termin"));
      if (date) return date;
    }
  }

  return null;
}

function parsePaymentAccount(fa: unknown): string | null {
  for (const payment of toArray(get(fa, "Platnosc"))) {
    for (const account of toArray(get(payment, "RachunekBankowy"))) {
      const number = text(get(account, "NrRB"));
      if (number) return number;
    }
  }
  return null;
}

/**
 * Suma netto i VAT: w FA nie ma jednego pola „razem netto”. Są pary pól per stawka
 * (P_13_1/P_14_1 dla 23%, P_13_2/P_14_2 dla 8%, P_13_3 dla 5%, dalej stawki 0%, zw., np. …).
 * Sumujemy wszystkie P_13_* i P_14_*, zamiast wypisywać stawki z palca — dzięki temu faktura
 * z nietypową stawką (albo nowa stawka w przyszłości) nie wypadnie z sumy po cichu.
 */
function sumRateFields(fa: unknown, prefix: string): number {
  if (fa === null || typeof fa !== "object") return 0;

  return Object.entries(fa as Record<string, unknown>)
    .filter(([key]) => key.startsWith(prefix))
    .reduce((total, [, value]) => total + amount(value), 0);
}

function parseLines(fa: unknown): FaLine[] {
  return toArray(get(fa, "FaWiersz")).map((row, index) => ({
    no: Number(text(get(row, "NrWierszaFa")) ?? index + 1),
    name: text(get(row, "P_7")) ?? "(bez nazwy)",
    unit: text(get(row, "P_8A")),
    quantity: text(get(row, "P_8B")) !== null ? amount(get(row, "P_8B")) : null,
    unitPriceNet: text(get(row, "P_9A")) !== null ? amount(get(row, "P_9A")) : null,
    // P_11 to wartość netto pozycji; część systemów wypełnia P_10 (wartość) zamiast P_11.
    netValue:
      text(get(row, "P_11")) !== null
        ? amount(get(row, "P_11"))
        : text(get(row, "P_10")) !== null
          ? amount(get(row, "P_10"))
          : null,
    vatRate: text(get(row, "P_12")),
  }));
}

export function parseFaXml(xml: string): ParsedInvoice {
  let document: unknown;

  try {
    document = parser.parse(xml);
  } catch (error) {
    throw new FaParseError(`Nie udało się odczytać pliku XML: ${(error as Error).message}`);
  }

  const invoice = get(document, "Faktura");
  if (!invoice) {
    throw new FaParseError("To nie jest faktura KSeF — brak elementu <Faktura>. Obsługujemy schematy FA(2) i FA(3).");
  }

  const fa = get(invoice, "Fa");
  if (!fa) {
    throw new FaParseError("Nieprawidłowa struktura faktury — brak sekcji <Fa>.");
  }

  const number = text(get(fa, "P_2"));
  const issueDate = text(get(fa, "P_1"));

  if (!number) throw new FaParseError("Faktura nie ma numeru (pole P_2).");
  if (!issueDate) throw new FaParseError("Faktura nie ma daty wystawienia (pole P_1).");

  const seller = parseParty(get(invoice, "Podmiot1"));
  const buyer = parseParty(get(invoice, "Podmiot2"));

  const netAmount = sumRateFields(fa, "P_13_");
  const vatAmount = sumRateFields(fa, "P_14_");

  // P_15 to kwota należności ogółem (brutto). Gdy jej brak — liczymy z sum cząstkowych.
  const grossRaw = text(get(fa, "P_15"));
  const grossAmount = grossRaw !== null ? amount(grossRaw) : netAmount + vatAmount;

  return {
    schemaVersion: detectSchemaVersion(get(invoice, "Naglowek")),
    number,
    issueDate: issueDate.slice(0, 10),
    saleDate: text(get(fa, "P_6"))?.slice(0, 10) ?? null,
    dueDate: parseDueDate(fa)?.slice(0, 10) ?? null,
    currency: text(get(fa, "KodWaluty")) ?? "PLN",
    seller,
    buyer,
    netAmount,
    vatAmount,
    grossAmount,
    paymentAccount: parsePaymentAccount(fa),
    lines: parseLines(fa),
  };
}
