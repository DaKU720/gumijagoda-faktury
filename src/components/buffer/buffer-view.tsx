"use client";

import { useMemo, useState, useTransition } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Check, Download, Inbox, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { acceptAction, rejectAction } from "@/app/(app)/bufor/actions";
import { documentColumns } from "@/components/documents/columns";
import { DocumentsTable, Pagination } from "@/components/documents/documents-table";
import { KsefFetchDialog } from "@/components/ksef/ksef-fetch-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { UploadDialog } from "@/components/upload/upload-dialog";
import type { DocumentRow } from "@/server/services/document-rows";

/**
 * Bufor: przegląd i akceptacja.
 *
 * Zaznaczanie wierszy trzymamy w zwykłym `Set` w stanie komponentu, a nie w TanStack Table —
 * akcje zbiorcze potrzebują tylko listy identyfikatorów, a nie całego modelu selekcji tabeli.
 */
export function BufferView({
  rows,
  total,
  page,
  pageCount,
  types,
  contractors,
  categories,
  ksefMode,
}: {
  rows: DocumentRow[];
  total: number;
  page: number;
  pageCount: number;
  types: { id: string; name: string; direction: "RECEIVABLE" | "PAYABLE" }[];
  contractors: { id: string; name: string }[];
  categories: { id: string; path: string }[];
  ksefMode: "mock" | "real";
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<"upload" | "ksef" | null>(null);
  const [pending, startTransition] = useTransition();

  const allSelected = rows.length > 0 && rows.every((row) => selected.has(row.id));

  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(rows.map((row) => row.id)));
  };

  const toggleOne = (id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const runBulk = (action: typeof acceptAction, ids: string[]) => {
    const formData = new FormData();
    for (const id of ids) formData.append("ids", id);

    startTransition(async () => {
      const result = await action({ status: "idle" }, formData);

      if (result.status === "success") {
        toast.success(result.message);
        setSelected(new Set());
      }
      if (result.status === "error") toast.error(result.message);
    });
  };

  // Kolumna zaznaczenia z przodu, akcje na końcu — reszta kolumn wspólna z rejestrem.
  const columns = useMemo<ColumnDef<DocumentRow>[]>(
    () => [
      {
        id: "select",
        header: () => (
          <Checkbox checked={allSelected} onCheckedChange={toggleAll} aria-label="Zaznacz wszystkie" />
        ),
        cell: ({ row }) => (
          <div onClick={(event) => event.stopPropagation()}>
            <Checkbox
              checked={selected.has(row.original.id)}
              onCheckedChange={() => toggleOne(row.original.id)}
              aria-label={`Zaznacz dokument ${row.original.number}`}
            />
          </div>
        ),
      },
      ...documentColumns,
      {
        id: "actions",
        header: () => <span className="sr-only">Akcje</span>,
        cell: ({ row }) => (
          <div className="flex justify-end gap-1" onClick={(event) => event.stopPropagation()}>
            <Button
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() => runBulk(acceptAction, [row.original.id])}
              aria-label={`Akceptuj dokument ${row.original.number}`}
            >
              <Check className="size-4 text-emerald-600" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() => runBulk(rejectAction, [row.original.id])}
              aria-label={`Odrzuć dokument ${row.original.number}`}
            >
              <X className="text-destructive size-4" />
            </Button>
          </div>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selected, allSelected, pending, rows],
  );

  const columnOrder = ["select", ...documentColumns.map((column) => column.id!), "actions"];

  // W buforze ważne jest, skąd dokument przyszedł i czy ma załącznik — nie interesuje nas
  // tu rozbicie na netto/VAT ani rachunek. Rejestr pokazuje to na życzenie, bufor ma być szybki.
  const visibility = {
    direction: false,
    netAmount: false,
    vatAmount: false,
    paymentAccount: false,
    ksefNumber: false,
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Bufor</h1>
          <p className="text-muted-foreground mt-1 max-w-2xl text-sm">
            Poczekalnia dla faktur pobranych z KSeF i wgranych z plików. Zaakceptowane trafiają do rejestru;
            odrzucone zostają zapamiętane, żeby nie wróciły przy kolejnym pobraniu.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setDialog("upload")}>
            <Upload className="size-4" />
            Wgraj plik
          </Button>
          <Button size="sm" onClick={() => setDialog("ksef")}>
            <Download className="size-4" />
            Pobierz z KSeF
          </Button>
        </div>
      </div>

      {selected.size > 0 && (
        <div className="bg-muted/50 flex items-center gap-3 rounded-lg border px-4 py-2.5">
          <span className="text-sm font-medium">
            Zaznaczono {selected.size} {selected.size === 1 ? "dokument" : "dokumentów"}
          </span>

          <div className="ml-auto flex gap-2">
            <Button size="sm" disabled={pending} onClick={() => runBulk(acceptAction, [...selected])}>
              <Check className="size-4" />
              Akceptuj i przenieś do rejestru
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => runBulk(rejectAction, [...selected])}
            >
              <X className="size-4" />
              Odrzuć
            </Button>
          </div>
        </div>
      )}

      {rows.length === 0 && total === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-16 text-center">
          <Inbox className="text-muted-foreground size-8" />
          <div>
            <p className="font-medium">Bufor jest pusty</p>
            <p className="text-muted-foreground mt-1 text-sm">
              Pobierz faktury z KSeF albo wgraj plik, żeby zobaczyć je tutaj przed wpuszczeniem do rejestru.
            </p>
          </div>
        </div>
      ) : (
        <>
          <DocumentsTable
            rows={rows}
            columns={columns}
            visibility={visibility}
            order={columnOrder}
            emptyMessage="Brak dokumentów w buforze."
          />
          <Pagination page={page} pageCount={pageCount} total={total} />
        </>
      )}

      {dialog === "upload" && (
        <UploadDialog options={{ types, contractors, categories }} onClose={() => setDialog(null)} />
      )}
      {dialog === "ksef" && <KsefFetchDialog mode={ksefMode} onClose={() => setDialog(null)} />}
    </div>
  );
}
