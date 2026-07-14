"use client";

import { useActionState, useEffect, useState } from "react";
import { MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  createContractorAction,
  deleteContractorAction,
  updateContractorAction,
} from "@/app/(app)/ustawienia/kontrahenci/actions";
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
import { formatBankAccount } from "@/server/domain/identifiers";
import type { CategoryNode } from "@/server/services/categories";

const NO_CATEGORY = "__none__";

export type ContractorRow = {
  id: string;
  name: string;
  nip: string;
  address: string | null;
  bankAccount: string | null;
  defaultCategoryId: string | null;
  defaultCategoryName: string | null;
  documentCount: number;
};

export function ContractorList({
  contractors,
  categories,
}: {
  contractors: ContractorRow[];
  categories: CategoryNode[];
}) {
  const [editing, setEditing] = useState<ContractorRow | "new" | null>(null);

  return (
    <>
      <div className="rounded-lg border">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <span className="text-muted-foreground text-sm">
            {contractors.length} {contractors.length === 1 ? "kontrahent" : "kontrahentów"}
          </span>
          <Button size="sm" onClick={() => setEditing("new")}>
            <Plus className="size-4" />
            Nowy kontrahent
          </Button>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nazwa</TableHead>
              <TableHead>NIP</TableHead>
              <TableHead>Rachunek</TableHead>
              <TableHead>Kategoria domyślna</TableHead>
              <TableHead className="text-right">Dokumenty</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {contractors.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-muted-foreground py-10 text-center text-sm">
                  Brak kontrahentów. Zostaną też utworzeni automatycznie przy imporcie faktur z KSeF.
                </TableCell>
              </TableRow>
            )}

            {contractors.map((contractor) => (
              <ContractorRowView key={contractor.id} contractor={contractor} onEdit={() => setEditing(contractor)} />
            ))}
          </TableBody>
        </Table>
      </div>

      {editing && (
        <ContractorDialog
          contractor={editing === "new" ? null : editing}
          categories={categories}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

function ContractorRowView({ contractor, onEdit }: { contractor: ContractorRow; onEdit: () => void }) {
  const [state, deleteAction, pending] = useActionState(deleteContractorAction, idleState);

  useEffect(() => {
    if (state.status === "success") toast.success(state.message);
    if (state.status === "error") toast.error(state.message);
  }, [state]);

  return (
    <TableRow>
      <TableCell>
        <div className="font-medium">{contractor.name}</div>
        {contractor.address && <div className="text-muted-foreground text-xs">{contractor.address}</div>}
      </TableCell>
      <TableCell className="font-mono text-sm tabular-nums">{contractor.nip}</TableCell>
      <TableCell className="font-mono text-xs tabular-nums">
        {contractor.bankAccount ? formatBankAccount(contractor.bankAccount) : <span className="text-muted-foreground">—</span>}
      </TableCell>
      <TableCell>
        {contractor.defaultCategoryName ? (
          <Badge variant="secondary">{contractor.defaultCategoryName}</Badge>
        ) : (
          <span className="text-muted-foreground text-sm">— brak reguły —</span>
        )}
      </TableCell>
      <TableCell className="text-right text-sm tabular-nums">{contractor.documentCount}</TableCell>
      <TableCell>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" aria-label={`Akcje dla „${contractor.name}”`}>
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
              disabled={pending}
              onSelect={(event) => {
                event.preventDefault();
                const formData = new FormData();
                formData.set("id", contractor.id);
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

function ContractorDialog({
  contractor,
  categories,
  onClose,
}: {
  contractor: ContractorRow | null;
  categories: CategoryNode[];
  onClose: () => void;
}) {
  const action = contractor ? updateContractorAction : createContractorAction;
  const [state, submit, pending] = useActionState(action, idleState);

  useEffect(() => {
    if (state.status === "success") {
      toast.success(state.message);
      onClose();
    }
    if (state.status === "error") toast.error(state.message);
  }, [state, onClose]);

  const invalid = (field: string) => state.status === "error" && state.field === field;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <form action={submit}>
          <DialogHeader>
            <DialogTitle>{contractor ? "Edytuj kontrahenta" : "Nowy kontrahent"}</DialogTitle>
            <DialogDescription>
              NIP i numer rachunku są sprawdzane sumą kontrolną — literówka nie przejdzie.
            </DialogDescription>
          </DialogHeader>

          {contractor && <input type="hidden" name="id" value={contractor.id} />}

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="contractor-name">Nazwa</Label>
              <Input
                id="contractor-name"
                name="name"
                defaultValue={contractor?.name ?? ""}
                placeholder="np. Kartoniaki Sp. z o.o."
                required
                autoFocus
                aria-invalid={invalid("name")}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="contractor-nip">NIP</Label>
              <Input
                id="contractor-nip"
                name="nip"
                defaultValue={contractor?.nip ?? ""}
                placeholder="5252248481"
                inputMode="numeric"
                required
                aria-invalid={invalid("nip")}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="contractor-address">Adres</Label>
              <Input
                id="contractor-address"
                name="address"
                defaultValue={contractor?.address ?? ""}
                placeholder="ul. Tekturowa 12, 31-042 Kraków"
                aria-invalid={invalid("address")}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="contractor-account">Numer rachunku</Label>
              <Input
                id="contractor-account"
                name="bankAccount"
                defaultValue={contractor?.bankAccount ?? ""}
                placeholder="61 1090 1014 0000 0712 1981 2874"
                aria-invalid={invalid("bankAccount")}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="contractor-category">Kategoria domyślna (reguła auto-kategoryzacji)</Label>
              <Select name="defaultCategoryId" defaultValue={contractor?.defaultCategoryId ?? NO_CATEGORY}>
                <SelectTrigger id="contractor-category" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_CATEGORY}>— brak reguły —</SelectItem>
                  {categories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.path}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-muted-foreground text-xs">
                Każdy nowy dokument tego kontrahenta zostanie automatycznie przypisany do wskazanej kategorii.
              </p>
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
