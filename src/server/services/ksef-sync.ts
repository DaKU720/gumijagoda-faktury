import "server-only";
import type { InvoiceKind, SyncTrigger } from "@/generated/prisma/enums";
import { prisma } from "@/server/db";
import { getKsefClient, KsefError } from "@/server/ksef";
import { importInvoiceXml } from "@/server/services/import";
import { ksefFetchSchema } from "@/server/validation/schemas";

/**
 * Synchronizacja z KSeF: pobranie faktur do bufora.
 *
 * Ten sam kod obsługuje pobranie ręczne (użytkownik klika „Pobierz”) i automatyczne
 * (harmonogram) — różni je wyłącznie pole `trigger` w historii. Gdyby to były dwie
 * ścieżki, deduplikacja albo obsługa błędów prędzej czy później zaczęłyby się różnić.
 *
 * Zasady, które tu obowiązują:
 *
 *  1. KAŻDE uruchomienie zostawia ślad w `KsefSyncRun` — także nieudane. Bez tego użytkownik
 *     rano nie wie, czy nocne pobranie się nie odbyło, czy odbyło się i nic nie znalazło.
 *  2. Duplikat NIE jest błędem. Pobranie tego samego zakresu dat drugi raz to normalna rzecz
 *     (nakładające się okna harmonogramu) — liczymy takie faktury jako „pominięte”.
 *  3. Błąd JEDNEJ faktury nie przerywa całego pobrania. Jedna wadliwa faktura nie może
 *     zablokować dziewiętnastu poprawnych — importujemy, co się da, i raportujemy resztę.
 */

export type SyncResult = {
  runId: string;
  found: number;
  imported: number;
  skipped: number;
  failed: number;
  errors: string[];
};

export async function syncFromKsef(input: {
  dateFrom: Date;
  dateTo: Date;
  kind: InvoiceKind;
  trigger: SyncTrigger;
}): Promise<SyncResult> {
  const run = await prisma.ksefSyncRun.create({
    data: {
      trigger: input.trigger,
      kind: input.kind,
      dateFrom: input.dateFrom,
      dateTo: input.dateTo,
      status: "RUNNING",
    },
  });

  const errors: string[] = [];
  let found = 0;
  let imported = 0;
  let skipped = 0;
  let failed = 0;

  try {
    const client = getKsefClient();
    const invoices = await client.listInvoices({
      dateFrom: input.dateFrom,
      dateTo: input.dateTo,
      kind: input.kind,
    });

    found = invoices.length;

    for (const invoice of invoices) {
      try {
        // Faktura, którą już mamy, nie wymaga nawet pobrania treści XML — sprawdzenie
        // numeru KSeF jest tanie, a ściąganie kilkuset kilobajtów po nic nie jest.
        const existing = await prisma.document.findUnique({
          where: { ksefNumber: invoice.ksefNumber },
          select: { id: true },
        });

        if (existing) {
          skipped += 1;
          continue;
        }

        const xml = await client.fetchInvoiceXml(invoice.ksefNumber);

        const outcome = await importInvoiceXml(
          xml,
          {
            source: "KSEF",
            ksefNumber: invoice.ksefNumber,
            file: {
              filename: `${invoice.ksefNumber}.xml`,
              mimeType: "application/xml",
              kind: "KSEF_XML",
              // Oryginalny XML zostaje przy dokumencie — to on jest źródłem prawdy
              // i to jego pokazujemy w podglądzie.
              data: new TextEncoder().encode(xml),
            },
          },
          // Wiemy, o jaki rodzaj faktur prosiliśmy — ta informacja jest pewniejsza
          // niż zgadywanie kierunku z NIP-ów na fakturze.
          input.kind,
        );

        if (outcome.status === "created") {
          imported += 1;
        } else {
          skipped += 1;
        }
      } catch (error) {
        failed += 1;
        const message = error instanceof Error ? error.message : String(error);
        errors.push(`${invoice.invoiceNumber || invoice.ksefNumber}: ${message}`);
      }
    }

    await prisma.ksefSyncRun.update({
      where: { id: run.id },
      data: {
        status: failed > 0 && imported === 0 && skipped === 0 ? "FAILED" : "SUCCESS",
        foundCount: found,
        importedCount: imported,
        skippedCount: skipped,
        error: errors.length > 0 ? errors.slice(0, 5).join("\n") : null,
        finishedAt: new Date(),
      },
    });

    return { runId: run.id, found, imported, skipped, failed, errors };
  } catch (error) {
    // Awaria całego pobrania: KSeF niedostępny, token odrzucony, brak konfiguracji.
    // Zapisujemy powód i podajemy dalej — UI pokaże komunikat, a nie białą stronę.
    const message =
      error instanceof KsefError ? error.message : `Nieoczekiwany błąd synchronizacji: ${(error as Error).message}`;

    await prisma.ksefSyncRun.update({
      where: { id: run.id },
      data: { status: "FAILED", error: message, finishedAt: new Date() },
    });

    throw error instanceof KsefError ? error : new KsefError(message);
  }
}

/** Wejście z UI: waliduje zakres dat i rodzaj faktur, potem uruchamia synchronizację. */
export async function syncFromKsefManual(input: unknown): Promise<SyncResult> {
  const data = ksefFetchSchema.parse(input);

  return syncFromKsef({
    dateFrom: data.dateFrom,
    // Data „do” z formularza to północ — bez przesunięcia na koniec doby faktury
    // wystawione tego dnia wypadłyby z zakresu.
    dateTo: endOfDay(data.dateTo),
    kind: data.kind,
    trigger: "MANUAL",
  });
}

export function endOfDay(date: Date): Date {
  const value = new Date(date);
  value.setHours(23, 59, 59, 999);
  return value;
}

export async function getRecentSyncRuns(limit = 10) {
  return prisma.ksefSyncRun.findMany({
    orderBy: { startedAt: "desc" },
    take: limit,
  });
}
