"use client";

import { useActionState, useEffect, useState } from "react";
import { ChevronRight, FolderPlus, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
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
import { idleState } from "@/lib/action-state";
import { cn } from "@/lib/utils";
import type { CategoryNode } from "@/server/services/categories";
import { createCategoryAction, deleteCategoryAction, updateCategoryAction } from "@/app/(app)/ustawienia/kategorie/actions";

const NO_PARENT = "__root__";

type DialogState =
  | { mode: "create"; parentId: string | null }
  | { mode: "edit"; category: CategoryNode }
  | null;

export function CategoryTree({ tree, options }: { tree: CategoryNode[]; options: CategoryNode[] }) {
  const [dialog, setDialog] = useState<DialogState>(null);

  return (
    <>
      <div className="rounded-lg border">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <span className="text-muted-foreground text-sm">
            {options.length} {options.length === 1 ? "kategoria" : "kategorii"}
          </span>
          <Button size="sm" onClick={() => setDialog({ mode: "create", parentId: null })}>
            <Plus className="size-4" />
            Nowa kategoria główna
          </Button>
        </div>

        {tree.length === 0 ? (
          <p className="text-muted-foreground px-4 py-10 text-center text-sm">
            Brak kategorii. Zacznij od utworzenia kategorii głównej.
          </p>
        ) : (
          <ul>
            {tree.map((node) => (
              <CategoryRow key={node.id} node={node} onAction={setDialog} />
            ))}
          </ul>
        )}
      </div>

      <CategoryDialog state={dialog} options={options} onClose={() => setDialog(null)} />
    </>
  );
}

function CategoryRow({ node, onAction }: { node: CategoryNode; onAction: (state: DialogState) => void }) {
  const [deleteState, deleteAction, deleting] = useActionState(deleteCategoryAction, idleState);

  useEffect(() => {
    if (deleteState.status === "success") toast.success(deleteState.message);
    if (deleteState.status === "error") toast.error(deleteState.message);
  }, [deleteState]);

  return (
    <li>
      <div
        className="hover:bg-muted/50 group flex items-center gap-2 border-b px-4 py-2.5 last:border-b-0"
        style={{ paddingLeft: `${node.depth * 24 + 16}px` }}
      >
        {node.depth > 0 && <ChevronRight className="text-muted-foreground/50 size-3.5 shrink-0" aria-hidden />}

        <span className="text-sm font-medium">{node.name}</span>

        {node.documentCount > 0 && (
          <span className="text-muted-foreground text-xs tabular-nums">
            {node.documentCount} {node.documentCount === 1 ? "dokument" : "dok."}
          </span>
        )}

        <div className="ml-auto flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onAction({ mode: "create", parentId: node.id })}
            aria-label={`Dodaj podkategorię do „${node.name}”`}
          >
            <FolderPlus className="size-4" />
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" aria-label={`Akcje dla „${node.name}”`}>
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => onAction({ mode: "edit", category: node })}>
                <Pencil className="size-4" />
                Edytuj
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                disabled={deleting}
                onSelect={(event) => {
                  event.preventDefault();
                  const formData = new FormData();
                  formData.set("id", node.id);
                  deleteAction(formData);
                }}
              >
                <Trash2 className="size-4" />
                Usuń
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {node.children.length > 0 && (
        <ul>
          {node.children.map((child) => (
            <CategoryRow key={child.id} node={child} onAction={onAction} />
          ))}
        </ul>
      )}
    </li>
  );
}

function CategoryDialog({
  state,
  options,
  onClose,
}: {
  state: DialogState;
  options: CategoryNode[];
  onClose: () => void;
}) {
  const editing = state?.mode === "edit";
  const action = editing ? updateCategoryAction : createCategoryAction;
  const [result, submit, pending] = useActionState(action, idleState);

  useEffect(() => {
    if (result.status === "success") {
      toast.success(result.message);
      onClose();
    }
    if (result.status === "error") toast.error(result.message);
  }, [result, onClose]);

  if (!state) return null;

  const defaultParent =
    state.mode === "edit" ? (state.category.parentId ?? NO_PARENT) : (state.parentId ?? NO_PARENT);

  // Kategoria nie może stać się własnym potomkiem — usuwamy z listy rodziców
  // ją samą i całe jej poddrzewo. Serwis pilnuje tego niezależnie, ale UI nie powinno
  // w ogóle podsuwać opcji, która i tak zostanie odrzucona.
  const forbidden = state.mode === "edit" ? collectSubtreeIds(state.category) : new Set<string>();
  const parentOptions = options.filter((option) => !forbidden.has(option.id));

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <form action={submit}>
          <DialogHeader>
            <DialogTitle>{editing ? "Edytuj kategorię" : "Nowa kategoria"}</DialogTitle>
            <DialogDescription>
              {editing
                ? "Zmień nazwę lub przenieś kategorię w inne miejsce drzewa."
                : "Kategoria bez rodzica staje się kategorią główną."}
            </DialogDescription>
          </DialogHeader>

          {editing && <input type="hidden" name="id" value={state.category.id} />}

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="category-name">Nazwa</Label>
              <Input
                id="category-name"
                name="name"
                defaultValue={editing ? state.category.name : ""}
                placeholder="np. Opakowania"
                autoFocus
                required
                aria-invalid={result.status === "error" && result.field === "name"}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="category-parent">Kategoria nadrzędna</Label>
              <Select name="parentId" defaultValue={defaultParent}>
                <SelectTrigger id="category-parent" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_PARENT}>— brak (kategoria główna) —</SelectItem>
                  {parentOptions.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      <span className={cn(option.depth > 0 && "text-muted-foreground")}>{option.path}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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

function collectSubtreeIds(node: CategoryNode): Set<string> {
  const ids = new Set<string>([node.id]);
  const walk = (current: CategoryNode) => {
    for (const child of current.children) {
      ids.add(child.id);
      walk(child);
    }
  };
  walk(node);
  return ids;
}
