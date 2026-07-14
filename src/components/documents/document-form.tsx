"use client";

import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import { createDocumentAction, updateDocumentAction } from "@/app/(app)/dokumenty/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { idleState } from "@/lib/action-state";
import { toDateInput } from "@/lib/format";
import type { DocumentRow } from "@/server/services/document-rows";

const NO_CATEGORY = "__none__";

export type FormOptions = {
  types: { id: string; name: string }[];
  contractors: { id: string; name: string }[];
  categories: { id: string; path: string }[];
};

export function DocumentForm({
  document,
  options,
  onClose,
}: {
  document: DocumentRow | null;
  options: FormOptions;
  onClose: () => void;
}) {
  const action = document ? updateDocumentAction : createDocumentAction;
  const [state, submit, pending] = useActionState(action, idleState);

  // Brutto liczymy w locie z netto i VAT, ale zostawiamy pole edytowalne: przy fakturach
  // z zagranicy albo przy zaokrągleniach kwota bywa o grosz inna, a serwer i tak sprawdza
  // (netto + VAT = brutto) z tolerancją pół grosza.
  const [net, setNet] = useState(document?.netAmount ?? "");
  const [vat, setVat] = useState(document?.vatAmount ?? "");
  const [gross, setGross] = useState(document?.grossAmount ?? "");
  const [grossTouched, setGrossTouched] = useState(false);

  useEffect(() => {
    if (grossTouched) return;
    const sum = Number(net || 0) + Number(vat || 0);
    if (Number.isFinite(sum) && (net !== "" || vat !== "")) setGross(sum.toFixed(2));
  }, [net, vat, grossTouched]);

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
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <form action={submit}>
          <DialogHeader>
            <DialogTitle>{document ? `Edytuj dokument ${document.number}` : "Nowy dokument"}</DialogTitle>
            <DialogDescription>
              {document
                ? "Zmiany zapisują się w rejestrze."
                : "Dokument dodany ręcznie trafia od razu do rejestru — nie wymaga akceptacji w buforze."}
            </DialogDescription>
          </DialogHeader>

          {document && <input type="hidden" name="id" value={document.id} />}

          <div className="grid gap-4 py-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="doc-number">Numer dokumentu</Label>
              <Input
                id="doc-number"
                name="number"
                defaultValue={document?.number ?? ""}
                placeholder="FV/2026/07/001"
                required
                autoFocus
                aria-invalid={invalid("number")}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="doc-type">Typ dokumentu</Label>
              <Select name="typeId" defaultValue={document?.typeId ?? options.types[0]?.id}>
                <SelectTrigger id="doc-type" className="w-full">
                  <SelectValue placeholder="Wybierz typ" />
                </SelectTrigger>
                <SelectContent>
                  {options.types.map((type) => (
                    <SelectItem key={type.id} value={type.id}>
                      {type.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="doc-contractor">Kontrahent</Label>
              <Select name="contractorId" defaultValue={document?.contractorId}>
                <SelectTrigger id="doc-contractor" className="w-full">
                  <SelectValue placeholder="Wybierz kontrahenta" />
                </SelectTrigger>
                <SelectContent>
                  {options.contractors.map((contractor) => (
                    <SelectItem key={contractor.id} value={contractor.id}>
                      {contractor.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-muted-foreground text-xs">
                Nowego kontrahenta dodasz w Ustawieniach. Jeśli ma ustawioną kategorię domyślną, zostanie ona
                przypisana automatycznie.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="doc-issue">Data wystawienia</Label>
              <Input
                id="doc-issue"
                name="issueDate"
                type="date"
                defaultValue={toDateInput(document?.issueDate) || toDateInput(new Date())}
                required
                aria-invalid={invalid("issueDate")}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="doc-due">Termin płatności</Label>
              <Input
                id="doc-due"
                name="dueDate"
                type="date"
                defaultValue={toDateInput(document?.dueDate)}
                aria-invalid={invalid("dueDate")}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="doc-net">Netto</Label>
              <Input
                id="doc-net"
                name="netAmount"
                inputMode="decimal"
                value={net}
                onChange={(event) => setNet(event.target.value)}
                placeholder="0,00"
                required
                aria-invalid={invalid("netAmount")}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="doc-vat">VAT</Label>
              <Input
                id="doc-vat"
                name="vatAmount"
                inputMode="decimal"
                value={vat}
                onChange={(event) => setVat(event.target.value)}
                placeholder="0,00"
                required
                aria-invalid={invalid("vatAmount")}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="doc-gross">Brutto</Label>
              <Input
                id="doc-gross"
                name="grossAmount"
                inputMode="decimal"
                value={gross}
                onChange={(event) => {
                  setGrossTouched(true);
                  setGross(event.target.value);
                }}
                placeholder="0,00"
                required
                aria-invalid={invalid("grossAmount")}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="doc-currency">Waluta</Label>
              <Input
                id="doc-currency"
                name="currency"
                defaultValue={document?.currency ?? "PLN"}
                maxLength={3}
                className="uppercase"
                aria-invalid={invalid("currency")}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="doc-category">Kategoria</Label>
              <Select name="categoryId" defaultValue={document?.categoryId ?? NO_CATEGORY}>
                <SelectTrigger id="doc-category" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_CATEGORY}>— brak —</SelectItem>
                  {options.categories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.path}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="doc-account">Rachunek do zapłaty</Label>
              <Input
                id="doc-account"
                name="paymentAccount"
                defaultValue={document?.paymentAccount ?? ""}
                placeholder="61 1090 1014 0000 0712 1981 2874"
                aria-invalid={invalid("paymentAccount")}
              />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="doc-notes">Notatki</Label>
              <Textarea id="doc-notes" name="notes" defaultValue={document?.notes ?? ""} rows={2} />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Anuluj
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Zapisywanie…" : "Zapisz dokument"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
