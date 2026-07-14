import "server-only";
import cron, { type ScheduledTask } from "node-cron";
import { prisma } from "@/server/db";
import { env } from "@/server/env";
import { syncFromKsef } from "@/server/services/ksef-sync";
import { scheduleSchema } from "@/server/validation/schemas";

/**
 * Harmonogram automatycznego pobierania z KSeF.
 *
 * Wymaganie: „konfigurowalny, z możliwością uruchamiania wielokrotnie w ciągu doby
 * (np. o 1:00, 2:00, 3:00 — dowolna liczba i godziny wg ustawień)”.
 *
 * Realizacja: użytkownik wybiera w UI GODZINY, a nie wyrażenie cron. Dla każdej godziny
 * rejestrujemy osobne zadanie `0 {h} * * *`. Alternatywą było jedno zadanie z listą godzin
 * (`0 1,2,3 * * *`), ale osobne zadania są łatwiejsze do wyłączenia pojedynczo i czytelniejsze
 * w logach — widać, które uruchomienie wystartowało.
 *
 * Zadania żyją w PAMIĘCI PROCESU. To dlatego aplikacja jest wdrożona na Railway (długo żyjący
 * serwer Node), a nie na platformie serverless, gdzie proces umiera po każdym żądaniu
 * i żaden cron by nie wystrzelił (ADR 0003).
 */

/**
 * Zadania trzymamy na `globalThis`, bo w trybie deweloperskim Next.js przeładowuje moduły
 * przy każdej zmianie pliku. Bez tego po dziesięciu zapisach mielibyśmy dziesięć zestawów
 * zadań cronowych strzelających równolegle do KSeF.
 */
const globalForCron = globalThis as unknown as { ksefTasks?: ScheduledTask[] };

/** Ile dokumentów pobrać wstecz — okno nadrabiające ewentualny przestój serwera. */
function windowFor(lookbackDays: number) {
  const dateTo = new Date();
  const dateFrom = new Date();
  dateFrom.setDate(dateFrom.getDate() - lookbackDays);
  dateFrom.setHours(0, 0, 0, 0);
  return { dateFrom, dateTo };
}

export async function getScheduleConfig() {
  // Singleton konfiguracji — tworzymy przy pierwszym odczycie, żeby UI nie musiało
  // obsługiwać przypadku „jeszcze nie ma ustawień”.
  return prisma.ksefScheduleConfig.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default", enabled: false, hours: [], lookbackDays: 7 },
  });
}

export async function updateScheduleConfig(input: unknown) {
  const data = scheduleSchema.parse(input);

  const config = await prisma.ksefScheduleConfig.update({
    where: { id: "default" },
    data: {
      enabled: data.enabled,
      // Duplikaty godzin (użytkownik kliknął 2:00 dwa razy) oznaczałyby dwa pobrania
      // o tej samej porze. Sortujemy i odsiewamy — UI ma pokazywać to samo, co działa.
      hours: [...new Set(data.hours)].sort((a, b) => a - b),
      kinds: data.kinds,
      lookbackDays: data.lookbackDays,
    },
  });

  // Zmiana ustawień musi natychmiast przełożyć się na działające zadania — bez restartu.
  await reloadSchedule();

  return config;
}

/** Zatrzymuje wszystkie zadania i rejestruje je od nowa wg aktualnej konfiguracji. */
export async function reloadSchedule(): Promise<number> {
  for (const task of globalForCron.ksefTasks ?? []) {
    task.stop();
  }
  globalForCron.ksefTasks = [];

  if (!env.SCHEDULER_ENABLED) {
    console.log("[cron] Harmonogram wyłączony zmienną SCHEDULER_ENABLED");
    return 0;
  }

  const config = await getScheduleConfig();

  if (!config.enabled || config.hours.length === 0 || config.kinds.length === 0) {
    console.log("[cron] Harmonogram nieaktywny (wyłączony albo bez wybranych godzin)");
    return 0;
  }

  const tasks: ScheduledTask[] = [];

  for (const hour of config.hours) {
    const expression = `0 ${hour} * * *`;

    const task = cron.schedule(
      expression,
      () => {
        void runScheduledSync(config.kinds, config.lookbackDays, hour);
      },
      {
        // Strefa czasowa jest kluczowa: użytkownik ustawiając „1:00” ma na myśli czas polski.
        // Bez tego na serwerze w UTC zadanie odpalałoby się o 3:00 latem i 2:00 zimą.
        timezone: "Europe/Warsaw",
      },
    );

    tasks.push(task);
  }

  globalForCron.ksefTasks = tasks;
  console.log(
    `[cron] Zarejestrowano ${tasks.length} zadań: godziny ${config.hours.join(", ")} (Europe/Warsaw), ` +
      `rodzaje: ${config.kinds.join(", ")}, okno: ${config.lookbackDays} dni wstecz`,
  );

  return tasks.length;
}

/**
 * Pojedyncze uruchomienie z harmonogramu.
 *
 * Każdy rodzaj faktur (kosztowe/sprzedażowe) to osobna synchronizacja i osobny wpis w historii —
 * dzięki temu awaria pobierania faktur sprzedażowych nie ukrywa faktu, że kosztowe pobrały się
 * poprawnie. Błąd jest logowany i zapisany, ale NIE jest rzucany dalej: wyjątek w callbacku
 * crona nie ma kto obsłużyć, a nieobsłużony wyjątek potrafi położyć cały proces Node.
 */
async function runScheduledSync(kinds: ("PURCHASE" | "SALES")[], lookbackDays: number, hour: number) {
  const { dateFrom, dateTo } = windowFor(lookbackDays);
  console.log(`[cron] Start pobierania z KSeF (godzina ${hour}:00), zakres ${dateFrom.toISOString().slice(0, 10)}–${dateTo.toISOString().slice(0, 10)}`);

  for (const kind of kinds) {
    try {
      const result = await syncFromKsef({ dateFrom, dateTo, kind, trigger: "SCHEDULED" });
      console.log(
        `[cron] ${kind}: znaleziono ${result.found}, zaimportowano ${result.imported}, pominięto ${result.skipped}`,
      );
    } catch (error) {
      // Nie rzucamy dalej — powód awarii jest już zapisany w KsefSyncRun i użytkownik
      // zobaczy go w historii. Przewrócenie procesu byłoby lekarstwem gorszym od choroby.
      console.error(`[cron] ${kind}: pobieranie nie powiodło się —`, (error as Error).message);
    }
  }
}

/** Podgląd dla UI: kiedy zadania odpalą się najbliżej. */
export function describeSchedule(hours: number[]): string {
  if (hours.length === 0) return "brak zaplanowanych uruchomień";
  return hours.map((hour) => `${String(hour).padStart(2, "0")}:00`).join(", ");
}
