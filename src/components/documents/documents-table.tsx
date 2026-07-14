"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import type { ColumnDef, ColumnOrderState, VisibilityState } from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { DocumentRow } from "@/server/services/document-rows";

/** Kolumny, po których wolno sortować — muszą mieć odpowiednik w indeksie bazy. */
const sortableColumns: Record<string, string> = {
  number: "number",
  issueDate: "issueDate",
  dueDate: "dueDate",
  grossAmount: "grossAmount",
};

/**
 * Tabela rejestru.
 *
 * Sortowanie i paginacja są SERWEROWE (parametry w URL), więc TanStack Table dostaje
 * `manualSorting` i `manualPagination` — jego zadaniem jest tu wyłącznie renderowanie,
 * konfiguracja kolumn i ich kolejność. Gdyby sortował sam, sortowałby jedynie 25 wierszy
 * bieżącej strony, a użytkownik dostałby wynik, który wygląda poprawnie i taki nie jest.
 */
export function DocumentsTable({
  rows,
  columns,
  visibility,
  order,
  onRowClick,
  emptyMessage,
}: {
  rows: DocumentRow[];
  columns: ColumnDef<DocumentRow>[];
  visibility: VisibilityState;
  order: ColumnOrderState;
  onRowClick?: (document: DocumentRow) => void;
  emptyMessage: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const sortField = searchParams.get("sortuj") ?? "issueDate";
  const sortDirection = searchParams.get("kierunek") ?? "desc";

  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualSorting: true,
    manualPagination: true,
    state: { columnVisibility: visibility, columnOrder: order },
  });

  const toggleSort = (columnId: string) => {
    const field = sortableColumns[columnId];
    if (!field) return;

    const params = new URLSearchParams(searchParams);
    const nextDirection = sortField === field && sortDirection === "desc" ? "asc" : "desc";

    params.set("sortuj", field);
    params.set("kierunek", nextDirection);
    params.delete("strona");

    router.push(`?${params.toString()}`, { scroll: false });
  };

  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => {
                const field = sortableColumns[header.column.id];
                const active = field === sortField;

                return (
                  <TableHead key={header.id} className="whitespace-nowrap">
                    {field ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(header.column.id)}
                        className={cn(
                          "hover:text-foreground -mx-1 flex items-center gap-1 rounded px-1 py-0.5 transition-colors",
                          active && "text-foreground font-medium",
                        )}
                        aria-label={`Sortuj po: ${header.column.id}`}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {active ? (
                          sortDirection === "asc" ? (
                            <ArrowUp className="size-3.5" />
                          ) : (
                            <ArrowDown className="size-3.5" />
                          )
                        ) : (
                          <ChevronsUpDown className="size-3.5 opacity-40" />
                        )}
                      </button>
                    ) : (
                      flexRender(header.column.columnDef.header, header.getContext())
                    )}
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>

        <TableBody>
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={table.getVisibleFlatColumns().length} className="py-16 text-center">
                <p className="text-muted-foreground text-sm">{emptyMessage}</p>
              </TableCell>
            </TableRow>
          )}

          {table.getRowModel().rows.map((row) => (
            <TableRow
              key={row.id}
              onClick={() => onRowClick?.(row.original)}
              className={cn(onRowClick && "hover:bg-muted/50 cursor-pointer")}
            >
              {row.getVisibleCells().map((cell) => (
                <TableCell key={cell.id} className="whitespace-nowrap">
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/** Paginacja serwerowa — numer strony jedzie w query stringu. */
export function Pagination({ page, pageCount, total }: { page: number; pageCount: number; total: number }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const goTo = (target: number) => {
    const params = new URLSearchParams(searchParams);
    if (target <= 1) {
      params.delete("strona");
    } else {
      params.set("strona", String(target));
    }
    router.push(`?${params.toString()}`, { scroll: false });
  };

  return (
    <div className="flex items-center justify-between">
      <p className="text-muted-foreground text-sm">
        {total === 0 ? "Brak wyników" : `${total} ${total === 1 ? "dokument" : "dokumentów"}`}
        {pageCount > 1 && ` · strona ${page} z ${pageCount}`}
      </p>

      {pageCount > 1 && (
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => goTo(page - 1)}>
            Poprzednia
          </Button>
          <Button variant="outline" size="sm" disabled={page >= pageCount} onClick={() => goTo(page + 1)}>
            Następna
          </Button>
        </div>
      )}
    </div>
  );
}
