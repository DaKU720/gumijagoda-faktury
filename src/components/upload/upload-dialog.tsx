"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { FileCode2, FileText, Loader2, Upload } from "lucide-react";
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
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ParsedInvoice } from "@/server/domain/fa-parser";

type Options = {
  types: { id: string; name: string }[];
  contractors: { id: string; name: string }[];
  categories: { id: string; path: string }[];
};

const NO_CATEGORY = "__none__";

/**
 * Wgrywanie faktur spoza KSeF.
 *
 * Dwie ścieżki, bo dwa rodzaje plików niosą różną ilość informacji:
 *
 *  XML → najpierw PODGLĄD (serwer parsuje plik i odsyła, co z niego wyczytał), użytkownik
 *  widzi kontrahenta i kwoty, potwierdza, dopiero wtedy zapis. Nic nie przepisuje ręcznie.
 *
 *  PDF → komputer nie wie, co jest na skanie, więc pola uzupełnia człowiek, a plik zostaje
 *  załącznikiem.
 *
 * W obu przypadkach dokument ląduje w buforze — patrz ADR 0002.
 */
export function UploadDialog({ options, onClose }: { options: Options; onClose: () => void }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ParsedInvoice | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);

  const isPdf = file ? file.name.toLowerCase().endsWith(".pdf") : false;

  const selectFile = async (selected: File) => {
    setFile(selected);
    setPreview(null);

    if (selected.name.toLowerCase().endsWith(".pdf")) return;

    // XML: pytamy serwer, co widzi w pliku. Parsowanie zostaje na serwerze — przeglądarka
    // nie musi znać schematu FA, a my mamy jeden parser dla uploadu, KSeF-a i testów.
    setBusy(true);
    try {
      const body = new FormData();
      body.set("file", selected);

      const response = await fetch("/api/upload/preview", { method: "POST", body });
      const result = await response.json();

      if (!response.ok) {
        toast.error(result.error ?? "Nie udało się odczytać pliku");
        setFile(null);
        return;
      }

      setPreview(result.invoice as ParsedInvoice);
    } catch {
      toast.error("Nie udało się odczytać pliku");
      setFile(null);
    } finally {
      setBusy(false);
    }
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!file) return;

    setBusy(true);
    try {
      const body = new FormData(event.currentTarget);
      body.set("file", file);

      const response = await fetch("/api/upload", { method: "POST", body });
      const result = await response.json();

      if (response.status === 409) {
        // Duplikat to nie awaria — informujemy i zamykamy, bo dokument już jest w systemie.
        toast.warning(`Pominięto duplikat: ${result.reason}`);
        onClose();
        return;
      }

      if (!response.ok) {
        toast.error(result.error ?? "Nie udało się wgrać pliku");
        return;
      }

      toast.success(`Dokument „${result.number}” trafił do bufora`);
      router.refresh();
      onClose();
    } catch {
      toast.error("Nie udało się wgrać pliku");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Wgraj fakturę spoza KSeF</DialogTitle>
            <DialogDescription>
              XML w schemacie FA(2)/FA(3) — dane wczytają się automatycznie. PDF (skan, faktura zagraniczna) — plik
              zostanie załącznikiem, pola uzupełnisz poniżej.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Strefa upuszczania pliku */}
            <div
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragging(false);
                const dropped = event.dataTransfer.files[0];
                if (dropped) void selectFile(dropped);
              }}
              onClick={() => inputRef.current?.click()}
              className={cn(
                "flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed px-6 py-8 text-center transition-colors",
                dragging ? "border-primary bg-primary/5" : "hover:border-muted-foreground/50",
              )}
            >
              <input
                ref={inputRef}
                type="file"
                accept=".pdf,.xml,application/pdf,text/xml,application/xml"
                className="hidden"
                onChange={(event) => {
                  const selected = event.target.files?.[0];
                  if (selected) void selectFile(selected);
                }}
              />

              {busy && !preview ? (
                <Loader2 className="text-muted-foreground size-6 animate-spin" />
              ) : file ? (
                <>
                  {isPdf ? <FileText className="size-6" /> : <FileCode2 className="size-6" />}
                  <span className="text-sm font-medium">{file.name}</span>
                  <span className="text-muted-foreground text-xs">{(file.size / 1024).toFixed(0)} KB — kliknij, aby zmienić</span>
                </>
              ) : (
                <>
                  <Upload className="text-muted-foreground size-6" />
                  <span className="text-sm font-medium">Przeciągnij plik albo kliknij, aby wybrać</span>
                  <span className="text-muted-foreground text-xs">PDF lub XML (FA(2) / FA(3)), maks. 10 MB</span>
                </>
              )}
            </div>

            {/* XML: pokazujemy, co system wyczytał z pliku */}
            {preview && (
              <div className="bg-muted/40 space-y-3 rounded-lg border p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Odczytano z pliku</span>
                  <span className="text-muted-foreground rounded bg-background px-2 py-0.5 text-xs">
                    schemat {preview.schemaVersion}
                  </span>
                </div>

                <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                  <Field label="Numer" value={preview.number} />
                  <Field label="Data wystawienia" value={preview.issueDate} />
                  <Field label="Sprzedawca" value={`${preview.seller.name} (${preview.seller.nip ?? "brak NIP"})`} />
                  <Field label="Nabywca" value={`${preview.buyer.name} (${preview.buyer.nip ?? "brak NIP"})`} />
                  <Field label="Termin płatności" value={preview.dueDate ?? "nie podano"} />
                  <Field label="Pozycje" value={`${preview.lines.length}`} />
                  <Field label="Netto" value={formatMoney(preview.netAmount, preview.currency)} />
                  <Field label="Brutto" value={formatMoney(preview.grossAmount, preview.currency)} />
                </dl>

                <p className="text-muted-foreground text-xs">
                  Kontrahent zostanie dopasowany po NIP-ie (albo utworzony), a kategoria przypisana zgodnie z regułą
                  kontrahenta. Dokument trafi do bufora.
                </p>
              </div>
            )}

            {/* PDF: dane muszą przyjść z formularza */}
            {file && isPdf && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <p className="text-muted-foreground text-sm">
                    Dla PDF-a uzupełnij dane faktury — plik zostanie do niej dołączony jako załącznik.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="upload-number">Numer dokumentu</Label>
                  <Input id="upload-number" name="number" required placeholder="INV-2026-0042" />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="upload-type">Typ dokumentu</Label>
                  <Select name="typeId" defaultValue={options.types[0]?.id}>
                    <SelectTrigger id="upload-type" className="w-full">
                      <SelectValue />
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
                  <Label htmlFor="upload-contractor">Kontrahent</Label>
                  <Select name="contractorId" required>
                    <SelectTrigger id="upload-contractor" className="w-full">
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
                </div>

                <div className="space-y-2">
                  <Label htmlFor="upload-issue">Data wystawienia</Label>
                  <Input id="upload-issue" name="issueDate" type="date" required />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="upload-due">Termin płatności</Label>
                  <Input id="upload-due" name="dueDate" type="date" />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="upload-net">Netto</Label>
                  <Input id="upload-net" name="netAmount" inputMode="decimal" required placeholder="0,00" />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="upload-vat">VAT</Label>
                  <Input id="upload-vat" name="vatAmount" inputMode="decimal" required placeholder="0,00" />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="upload-gross">Brutto</Label>
                  <Input id="upload-gross" name="grossAmount" inputMode="decimal" required placeholder="0,00" />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="upload-currency">Waluta</Label>
                  <Input id="upload-currency" name="currency" defaultValue="PLN" maxLength={3} className="uppercase" />
                </div>

                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="upload-category">Kategoria</Label>
                  <Select name="categoryId" defaultValue={NO_CATEGORY}>
                    <SelectTrigger id="upload-category" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_CATEGORY}>— z reguły kontrahenta —</SelectItem>
                      {options.categories.map((category) => (
                        <SelectItem key={category.id} value={category.id}>
                          {category.path}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Anuluj
            </Button>
            <Button type="submit" disabled={!file || busy}>
              {busy ? "Wgrywanie…" : "Wgraj do bufora"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
