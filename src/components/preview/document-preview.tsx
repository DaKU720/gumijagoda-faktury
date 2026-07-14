"use client";

import { useEffect, useState } from "react";
import { ExternalLink, FileText, Loader2, Receipt } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDate, formatMoney } from "@/lib/format";
import { formatBankAccount } from "@/server/domain/identifiers";
import type { DocumentPreview as PreviewData } from "@/server/services/document-preview";

/**
 * Podgląd dokumentu w panelu bocznym.
 *
 * Panel, a nie osobna strona: wymaganie mówi o szybkim podglądzie „bez opuszczania listy”.
 * Użytkownik przegląda bufor, klika fakturę, patrzy, zamyka — filtry i pozycja na liście
 * zostają nietknięte.
 *
 * Ten sam komponent obsługuje rejestr i bufor (ADR 0002: to ten sam byt, więc i ten sam podgląd).
 */
export function DocumentPreview({ documentId, onClose }: { documentId: string; onClose: () => void }) {
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch(`/api/documents/${documentId}/preview`)
      .then(async (response) => {
        if (!response.ok) throw new Error("Nie udało się wczytać podglądu");
        return response.json();
      })
      .then((data) => {
        if (!cancelled) setPreview(data);
      })
      .catch(() => {
        if (!cancelled) setError("Nie udało się wczytać podglądu dokumentu");
      });

    // Użytkownik może zamknąć panel, zanim odpowiedź dojdzie — bez tego React ostrzegałby
    // o ustawianiu stanu na odmontowanym komponencie.
    return () => {
      cancelled = true;
    };
  }, [documentId]);

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-3xl">
        {!preview && !error && (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="text-muted-foreground size-6 animate-spin" />
          </div>
        )}

        {error && (
          <div className="flex flex-1 items-center justify-center">
            <p className="text-destructive text-sm">{error}</p>
          </div>
        )}

        {preview && <PreviewContent preview={preview} />}
      </SheetContent>
    </Sheet>
  );
}

function PreviewContent({ preview }: { preview: PreviewData }) {
  const hasPdf = preview.pdfFileId !== null;

  return (
    <>
      <SheetHeader className="border-b px-6 py-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <SheetTitle className="text-lg">{preview.number}</SheetTitle>
            <SheetDescription className="mt-0.5">
              {preview.typeName} · {preview.contractor.name}
            </SheetDescription>
          </div>

          <div className="flex shrink-0 gap-1.5">
            {preview.status === "BUFFER" && <Badge variant="outline">w buforze</Badge>}
            {preview.schemaVersion && <Badge variant="secondary">{preview.schemaVersion}</Badge>}
            <Badge variant="outline">
              {preview.source === "KSEF" ? "KSeF" : preview.source === "UPLOAD" ? "upload" : "ręczny"}
            </Badge>
          </div>
        </div>
      </SheetHeader>

      {/*
        Zakładki pojawiają się TYLKO wtedy, gdy jest co przełączać. Dokument bez PDF-a
        (np. faktura z KSeF, gdzie źródłem jest XML) nie ma pokazywać pustej zakładki "Plik PDF".
      */}
      {hasPdf ? (
        <Tabs defaultValue="dane" className="flex flex-1 flex-col overflow-hidden">
          <TabsList className="mx-6 mt-4 self-start">
            <TabsTrigger value="dane">
              <Receipt className="size-4" />
              Dane faktury
            </TabsTrigger>
            <TabsTrigger value="pdf">
              <FileText className="size-4" />
              Oryginał PDF
            </TabsTrigger>
          </TabsList>

          <TabsContent value="dane" className="flex-1 overflow-y-auto px-6 py-4">
            <InvoiceView preview={preview} />
          </TabsContent>

          <TabsContent value="pdf" className="flex flex-1 flex-col overflow-hidden px-6 pt-2 pb-6">
            <PdfViewer fileId={preview.pdfFileId!} />
          </TabsContent>
        </Tabs>
      ) : (
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <InvoiceView preview={preview} />
        </div>
      )}
    </>
  );
}

/**
 * PDF renderowany przez wbudowany czytnik przeglądarki (iframe → endpoint z `Content-Disposition: inline`).
 *
 * Świadoma decyzja: pdf.js dołożyłby ~350 kB do bundla i własny, gorszy interfejs. Natywny
 * czytnik daje przewijanie stron, powiększanie, wyszukiwanie i druk — czyli dokładnie to,
 * czego wymaga zadanie — za zero linii kodu i zero kilobajtów.
 */
function PdfViewer({ fileId }: { fileId: string }) {
  return (
    <div className="flex flex-1 flex-col gap-2">
      <iframe src={`/api/files/${fileId}`} className="bg-muted h-full w-full rounded-lg border" title="Podgląd PDF" />
      <Button variant="outline" size="sm" asChild className="self-start">
        <a href={`/api/files/${fileId}`} target="_blank" rel="noreferrer">
          <ExternalLink className="size-4" />
          Otwórz w nowej karcie
        </a>
      </Button>
    </div>
  );
}

