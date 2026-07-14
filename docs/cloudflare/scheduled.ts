/**
 * Harmonogram na Cloudflare Workers — ZAMIENNIK dla `node-cron` i `instrumentation.ts`.
 *
 * PROBLEM DO ROZWIĄZANIA
 *
 * `node-cron` rejestruje zadania w pamięci długo żyjącego procesu. Worker nie jest procesem —
 * budzi się na żądanie i umiera. Nie ma czego trzymać w pamięci, więc node-cron jest tu bezużyteczny.
 *
 * Cloudflare oferuje Cron Triggers: platforma sama budzi workera o zadanej porze i woła `scheduled()`.
 * Ale jest haczyk: **wyrażenia cron są statyczne**, zdefiniowane w `wrangler.jsonc`. Aplikacja nie może
 * ich zmienić — a nasze wymaganie mówi wprost, że użytkownik konfiguruje godziny w UI.
 *
 * ROZWIĄZANIE
 *
 * Odwracamy zależność:
 *   - Cloudflare budzi workera CO GODZINĘ (`"crons": ["0 * * * *"]`),
 *   - worker sam sprawdza w bazie, czy TA godzina jest na liście wybranej przez użytkownika,
 *   - jeśli nie jest — kończy natychmiast (koszt: jedno tanie zapytanie do bazy).
 *
 * Dla użytkownika nic się nie zmienia: dalej klika godziny w Ustawieniach i pobieranie dzieje się
 * o tych godzinach. Zmienia się wyłącznie mechanika pod spodem — i to jest dokładnie ten rodzaj
 * zmiany, który da się zrobić bez dotykania logiki biznesowej, bo `syncFromKsef` nie wie i nie musi
 * wiedzieć, kto go wywołał.
 */
import { getDbAsync } from "@/server/db";
import { syncFromKsef } from "@/server/services/ksef-sync";

export default {
  async scheduled(event: ScheduledEvent, env: CloudflareEnv, ctx: ExecutionContext) {
    ctx.waitUntil(runScheduledSync(event));
  },
};

async function runScheduledSync(event: ScheduledEvent) {
  const prisma = await getDbAsync();

  const config = await prisma.ksefScheduleConfig.findUnique({ where: { id: "default" } });

  if (!config?.enabled || config.hours.length === 0 || config.kinds.length === 0) {
    return;
  }

  /**
   * Cron Cloudflare chodzi w UTC. Użytkownik ustawiając „3:00” ma na myśli czas POLSKI —
   * a Polska to UTC+1 zimą i UTC+2 latem. Sztywne przesunięcie o godzinę oznaczałoby, że przez
   * pół roku pobieranie odpala się o złej porze.
   *
   * Dlatego pytamy `Intl` o realną godzinę w strefie Europe/Warsaw, zamiast liczyć offset ręcznie.
   */
  const warsawHour = Number(
    new Intl.DateTimeFormat("pl-PL", {
      timeZone: "Europe/Warsaw",
      hour: "2-digit",
      hour12: false,
    }).format(new Date(event.scheduledTime)),
  );

  if (!config.hours.includes(warsawHour)) {
    // Ta godzina nie jest na liście użytkownika — nic nie robimy. To 90% wybudzeń i są tanie.
    return;
  }

  const dateTo = new Date();
  const dateFrom = new Date();
  dateFrom.setDate(dateFrom.getDate() - config.lookbackDays);
  dateFrom.setHours(0, 0, 0, 0);

  for (const kind of config.kinds) {
    try {
      // Ta sama funkcja, której używa pobieranie ręczne. Zero duplikacji logiki —
      // deduplikacja, auto-kategoryzacja i zapis historii działają identycznie.
      const result = await syncFromKsef({ dateFrom, dateTo, kind, trigger: "SCHEDULED" });
      console.log(`[cron] ${kind}: znaleziono ${result.found}, zaimportowano ${result.imported}`);
    } catch (error) {
      // Powód awarii jest już zapisany w KsefSyncRun i użytkownik zobaczy go w historii.
      // Rzucenie wyjątku wyżej tylko zaśmieciłoby metryki błędów workera.
      console.error(`[cron] ${kind}: pobieranie nie powiodło się —`, (error as Error).message);
    }
  }
}

/**
 * UWAGA NA LIMIT CZASU
 *
 * Worker ma limit CPU (do 5 minut na płatnym planie, mniej na darmowym). Import kilkuset faktur
 * — każda to osobne żądanie HTTP do KSeF plus parsowanie XML — może się w nim nie zmieścić.
 *
 * `ctx.waitUntil()` pozwala pracy trwać po zwróceniu odpowiedzi, ale nie omija limitu CPU.
 *
 * Przy większej skali poprawnym rozwiązaniem są **Cloudflare Queues**: handler `scheduled` tylko
 * wrzuca do kolejki listę numerów KSeF do pobrania, a osobny konsument przetwarza je po kilka naraz.
 * Każda faktura dostaje wtedy własny budżet czasu, a jedna wadliwa nie blokuje reszty.
 */
