import { readFile } from "node:fs/promises";
import path from "node:path";
import type { KsefClient, KsefInvoiceRef, KsefQuery } from "@/server/ksef/client";
import { KsefError } from "@/server/ksef/client";
import { parseFaXml } from "@/server/domain/fa-parser";

/**
 * Mock KSeF: faktury z plików XML w repozytorium.
 *
 * Nie jest to atrapa „na odczep się” — implementuje ten sam kontrakt co klient produkcyjny
 * i zwraca prawdziwe faktury w schemacie FA(2) i FA(3). Dzięki temu ścieżka
 * „pobranie → parsowanie → deduplikacja → bufor” jest w testach przechodzona w całości,
 * a nie omijana.
 *
 * Kiedy działa:
 *  - w testach (deterministycznie, bez sieci),
 *  - lokalnie, zanim skonfiguruje się token KSeF,
 *  - jako fallback, gdy środowisko testowe MF nie odpowiada (a potrafi).
 *
 * Numery KSeF budujemy tak, jak robi to prawdziwy system: NIP-data-losowe-suma.
 * Są stabilne między uruchomieniami, więc deduplikacja ma co łapać przy powtórnym pobraniu.
 */
const FIXTURES = [
  { file: "fa2-kosztowa-kartoniaki.xml", kind: "PURCHASE" as const, ksefNumber: "5252248481-20260708-0A1B2C3D4E-5F" },
  { file: "fa3-kosztowa-chlodtrans.xml", kind: "PURCHASE" as const, ksefNumber: "6771234561-20260710-1B2C3D4E5F-6A" },
  { file: "fa2-sprzedazowa-smakosz.xml", kind: "SALES" as const, ksefNumber: "6771102954-20260712-2C3D4E5F6A-7B" },
];

const FIXTURES_DIR = path.join(process.cwd(), "src", "server", "ksef", "fixtures");

export class MockKsefClient implements KsefClient {
  async listInvoices(query: KsefQuery): Promise<KsefInvoiceRef[]> {
    const refs: KsefInvoiceRef[] = [];

    for (const fixture of FIXTURES) {
      if (fixture.kind !== query.kind) continue;

      const parsed = parseFaXml(await this.readFixture(fixture.file));
      const issueDate = new Date(parsed.issueDate);

      // Mock respektuje zakres dat tak samo jak prawdziwe API — inaczej testy
      // filtrowania po datach niczego by nie dowodziły.
      if (issueDate < query.dateFrom || issueDate > query.dateTo) continue;

      refs.push({
        ksefNumber: fixture.ksefNumber,
        invoiceNumber: parsed.number,
        issueDate: parsed.issueDate,
        sellerNip: parsed.seller.nip,
        buyerNip: parsed.buyer.nip,
        grossAmount: parsed.grossAmount,
        currency: parsed.currency,
      });
    }

    return refs;
  }

  async fetchInvoiceXml(ksefNumber: string): Promise<string> {
    const fixture = FIXTURES.find((item) => item.ksefNumber === ksefNumber);
    if (!fixture) {
      throw new KsefError(`Nie znaleziono faktury o numerze KSeF ${ksefNumber}`, 404);
    }

    return this.readFixture(fixture.file);
  }

  private readFixture(file: string): Promise<string> {
    return readFile(path.join(FIXTURES_DIR, file), "utf8");
  }
}
