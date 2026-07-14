import { defineCloudflareConfig } from "@opennextjs/cloudflare";

/**
 * Konfiguracja adaptera OpenNext — do skopiowania do katalogu głównego projektu.
 *
 * Co robi OpenNext: bierze standardowy build Next.js (`.next/`) i przepakowuje go w Workera —
 * jeden plik `.open-next/worker.js` plus katalog plików statycznych. Dzięki temu nie piszemy
 * aplikacji „pod Cloudflare”; piszemy zwykłego Next.js, a adapter tłumaczy go na środowisko Workers.
 *
 * Domyślna konfiguracja wystarcza dla naszej aplikacji, bo:
 *  - wszystkie strony są dynamiczne (`export const dynamic = "force-dynamic"`), więc nie potrzebujemy
 *    cache'u przyrostowego (ISR) ani jego magazynu,
 *  - nie używamy `next/image` z optymalizacją po stronie serwera,
 *  - nie mamy middleware.
 *
 * Gdyby doszedł ISR, tutaj podpina się `incrementalCache` (np. R2 albo KV).
 */
export default defineCloudflareConfig({
  // Puste = ustawienia domyślne. Zostawiamy jawnie, żeby było widać, że to świadomy wybór,
  // a nie zapomniany plik.
});
