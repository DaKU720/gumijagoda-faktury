import "server-only";
import { createHash } from "node:crypto";
import type { DocumentSource, InvoiceKind } from "@/generated/prisma/enums";
import { prisma } from "@/server/db";
import { resolveCategoryId } from "@/server/domain/categorization";
import type { ParsedInvoice } from "@/server/domain/fa-parser";
import { parseFaXml } from "@/server/domain/fa-parser";
import { isValidNip, normalizeNip } from "@/server/domain/identifiers";
import { env } from "@/server/env";
import { findOrCreateContractorByNip } from "@/server/services/contractors";
import { getSystemDocumentType } from "@/server/services/document-types";
import { DomainError, isUniqueViolation } from "@/server/services/errors";

/**
 * Import faktury do bufora — jedna ścieżka dla KSeF i dla uploadu.
 *
 * To jest sedno decyzji z ADR 0002: niezależnie od tego, czy faktura przyszła z API
 * Ministerstwa, czy użytkownik przeciągnął plik na okno przeglądarki, przechodzi przez
 * dokładnie ten sam kod — te same reguły deduplikacji, ta sama auto-kategoryzacja,
 * ten sam bufor. Gdyby były to dwie ścieżki, prędzej czy później rozjechałyby się
 * w szczegółach i duplikat przeszedłby jedną z nich.
 */

export type ImportOutcome =
  | { status: "created"; documentId: string; number: string }
  | { status: "duplicate"; reason: string; number: string };

export type ImportSource = {
  source: DocumentSource;
  /** Numer KSeF — tylko dla faktur pobranych z KSeF. */
  ksefNumber?: string;
  /** Oryginalny plik do zachowania jako załącznik (XML z KSeF, wgrany PDF/XML). */
  file?: { filename: string; mimeType: string; kind: "PDF" | "KSEF_XML"; data: Uint8Array<ArrayBuffer> };
};

/**
 * Kto jest kontrahentem, a kto to my.
 *
 * Faktura zna dwie strony (Podmiot1 = sprzedawca, Podmiot2 = nabywca), ale nie wie, która
 * z nich to firma prowadząca ewidencję. Rozstrzyga o tym NIP właściciela systemu (KSEF_NIP):
 *  - jesteśmy sprzedawcą → to faktura SPRZEDAŻOWA, kontrahentem jest nabywca,
 *  - jesteśmy nabywcą    → to faktura KOSZTOWA, kontrahentem jest sprzedawca.
 *
 * Gdy nasz NIP nie jest skonfigurowany albo nie pasuje do żadnej ze stron (typowe dla faktur
 * zagranicznych wgrywanych ręcznie), przyjmujemy, że dokument jest kosztowy — bo faktura,
 * którą ktoś wgrywa „z zewnątrz”, to prawie zawsze coś, co trzeba zapłacić. Użytkownik może
 * to zmienić jednym kliknięciem w buforze; zgadywanie na odwrót zaśmieciłoby przychody.
 */
function resolveSides(parsed: ParsedInvoice, hint?: InvoiceKind) {
  const ourNip = env.KSEF_NIP ? normalizeNip(env.KSEF_NIP) : null;
  const sellerNip = parsed.seller.nip ? normalizeNip(parsed.seller.nip) : null;
  const buyerNip = parsed.buyer.nip ? normalizeNip(parsed.buyer.nip) : null;

  // Przy imporcie z KSeF wiemy z zapytania, o jaki rodzaj faktur prosiliśmy — ta informacja
  // jest pewniejsza niż porównywanie NIP-ów, więc ma pierwszeństwo.
  const kind: InvoiceKind =
    hint ?? (ourNip !== null && sellerNip === ourNip ? "SALES" : "PURCHASE");

  const counterparty = kind === "SALES" ? parsed.buyer : parsed.seller;

  return {
    kind,
    direction: kind === "SALES" ? ("RECEIVABLE" as const) : ("PAYABLE" as const),
    counterparty,
    counterpartyNip: kind === "SALES" ? buyerNip : sellerNip,
  };
}

export function hashFile(data: Uint8Array<ArrayBuffer>): string {
  return createHash("sha256").update(data).digest("hex");
}

/**
 * Czy ten dokument już u nas jest?
 *
 * Sprawdzamy ZANIM spróbujemy zapisać, żeby móc zwrócić czytelny powód („już pobrana z KSeF”
 * vs „ten sam plik”). Ale to tylko uprzejmość wobec użytkownika — prawdziwą gwarancją są
 * unikalne indeksy w bazie, które łapią też wyścig dwóch równoległych importów.
 */
