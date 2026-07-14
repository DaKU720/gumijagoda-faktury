"use client";

import { AlertTriangle, CheckCircle2, Clock3, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/format";

export type SyncRun = {
  id: string;
  trigger: "MANUAL" | "SCHEDULED";
  kind: "PURCHASE" | "SALES";
  status: "RUNNING" | "SUCCESS" | "FAILED";
  dateFrom: string;
  dateTo: string;
  foundCount: number;
  importedCount: number;
  skippedCount: number;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
};

const timeFormatter = new Intl.DateTimeFormat("pl-PL", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * Historia synchronizacji.
 *
 * Bez tego widoku harmonogram jest czarną skrzynką: użytkownik nie wie, czy nocne pobranie
 * się odbyło, czy odbyło się i nic nie znalazło, czy padło na błędzie uwierzytelnienia.
 * Wymaganie mówi o „czytelnych komunikatach” przy awarii integracji — to jest właśnie to miejsce.
 */
export function SyncHistory({ runs }: { runs: SyncRun[] }) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-medium">Historia pobierań</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Ostatnie uruchomienia — ręczne i automatyczne, wraz z błędami integracji.
        </p>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Kiedy</TableHead>
              <TableHead>Wyzwalacz</TableHead>
              <TableHead>Rodzaj</TableHead>
              <TableHead>Zakres dat</TableHead>
              <TableHead className="text-right">Znaleziono</TableHead>
              <TableHead className="text-right">Zaimportowano</TableHead>
              <TableHead className="text-right">Pominięto</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {runs.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-muted-foreground py-10 text-center text-sm">
                  Brak pobrań. Uruchom pobieranie ręczne z poziomu bufora albo włącz harmonogram.
                </TableCell>
              </TableRow>
            )}

            {runs.map((run) => (
              <TableRow key={run.id}>
                <TableCell className="text-sm tabular-nums whitespace-nowrap">
                  {timeFormatter.format(new Date(run.startedAt))}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="gap-1 font-normal">
                    {run.trigger === "SCHEDULED" ? <Clock3 className="size-3" /> : <RefreshCw className="size-3" />}
                    {run.trigger === "SCHEDULED" ? "harmonogram" : "ręcznie"}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm">{run.kind === "PURCHASE" ? "kosztowe" : "sprzedażowe"}</TableCell>
                <TableCell className="text-muted-foreground text-sm whitespace-nowrap tabular-nums">
                  {formatDate(run.dateFrom)} – {formatDate(run.dateTo)}
                </TableCell>
                <TableCell className="text-right text-sm tabular-nums">{run.foundCount}</TableCell>
                <TableCell className="text-right text-sm font-medium tabular-nums">{run.importedCount}</TableCell>
                <TableCell className="text-muted-foreground text-right text-sm tabular-nums">
                  {run.skippedCount}
                </TableCell>
                <TableCell>
                  <StatusCell run={run} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}

function StatusCell({ run }: { run: SyncRun }) {
  if (run.status === "RUNNING") {
    return (
      <span className="text-muted-foreground flex items-center gap-1.5 text-sm">
        <RefreshCw className="size-3.5 animate-spin" />w toku
      </span>
    );
  }

  if (run.status === "FAILED") {
    return (
      // Komunikat błędu w `title`, żeby długi opis (np. odpowiedź serwera MF) nie rozwalał tabeli,
      // ale pozostawał dostępny bez wchodzenia w logi serwera.
      <span className="text-destructive flex items-center gap-1.5 text-sm" title={run.error ?? undefined}>
        <AlertTriangle className="size-3.5" />
        <span className="max-w-56 truncate">{run.error ?? "błąd"}</span>
      </span>
    );
  }

  return (
    <span className="flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400">
      <CheckCircle2 className="size-3.5" />
      gotowe
    </span>
  );
}
