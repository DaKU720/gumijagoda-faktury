import type { InvoiceKind } from "@/generated/prisma/enums";

/**
 * Granica integracji z KSeF.
 *
 * Cały system zna WYŁĄCZNIE ten interfejs. Nie wie, czy po drugiej stronie jest API
 * Ministerstwa Finansów, czy zestaw plików XML w repozytorium — i właśnie o to chodzi
 * (ADR 0001). Serwis synchronizacji, harmonogram i UI nie zawierają ani jednego `if (mock)`.
 *
 * Interfejs jest celowo wąski: dwie metody, bo tylko tyle potrzebuje ewidencja.
 * Wystawianie faktur jest poza zakresem zadania — i poza tym interfejsem.
 */

/** Faktura widziana „z lotu ptaka”: metadane z KSeF, jeszcze bez treści XML. */
export type KsefInvoiceRef = {
  ksefNumber: string;
  invoiceNumber: string;
  issueDate: string;
  sellerNip: string | null;
  buyerNip: string | null;
  grossAmount: number | null;
  currency: string | null;
};

export type KsefQuery = {
  dateFrom: Date;
  dateTo: Date;
  /** PURCHASE = jesteśmy nabywcą (Subject2), SALES = jesteśmy sprzedawcą (Subject1). */
  kind: InvoiceKind;
};

export interface KsefClient {
  /** Lista faktur spełniających kryteria (metadane, bez treści). */
  listInvoices(query: KsefQuery): Promise<KsefInvoiceRef[]>;

  /** Treść faktury (XML w schemacie FA) po numerze KSeF. */
  fetchInvoiceXml(ksefNumber: string): Promise<string>;
}

/**
 * Błąd integracji — KSeF nie odpowiedział albo odmówił.
 *
 * Wyodrębniony typ, bo wymaganie mówi wprost o „obsłudze błędów integracji (np. niedostępność
 * KSeF) — czytelne komunikaty, brak utraty danych”. Serwis synchronizacji łapie go, zapisuje
 * w historii uruchomień i pokazuje użytkownikowi, zamiast wywalać stronę.
 */
export class KsefError extends Error {
  constructor(
    message: string,
    readonly statusCode?: number,
  ) {
    super(message);
    this.name = "KsefError";
  }
}
