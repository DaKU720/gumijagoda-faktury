import "server-only";
import { prisma } from "@/server/db";
import { parseFaXml, type ParsedInvoice } from "@/server/domain/fa-parser";

/**
 * Dane do podglądu dokumentu — jeden kształt dla trzech różnych źródeł.
 *
 * Wymaganie 3.4 mówi: PDF ma się renderować, XML ma być pokazany „czytelnie, nie jako surowy
 * XML”, a dokument dodany ręcznie — „w tym samym, spójnym widoku”. Realizujemy to sprowadzając
 * wszystkie trzy przypadki do wspólnego typu JESZCZE NA SERWERZE. Komponent podglądu nie ma
 * wtedy trzech gałęzi „skąd to przyszło”, tylko jedną: „narysuj fakturę”.
 *
 * Pozycje faktury (`lines`) mamy tylko dla dokumentów z XML-em — dla PDF-a i wpisu ręcznego
 * nikt ich nie wprowadzał. To jedyna różnica i UI po prostu ich nie pokazuje, gdy ich nie ma.
 */
export type DocumentPreview = {
  id: string;
  number: string;
  status: "BUFFER" | "ACCEPTED" | "REJECTED";
  source: "KSEF" | "UPLOAD" | "MANUAL";
  ksefNumber: string | null;
  typeName: string;
  direction: "RECEIVABLE" | "PAYABLE";
  categoryName: string | null;
  issueDate: string;
  dueDate: string | null;
  netAmount: string;
  vatAmount: string;
  grossAmount: string;
  currency: string;
  paymentAccount: string | null;
  notes: string | null;

  contractor: {
    name: string;
    nip: string;
    address: string | null;
  };

  /** Plik do wyświetlenia w przeglądarce (PDF) — jeśli dokument go ma. */
  pdfFileId: string | null;
  /** Dane odczytane z załączonego XML-a: pozycje faktury, strony transakcji. */
  invoice: ParsedInvoice | null;
  /** Wersja schematu (FA(2)/FA(3)) — pokazujemy ją, bo to informacja o pochodzeniu dokumentu. */
  schemaVersion: string | null;
};

export async function getDocumentPreview(id: string): Promise<DocumentPreview | null> {
  const document = await prisma.document.findUnique({
    where: { id },
    include: {
      type: { select: { name: true, direction: true } },
      contractor: { select: { name: true, nip: true, address: true } },
      category: { select: { name: true } },
      files: true,
    },
  });

  if (!document) return null;

  const pdf = document.files.find((file) => file.kind === "PDF");
  const xml = document.files.find((file) => file.kind === "KSEF_XML");

  let invoice: ParsedInvoice | null = null;

  if (xml) {
    try {
      invoice = parseFaXml(new TextDecoder("utf-8").decode(xml.data));
    } catch {
      // Uszkodzony XML nie może zabrać użytkownikowi całego podglądu — dane z bazy
      // (kwoty, kontrahent, daty) są zapisane niezależnie i wystarczą, żeby dokument obejrzeć.
      invoice = null;
    }
  }

  return {
    id: document.id,
    number: document.number,
    status: document.status,
    source: document.source,
    ksefNumber: document.ksefNumber,
    typeName: document.type.name,
    direction: document.type.direction,
    categoryName: document.category?.name ?? null,
    issueDate: document.issueDate.toISOString(),
    dueDate: document.dueDate?.toISOString() ?? null,
    netAmount: document.netAmount.toString(),
    vatAmount: document.vatAmount.toString(),
    grossAmount: document.grossAmount.toString(),
    currency: document.currency,
    paymentAccount: document.paymentAccount,
    notes: document.notes,
    contractor: document.contractor,
    pdfFileId: pdf?.id ?? null,
    invoice,
    schemaVersion: invoice?.schemaVersion ?? null,
  };
}