/** Czytelna prezentacja faktury — nigdy surowy XML. */
function InvoiceView({ preview }: { preview: PreviewData }) {
  const invoice = preview.invoice;

  return (
    <div className="space-y-6">
      {/* Strony transakcji */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Party
          role={preview.direction === "PAYABLE" ? "Sprzedawca" : "Nabywca"}
          name={preview.contractor.name}
          nip={preview.contractor.nip}
          address={preview.contractor.address}
          highlight
        />

        {invoice && (
          <Party
            role={preview.direction === "PAYABLE" ? "Nabywca" : "Sprzedawca"}
            name={preview.direction === "PAYABLE" ? invoice.buyer.name : invoice.seller.name}
            nip={preview.direction === "PAYABLE" ? invoice.buyer.nip : invoice.seller.nip}
            address={preview.direction === "PAYABLE" ? invoice.buyer.address : invoice.seller.address}
          />
        )}
      </div>

      <Separator />

      {/* Nagłówek faktury */}
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
        <Field label="Data wystawienia" value={formatDate(preview.issueDate)} />
        <Field label="Termin płatności" value={formatDate(preview.dueDate)} />
        {invoice?.saleDate && <Field label="Data sprzedaży" value={formatDate(invoice.saleDate)} />}
        <Field label="Kategoria" value={preview.categoryName ?? "— brak —"} />
        {preview.ksefNumber && <Field label="Numer KSeF" value={preview.ksefNumber} mono />}
        {preview.paymentAccount && (
          <Field label="Rachunek do zapłaty" value={formatBankAccount(preview.paymentAccount)} mono />
        )}
      </dl>

      {/* Pozycje — tylko dla dokumentów z XML-em; PDF i wpis ręczny ich nie mają */}
      {invoice && invoice.lines.length > 0 && (
        <>
          <Separator />
          <div>
            <h3 className="mb-3 text-sm font-medium">Pozycje faktury</h3>
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">#</th>
                    <th className="px-3 py-2 text-left font-medium">Nazwa</th>
                    <th className="px-3 py-2 text-right font-medium">Ilość</th>
                    <th className="px-3 py-2 text-right font-medium">Cena netto</th>
                    <th className="px-3 py-2 text-right font-medium">Wartość netto</th>
                    <th className="px-3 py-2 text-right font-medium">VAT</th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.lines.map((line) => (
                    <tr key={line.no} className="border-t">
                      <td className="text-muted-foreground px-3 py-2 tabular-nums">{line.no}</td>
                      <td className="px-3 py-2">{line.name}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {line.quantity ?? "—"} {line.unit ?? ""}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {line.unitPriceNet !== null ? formatMoney(line.unitPriceNet, invoice.currency) : "—"}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {line.netValue !== null ? formatMoney(line.netValue, invoice.currency) : "—"}
                      </td>
                      <td className="text-muted-foreground px-3 py-2 text-right tabular-nums">
                        {line.vatRate !== null ? `${line.vatRate}%` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      <Separator />

      {/* Podsumowanie kwot */}
      <div className="ml-auto w-full max-w-xs space-y-1.5 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Netto</span>
          <span className="tabular-nums">{formatMoney(preview.netAmount, preview.currency)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">VAT</span>
          <span className="tabular-nums">{formatMoney(preview.vatAmount, preview.currency)}</span>
        </div>
        <Separator />
        <div className="flex justify-between font-medium">
          <span>Do zapłaty</span>
          <span className="tabular-nums">{formatMoney(preview.grossAmount, preview.currency)}</span>
        </div>
      </div>

      {preview.notes && (
        <>
          <Separator />
          <div>
            <h3 className="mb-1.5 text-sm font-medium">Notatki</h3>
            <p className="text-muted-foreground text-sm whitespace-pre-wrap">{preview.notes}</p>
          </div>
        </>
      )}

      {!invoice && preview.source !== "MANUAL" && !preview.pdfFileId && (
        <p className="text-muted-foreground text-xs">
          Dokument nie ma pliku źródłowego — pokazujemy dane zapisane w ewidencji.
        </p>
      )}
    </div>
  );
}

function Party({
  role,
  name,
  nip,
  address,
  highlight,
}: {
  role: string;
  name: string;
  nip: string | null;
  address: string | null;
  highlight?: boolean;
}) {
  return (
    <div className={highlight ? "bg-muted/40 rounded-lg border p-3" : "rounded-lg border p-3"}>
      <p className="text-muted-foreground text-xs">{role}</p>
      <p className="mt-1 font-medium">{name}</p>
      {nip && <p className="text-muted-foreground font-mono text-xs tabular-nums">NIP {nip}</p>}
      {address && <p className="text-muted-foreground mt-1 text-xs">{address}</p>}
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className={mono ? "font-mono text-xs tabular-nums" : "font-medium"}>{value}</dd>
    </div>
  );
}
