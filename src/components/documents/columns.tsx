"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { FileCode2, FileText, Paperclip } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { DirectionBadge } from "@/components/settings/document-type-list";
import { formatDate, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { DocumentRow } from "@/server/services/document-rows";

const sourceLabels: Record<DocumentRow["source"], string> = {
  KSEF: "KSeF",
  UPLOAD: "Upload",
  MANUAL: "Ręczny",
};

/**
 * Definicja kolumn rejestru.
 *
 * `id` każdej kolumny jest stabilnym identyfikatorem — po nim zapisujemy w localStorage
 * widoczność i kolejność. Zmiana nazwy kolumny w UI nie może zresetować użytkownikowi
 * jego układu, dlatego identyfikatory są niezależne od etykiet.
 */
export const documentColumns: ColumnDef<DocumentRow>[] = [
  {
    id: "number",
    accessorKey: "number",
    header: "Numer",
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        <span className="font-medium">{row.original.number}</span>
        {(row.original.hasPdf || row.original.hasXml) && (
          <span className="text-muted-foreground flex items-center gap-0.5" title="Dokument ma załącznik">
            {row.original.hasPdf && <FileText className="size-3.5" />}
            {row.original.hasXml && <FileCode2 className="size-3.5" />}
          </span>
        )}
      </div>
    ),
  },
  {
    id: "type",
    accessorKey: "typeName",
    header: "Typ",
    cell: ({ row }) => <span className="text-sm">{row.original.typeName}</span>,
  },
  {
    id: "direction",
    accessorKey: "direction",
    header: "Kierunek",
    cell: ({ row }) => <DirectionBadge direction={row.original.direction} />,
  },
  {
    id: "contractor",
    accessorKey: "contractorName",
    header: "Kontrahent",
    cell: ({ row }) => (
      <div>
        <div className="text-sm font-medium">{row.original.contractorName}</div>
        <div className="text-muted-foreground font-mono text-xs tabular-nums">{row.original.contractorNip}</div>
      </div>
    ),
  },
  {
    id: "category",
    accessorKey: "categoryName",
    header: "Kategoria",
    cell: ({ row }) =>
      row.original.categoryName ? (
        <Badge variant="secondary">{row.original.categoryName}</Badge>
      ) : (
        <span className="text-muted-foreground text-sm">—</span>
      ),
  },
  {
    id: "issueDate",
    accessorKey: "issueDate",
    header: "Data wystawienia",
    cell: ({ row }) => <span className="text-sm tabular-nums">{formatDate(row.original.issueDate)}</span>,
  },
  {
    id: "dueDate",
    accessorKey: "dueDate",
    header: "Termin płatności",
    cell: ({ row }) => <DueDateCell document={row.original} />,
  },
  {
    id: "netAmount",
    accessorKey: "netAmount",
    header: () => <div className="text-right">Netto</div>,
    cell: ({ row }) => (
      <div className="text-right text-sm tabular-nums">
        {formatMoney(row.original.netAmount, row.original.currency)}
      </div>
    ),
  },
  {
    id: "vatAmount",
    accessorKey: "vatAmount",
    header: () => <div className="text-right">VAT</div>,
    cell: ({ row }) => (
      <div className="text-muted-foreground text-right text-sm tabular-nums">
        {formatMoney(row.original.vatAmount, row.original.currency)}
      </div>
    ),
  },
  {
    id: "grossAmount",
    accessorKey: "grossAmount",
    header: () => <div className="text-right">Brutto</div>,
    cell: ({ row }) => (
      <div className="text-right text-sm font-medium tabular-nums">
        {formatMoney(row.original.grossAmount, row.original.currency)}
      </div>
    ),
  },
  {
    id: "source",
    accessorKey: "source",
    header: "Źródło",
    cell: ({ row }) => (
      <Badge variant="outline" className="gap-1 font-normal">
        {row.original.source === "UPLOAD" && <Paperclip className="size-3" />}
        {sourceLabels[row.original.source]}
      </Badge>
    ),
  },
  {
    id: "ksefNumber",
    accessorKey: "ksefNumber",
    header: "Numer KSeF",
    cell: ({ row }) =>
      row.original.ksefNumber ? (
        <span className="font-mono text-xs">{row.original.ksefNumber}</span>
      ) : (
        <span className="text-muted-foreground text-sm">—</span>
      ),
  },
  {
    id: "paymentAccount",
    accessorKey: "paymentAccount",
    header: "Rachunek do zapłaty",
    cell: ({ row }) =>
      row.original.paymentAccount ? (
        <span className="font-mono text-xs tabular-nums">{row.original.paymentAccount}</span>
      ) : (
        <span className="text-muted-foreground text-sm">—</span>
      ),
  },
];

/** Etykiety kolumn dla menu „Kolumny” — trzymane osobno, bo część nagłówków to komponenty. */
export const columnLabels: Record<string, string> = {
  number: "Numer",
  type: "Typ",
  direction: "Kierunek",
  contractor: "Kontrahent",
  category: "Kategoria",
  issueDate: "Data wystawienia",
  dueDate: "Termin płatności",
  netAmount: "Netto",
  vatAmount: "VAT",
  grossAmount: "Brutto",
  source: "Źródło",
  ksefNumber: "Numer KSeF",
  paymentAccount: "Rachunek do zapłaty",
};

/** Kolumny widoczne na start — reszta czeka w menu „Kolumny”, żeby nie zalać użytkownika. */
export const defaultColumnVisibility: Record<string, boolean> = {
  direction: false,
  netAmount: false,
  vatAmount: false,
  ksefNumber: false,
  paymentAccount: false,
};

export const defaultColumnOrder = documentColumns.map((column) => column.id!);

/**
 * Termin płatności z informacją o zaległości. Faktura po terminie to jedyna rzecz,
 * którą księgowa chce zobaczyć od razu, bez wczytywania się w daty.
 */
function DueDateCell({ document }: { document: DocumentRow }) {
  if (!document.dueDate) return <span className="text-muted-foreground text-sm">—</span>;

  const due = new Date(document.dueDate);
  due.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((due.getTime() - today.getTime()) / 86_400_000);

  // Zaległości oznaczamy tylko dla zobowiązań — przy należnościach "po terminie" znaczy
  // co innego (to kontrahent nam zalega) i nie chcemy tego mieszać w jednej kolumnie.
  const overdue = days < 0 && document.direction === "PAYABLE";

  return (
    <span className={cn("text-sm tabular-nums", overdue && "text-destructive font-medium")}>
      {formatDate(document.dueDate)}
      {overdue && <span className="ml-1.5 text-xs">({Math.abs(days)} dni po terminie)</span>}
    </span>
  );
}
