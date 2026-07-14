"use client";

import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Eye, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteDocumentAction } from "@/app/(app)/dokumenty/actions";
import { ColumnSettings } from "@/components/documents/column-settings";
import { documentColumns } from "@/components/documents/columns";
import { DocumentFilters } from "@/components/documents/document-filters";
import { DocumentForm } from "@/components/documents/document-form";
import { DocumentsTable, Pagination } from "@/components/documents/documents-table";
import { useTablePreferences } from "@/components/documents/use-table-preferences";
import { DocumentPreview } from "@/components/preview/document-preview";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { DocumentRow } from "@/server/services/document-rows";

export function DocumentsView({
  rows,
  total,
  page,
  pageCount,
  types,
  contractors,
  categories,
}: {
  rows: DocumentRow[];
  total: number;
  page: number;
  pageCount: number;
  types: { id: string; name: string; direction: "RECEIVABLE" | "PAYABLE" }[];
  contractors: { id: string; name: string }[];
  categories: { id: string; path: string }[];
}) {
  const [editing, setEditing] = useState<DocumentRow | "new" | null>(null);
  const [previewing, setPreviewing] = useState<string | null>(null);
  const preferences = useTablePreferences("documents-table-v1");

  // Kolumna akcji dołączana tutaj, a nie w definicji kolumn: potrzebuje dostępu do stanu
  // widoku (otwieranie formularza, podglądu), a `columns.tsx` ma zostać czystą deklaracją prezentacji.
  const columns = useMemo<ColumnDef<DocumentRow>[]>(
    () => [
      ...documentColumns,
      {
        id: "actions",
        enableHiding: false,
        header: () => <span className="sr-only">Akcje</span>,
        cell: ({ row }) => (
          <RowActions
            document={row.original}
            onEdit={() => setEditing(row.original)}
            onPreview={() => setPreviewing(row.original.id)}
          />
        ),
      },
    ],
    [],
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Rejestr dokumentów</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Zaakceptowane faktury i noty — pobrane z KSeF, wgrane z pliku lub dodane ręcznie.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <ColumnSettings
            visibility={preferences.visibility}
            setVisibility={preferences.setVisibility}
            order={preferences.order}
            moveColumn={preferences.moveColumn}
            reset={preferences.reset}
          />
          <Button size="sm" onClick={() => setEditing("new")}>
            <Plus className="size-4" />
            Nowy dokument
          </Button>
        </div>
      </div>

      <DocumentFilters options={{ types, contractors, categories }} />

      <DocumentsTable
        rows={rows}
        columns={columns}
        visibility={preferences.visibility}
        order={[...preferences.order, "actions"]}
        onRowClick={(document) => setPreviewing(document.id)}
        emptyMessage={
          total === 0 && rows.length === 0
            ? "Brak dokumentów spełniających kryteria. Zmień filtry albo dodaj dokument."
            : "Brak dokumentów."
        }
      />

      <Pagination page={page} pageCount={pageCount} total={total} />

      {editing && (
        <DocumentForm
          document={editing === "new" ? null : editing}
          options={{ types, contractors, categories }}
          onClose={() => setEditing(null)}
        />
      )}

      {previewing && <DocumentPreview documentId={previewing} onClose={() => setPreviewing(null)} />}
    </div>
  );
}

function RowActions({
  document,
  onEdit,
  onPreview,
}: {
  document: DocumentRow;
  onEdit: () => void;
  onPreview: () => void;
}) {
  const [deleting, setDeleting] = useState(false);

  const remove = async () => {
    setDeleting(true);
    const formData = new FormData();
    formData.set("id", document.id);

    const result = await deleteDocumentAction({ status: "idle" }, formData);

    if (result.status === "success") toast.success(result.message);
    if (result.status === "error") toast.error(result.message);
    setDeleting(false);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild onClick={(event) => event.stopPropagation()}>
        <Button variant="ghost" size="sm" aria-label={`Akcje dla dokumentu ${document.number}`}>
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={onPreview}>
          <Eye className="size-4" />
          Podgląd
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onEdit}>
          <Pencil className="size-4" />
          Edytuj
        </DropdownMenuItem>
        <DropdownMenuItem
          variant="destructive"
          disabled={deleting}
          onSelect={(event) => {
            event.preventDefault();
            void remove();
          }}
        >
          <Trash2 className="size-4" />
          Usuń
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