async function findExisting(params: { ksefNumber?: string; number: string; contractorId?: string; sha256?: string }) {
  if (params.ksefNumber) {
    const byKsef = await prisma.document.findUnique({ where: { ksefNumber: params.ksefNumber } });
    if (byKsef) return { document: byKsef, reason: "Faktura o tym numerze KSeF jest już w systemie" };
  }

  if (params.sha256) {
    const byFile = await prisma.documentFile.findUnique({
      where: { sha256: params.sha256 },
      include: { document: true },
    });
    if (byFile) return { document: byFile.document, reason: "Identyczny plik został już wgrany" };
  }

  if (params.contractorId) {
    const byNumber = await prisma.document.findUnique({
      where: { number_contractorId: { number: params.number, contractorId: params.contractorId } },
    });
    if (byNumber) return { document: byNumber, reason: "Dokument o tym numerze od tego kontrahenta już istnieje" };
  }

  return null;
}

/** Import sparsowanej faktury do bufora. Zwraca wynik, nie rzuca — duplikat to normalna odpowiedź. */
export async function importParsedInvoice(
  parsed: ParsedInvoice,
  origin: ImportSource,
  hint?: InvoiceKind,
): Promise<ImportOutcome> {
  const { direction, counterparty, counterpartyNip } = resolveSides(parsed, hint);

  if (!counterpartyNip || !isValidNip(counterpartyNip)) {
    throw new DomainError(
      `Faktura „${parsed.number}” nie zawiera poprawnego NIP-u kontrahenta — nie da się jej przypisać do żadnej firmy.`,
    );
  }

  const sha256 = origin.file ? hashFile(origin.file.data) : undefined;

  // Szybkie wyjście: identyczny plik albo znany numer KSeF. Nie ma sensu zakładać kontrahenta
  // dla faktury, której i tak nie zaimportujemy.
  const earlyDuplicate = await findExisting({ ksefNumber: origin.ksefNumber, number: parsed.number, sha256 });
  if (earlyDuplicate) {
    return { status: "duplicate", reason: earlyDuplicate.reason, number: parsed.number };
  }

  const [contractor, documentType] = await Promise.all([
    findOrCreateContractorByNip({
      nip: counterpartyNip,
      name: counterparty.name || `Kontrahent ${counterpartyNip}`,
      address: counterparty.address,
      // Rachunek z faktury zapisujemy przy kontrahencie tylko wtedy, gdy to on jest sprzedawcą —
      // przy sprzedaży własnej to NASZ rachunek widnieje na dokumencie, nie jego.
      bankAccount: direction === "PAYABLE" ? parsed.paymentAccount : null,
    }),
    getSystemDocumentType(direction),
  ]);

  const duplicate = await findExisting({ number: parsed.number, contractorId: contractor.id });
  if (duplicate) {
    return { status: "duplicate", reason: duplicate.reason, number: parsed.number };
  }

  const categoryId = resolveCategoryId({ contractorDefaultCategoryId: contractor.defaultCategoryId });

  try {
    const document = await prisma.document.create({
      data: {
        number: parsed.number,
        typeId: documentType.id,
        contractorId: contractor.id,
        categoryId,
        issueDate: new Date(parsed.issueDate),
        dueDate: parsed.dueDate ? new Date(parsed.dueDate) : null,
        netAmount: parsed.netAmount,
        vatAmount: parsed.vatAmount,
        grossAmount: parsed.grossAmount,
        currency: parsed.currency,
        paymentAccount: parsed.paymentAccount,
        source: origin.source,
        ksefNumber: origin.ksefNumber ?? null,
        // Wszystko, co przychodzi z zewnątrz, ląduje w buforze i czeka na akceptację.
        status: "BUFFER",
        ...(origin.file && sha256
          ? {
              files: {
                create: {
                  kind: origin.file.kind,
                  filename: origin.file.filename,
                  mimeType: origin.file.mimeType,
                  data: origin.file.data,
                  sha256,
                  sizeBytes: origin.file.data.length,
                },
              },
            }
          : {}),
      },
    });

    return { status: "created", documentId: document.id, number: document.number };
  } catch (error) {
    // Wyścig: między naszym sprawdzeniem a zapisem inny import (np. równoległy job harmonogramu)
    // zdążył utworzyć ten sam dokument. Unikalny indeks go zatrzymał — dla nas to duplikat,
    // nie awaria.
    if (isUniqueViolation(error)) {
      return { status: "duplicate", reason: "Dokument został właśnie zaimportowany przez inny proces", number: parsed.number };
    }
    throw error;
  }
}

/** Import faktury z pliku XML (upload albo KSeF — różni je tylko `origin`). */
export async function importInvoiceXml(xml: string, origin: ImportSource, hint?: InvoiceKind): Promise<ImportOutcome> {
  const parsed = parseFaXml(xml);
  return importParsedInvoice(parsed, origin, hint);
}
