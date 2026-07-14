/**
 * Kod uruchamiany RAZ, przy starcie serwera Next.js (przed obsługą pierwszego żądania).
 *
 * Tutaj startuje harmonogram pobierania z KSeF. To jedyne miejsce w aplikacji, gdzie coś
 * dzieje się „samo z siebie”, bez żądania użytkownika — i dlatego wymaga długo żyjącego
 * procesu Node (patrz ADR 0003: Railway zamiast serverless).
 */
export async function register() {
  // Next.js wykonuje ten plik również w środowisku Edge, gdzie nie ma ani node-cron,
  // ani połączenia z bazą. Warunek pilnuje, żeby scheduler startował wyłącznie w Node.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // Import dynamiczny, nie statyczny: moduł scheduler.ts ciągnie za sobą Prismę i node-cron.
  // Statyczny import wciągnąłby je do bundla Edge i wysadził build.
  const { reloadSchedule } = await import("@/server/services/scheduler");

  try {
    await reloadSchedule();
  } catch (error) {
    // Baza może jeszcze nie odpowiadać (kontener startuje równolegle). Nie wolno na tym
    // przewrócić całego serwera — aplikacja ma wstać, a harmonogram i tak przeładuje się
    // przy pierwszej zmianie ustawień.
    console.error("[cron] Nie udało się wczytać harmonogramu przy starcie:", (error as Error).message);
  }
}
