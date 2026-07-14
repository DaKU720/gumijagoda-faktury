"use client";

import { useActionState, useEffect, useState } from "react";
import { AlertCircle, Clock } from "lucide-react";
import { toast } from "sonner";
import { updateScheduleAction } from "@/app/(app)/ustawienia/harmonogram/actions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { idleState } from "@/lib/action-state";
import { cn } from "@/lib/utils";

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

export type ScheduleConfig = {
  enabled: boolean;
  hours: number[];
  kinds: string[];
  lookbackDays: number;
};

/**
 * Konfiguracja harmonogramu.
 *
 * Użytkownik wybiera GODZINY klikając w siatkę, a nie wpisując wyrażenie cron. To świadome:
 * „pobieraj o 1:00, 2:00 i 3:00” to sposób, w jaki księgowa myśli o nocnym imporcie;
 * `0 1,2,3 * * *` to sposób, w jaki myśli o nim administrator serwera.
 */
export function ScheduleForm({
  config,
  ksefMode,
  ksefConfigured,
}: {
  config: ScheduleConfig;
  ksefMode: "mock" | "real";
  ksefConfigured: boolean;
}) {
  const [state, submit, pending] = useActionState(updateScheduleAction, idleState);

  const [enabled, setEnabled] = useState(config.enabled);
  const [hours, setHours] = useState<number[]>(config.hours);
  const [kinds, setKinds] = useState<string[]>(config.kinds);

  useEffect(() => {
    if (state.status === "success") toast.success(state.message);
    if (state.status === "error") toast.error(state.message);
  }, [state]);

  const toggleHour = (hour: number) => {
    setHours((current) => (current.includes(hour) ? current.filter((h) => h !== hour) : [...current, hour].sort((a, b) => a - b)));
  };

  const toggleKind = (kind: string) => {
    setKinds((current) => (current.includes(kind) ? current.filter((k) => k !== kind) : [...current, kind]));
  };

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-medium">Harmonogram pobierania z KSeF</h2>
        <p className="text-muted-foreground mt-1 max-w-2xl text-sm">
          Automatyczne pobieranie faktur do bufora. Możesz wybrać dowolną liczbę godzin w ciągu doby — każda
          uruchamia osobne pobranie. Duplikaty są pomijane, więc nakładające się okna nie zaśmiecą ewidencji.
        </p>
      </div>

      {!ksefConfigured && (
        <div className="flex gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm">
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-amber-600" />
          <p className="text-muted-foreground">
            Tryb <strong>real</strong> jest włączony, ale brakuje <code className="text-xs">KSEF_NIP</code> lub{" "}
            <code className="text-xs">KSEF_TOKEN</code>. Pobieranie zakończy się błędem, dopóki ich nie uzupełnisz.
          </p>
        </div>
      )}

      <form action={submit} className="space-y-6 rounded-lg border p-5">
        <div className="flex items-start gap-3">
          <Checkbox
            id="schedule-enabled"
            name="enabled"
            checked={enabled}
            onCheckedChange={(checked) => setEnabled(checked === true)}
          />
          <div className="space-y-1">
            <Label htmlFor="schedule-enabled" className="cursor-pointer font-medium">
              Włącz automatyczne pobieranie
            </Label>
            <p className="text-muted-foreground text-sm">
              Źródło danych: <strong>{ksefMode === "mock" ? "mock (pliki przykładowe)" : "środowisko testowe KSeF"}</strong>
            </p>
          </div>
        </div>

        <fieldset className={cn("space-y-3", !enabled && "pointer-events-none opacity-50")}>
          <legend className="mb-2 flex items-center gap-2 text-sm font-medium">
            <Clock className="size-4" />
            Godziny uruchomień
          </legend>

          <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-12">
            {HOURS.map((hour) => {
              const active = hours.includes(hour);

              return (
                <button
                  key={hour}
                  type="button"
                  onClick={() => toggleHour(hour)}
                  aria-pressed={active}
                  className={cn(
                    "rounded-md border py-1.5 text-xs font-medium tabular-nums transition-colors",
                    active
                      ? "border-primary bg-primary text-primary-foreground"
                      : "hover:bg-muted text-muted-foreground",
                  )}
                >
                  {String(hour).padStart(2, "0")}
                </button>
              );
            })}
          </div>

          {/* Wybrane godziny jadą do serwera jako ukryte pola — siatka to tylko wygodny sposób ich zaznaczania. */}
          {hours.map((hour) => (
            <input key={hour} type="hidden" name="hours" value={hour} />
          ))}

          <p className="text-muted-foreground text-xs">
            {hours.length === 0
              ? "Nie wybrano żadnej godziny — automatyczne pobieranie nie uruchomi się."
              : `Pobieranie o: ${hours.map((h) => `${String(h).padStart(2, "0")}:00`).join(", ")} (czas polski)`}
          </p>
        </fieldset>

        <fieldset className={cn("space-y-2", !enabled && "pointer-events-none opacity-50")}>
          <legend className="mb-2 text-sm font-medium">Rodzaje faktur</legend>

          <div className="flex flex-col gap-2">
            {[
              { value: "PURCHASE", label: "Kosztowe (wystawione nam)" },
              { value: "SALES", label: "Sprzedażowe (wystawione przez nas)" },
            ].map((kind) => (
              <div key={kind.value} className="flex items-center gap-2">
                <Checkbox
                  id={`kind-${kind.value}`}
                  checked={kinds.includes(kind.value)}
                  onCheckedChange={() => toggleKind(kind.value)}
                />
                <Label htmlFor={`kind-${kind.value}`} className="cursor-pointer font-normal">
                  {kind.label}
                </Label>
              </div>
            ))}
          </div>

          {kinds.map((kind) => (
            <input key={kind} type="hidden" name="kinds" value={kind} />
          ))}
        </fieldset>

        <div className={cn("space-y-2", !enabled && "pointer-events-none opacity-50")}>
          <Label htmlFor="schedule-lookback">Okno pobierania (dni wstecz)</Label>
          <Input
            id="schedule-lookback"
            name="lookbackDays"
            type="number"
            min={1}
            max={90}
            defaultValue={config.lookbackDays}
            className="w-32"
          />
          <p className="text-muted-foreground text-xs">
            Każde uruchomienie pobiera faktury z ostatnich N dni. Zapas nadrabia ewentualny przestój serwera —
            duplikaty i tak zostaną pominięte.
          </p>
        </div>

        <Button type="submit" disabled={pending}>
          {pending ? "Zapisywanie…" : "Zapisz harmonogram"}
        </Button>
      </form>
    </section>
  );
}
