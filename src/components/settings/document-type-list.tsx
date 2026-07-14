"use client";

import { useActionState, useEffect, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Lock, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  createDocumentTypeAction,
  deleteDocumentTypeAction,
  updateDocumentTypeAction,
} from "@/app/(app)/ustawienia/typy-dokumentow/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { idleState } from "@/lib/action-state";

export type DocumentTypeRow = {
  id: string;
  name: string;
  direction: "RECEIVABLE" | "PAYABLE";
  isSystem: boolean;
  documentCount: number;
};

export function DirectionBadge({ direction }: { direction: "RECEIVABLE" | "PAYABLE" }) {
  return direction === "RECEIVABLE" ? (
    <Badge variant="outline" className="border-emerald-600/30 text-emerald-700 dark:text-emerald-400">
      <ArrowDownLeft className="size-3" />
      Należność
    </Badge>
  ) : (
    <Badge variant="outline" className="border-amber-600/30 text-amber-700 dark:text-amber-400">
      <ArrowUpRight className="size-3" />
      Zobowiązanie
    </Badge>
  );
}

export function DocumentTypeList({ types }: { types: DocumentTypeRow[] }) {
  const [editing, setEditing] = useState<DocumentTypeRow | "new" | null>(null);

  return (
    <>
      <div className="rounded-lg border">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <span className="text-muted-foreground text-sm">
            {types.length} {types.length === 1 ? "typ" : "typów"}
          </span>
          <Button size="sm" onClick={() => setEditing("new")}>
            <Plus className="size-4" />
            Nowy typ
          </Button>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nazwa</TableHead>
              <TableHead>Kierunek</TableHead>
              <TableHead className="text-right">Dokumenty</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {types.map((type) => (
              <TypeRow key={type.id} type={type} onEdit={() => setEditing(type)} />
            ))}
          </TableBody>
        </Table>
      </div>

      {editing && <TypeDialog type={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function TypeRow({ type, onEdit }: { type: DocumentTypeRow; onEdit: () => void }) {
  const [state, deleteAction, pending] = useActionState(deleteDocumentTypeAction, idleState);

  useEffect(() => {
    if (state.status === "success") toast.success(state.message);
    if (state.status === "error") toast.error(state.message);
  }, [state]);

  return (
    <TableRow>
      <TableCell>
        <div className="flex items-center gap-2">
          <span className="font-medium">{type.name}</span>
          {type.isSystem && (
            <span
              className="text-muted-foreground flex items-center gap-1 text-xs"
              title="Typ systemowy — używany przez import z KSeF, nie można go usunąć"
            >
              <Lock className="size-3" />
              systemowy
            </span>
          )}
        </div>
      </TableCell>
      <TableCell>
        <DirectionBadge direction={type.direction} />
      </TableCell>
      <TableCell className="text-right text-sm tabular-nums">{type.documentCount}</TableCell>
      <TableCell>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" aria-label={`Akcje dla „${type.name}”`}>
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={onEdit}>
              <Pencil className="size-4" />
              Edytuj
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              disabled={pending || type.isSystem}
              onSelect={(event) => {
                event.preventDefault();
                const formData = new FormData();
                formData.set("id", type.id);
                deleteAction(formData);
              }}
            >
              <Trash2 className="size-4" />
              Usuń
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}

function TypeDialog({ type, onClose }: { type: DocumentTypeRow | null; onClose: () => void }) {
  const action = type ? updateDocumentTypeAction : createDocumentTypeAction;
  const [state, submit, pending] = useActionState(action, idleState);

  useEffect(() => {
    if (state.status === "success") {
      toast.success(state.message);
      onClose();
    }
    if (state.status === "error") toast.error(state.message);
  }, [state, onClose]);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <form action={submit}>
          <DialogHeader>
            <DialogTitle>{type ? "Edytuj typ dokumentu" : "Nowy typ dokumentu"}</DialogTitle>
            <DialogDescription>
              Kierunek decyduje, czy dokument jest należnością, czy zobowiązaniem.
            </DialogDescription>
          </DialogHeader>

          {type && <input type="hidden" name="id" value={type.id} />}

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="type-name">Nazwa</Label>
              <Input
                id="type-name"
                name="name"
                defaultValue={type?.name ?? ""}
                placeholder="np. Nota odsetkowa"
                required
                autoFocus
                aria-invalid={state.status === "error" && state.field === "name"}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="type-direction">Kierunek</Label>
              {/*
                Pole wyłączone nie trafia do FormData — dlatego dla typu systemowego kierunek
                jedzie ukrytym inputem, a Select jest tylko podglądem (bez atrybutu `name`,
                żeby nie wysłać wartości dwa razy).
              */}
              {type?.isSystem && <input type="hidden" name="direction" value={type.direction} />}
              <Select
                name={type?.isSystem ? undefined : "direction"}
                defaultValue={type?.direction ?? "PAYABLE"}
                disabled={type?.isSystem}
              >
                <SelectTrigger id="type-direction" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PAYABLE">Zobowiązanie — do zapłaty (koszt)</SelectItem>
                  <SelectItem value="RECEIVABLE">Należność — do otrzymania (sprzedaż)</SelectItem>
                </SelectContent>
              </Select>
              {type?.isSystem && (
                <p className="text-muted-foreground text-xs">
                  Kierunku typu systemowego nie można zmienić — opiera się na nim import z KSeF.
                </p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Anuluj
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Zapisywanie…" : "Zapisz"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
