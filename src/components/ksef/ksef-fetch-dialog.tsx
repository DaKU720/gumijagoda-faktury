"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AlertCircle, Download } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toDateInput } from "@/lib/format";

/** Domyślny zakres: ostatnie 30 dni — tyle, ile zwykle obejmuje jeden okres rozliczeniowy. */
function defaultRange() {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 30);
  return { from: toDateInput(from), to: toDateInput(to) };
}

export function KsefFetchDialog({ mode, onClose }: { mode: "mock" | "real"; onClose: () => void }) {
  const router = useRouter();
  const range = defaultRange();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const formData = new FormData(event.currentTarget);

    try {
      const response = await fetch("/api/ksef/fetch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dateFrom: formData.get("dateFrom"),
          dateTo: formData.get("dateTo"),
          kind: formData.get("kind"),
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        // Błąd integracji zostaje na ekranie (nie znika jak toast) — użytkownik ma go
        // przeczytać i móc od razu spróbować ponownie z innym zakresem.
        setError(result.error ?? "Nie udało się pobrać faktur z KSeF");
        return;
      }

      const parts = [`znaleziono ${result.found}`, `zaimportowano ${result.imported}`];
      if (result.skipped > 0) parts.push(`pominięto ${result.skipped} duplikat(ów)`);
      if (result.failed > 0) parts.push(`błędy: ${result.failed}`);

      if (result.imported > 0) {
        toast.success(`Pobrano faktury z KSeF — ${parts.join(", ")}`);
      } else {
        toast.info(`Brak nowych faktur — ${parts.join(", ")}`);
      }

      router.refresh();
      onClose();
    } catch {
      setError("Nie udało się połączyć z serwerem");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Pobierz faktury z KSeF</DialogTitle>
            <DialogDescription>
              Faktury trafią do bufora. Te, które już są w systemie, zostaną pominięte — pobranie tego samego
              zakresu dwa razy nie stworzy duplikatów.
            </DialogDescription>
          </DialogHeader>

          {mode === "mock" && (
            <div className="mt-2 flex gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm">
              <AlertCircle className="mt-0.5 size-4 shrink-0 text-amber-600" />
              <p className="text-muted-foreground">
                Tryb <strong>mock</strong>: faktury pochodzą z przykładowych plików w repozytorium, nie z API
                Ministerstwa. Przełącz <code className="text-xs">KSEF_MODE=real</code> i uzupełnij token, żeby
                pobierać ze środowiska testowego KSeF.
              </p>
            </div>
          )}

          <div className="grid gap-4 py-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="ksef-from">Data od</Label>
              <Input id="ksef-from" name="dateFrom" type="date" defaultValue={range.from} required />
            </div>

            <div className="space-y-2">
              <Label htmlFor="ksef-to">Data do</Label>
              <Input id="ksef-to" name="dateTo" type="date" defaultValue={range.to} required />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="ksef-kind">Rodzaj faktur</Label>
              <Select name="kind" defaultValue="PURCHASE">
                <SelectTrigger id="ksef-kind" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PURCHASE">Kosztowe — wystawione nam (jesteśmy nabywcą)</SelectItem>
                  <SelectItem value="SALES">Sprzedażowe — wystawione przez nas (jesteśmy sprzedawcą)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-muted-foreground text-xs">
                Zakres dat dotyczy daty wystawienia faktury.
              </p>
            </div>
          </div>

          {error && (
            <div className="border-destructive/30 bg-destructive/5 flex gap-2 rounded-md border px-3 py-2 text-sm">
              <AlertCircle className="text-destructive mt-0.5 size-4 shrink-0" />
              <p>{error}</p>
            </div>
          )}

          <DialogFooter className="mt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Anuluj
            </Button>
            <Button type="submit" disabled={busy}>
              <Download className="size-4" />
              {busy ? "Pobieranie…" : "Pobierz do bufora"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
