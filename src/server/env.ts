import "server-only";
import { z } from "zod";

/**
 * Jedyne miejsce w aplikacji, które czyta process.env.
 *
 * Dwa powody:
 *
 * 1. BEZPIECZEŃSTWO (wymóg 6 zadania: tokeny KSeF nie mogą wyciec do frontendu).
 *    Import "server-only" sprawia, że próba zaciągnięcia tego modułu do komponentu
 *    klienckiego wysadza BUILD, a nie produkcję. Żadna zmienna nie ma prefiksu
 *    NEXT_PUBLIC_, więc bundler nigdy nie wstrzyknie jej do JS-a w przeglądarce.
 *
 * 2. SZYBKA ŚMIERĆ ZAMIAST CICHEJ AWARII. Literówka w nazwie zmiennej na produkcji
 *    dałaby `undefined` i zagadkowy błąd w środku importu z KSeF. Tutaj wywala się
 *    od razu, z nazwą brakującej zmiennej.
 */
const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL jest wymagany"),

  KSEF_MODE: z.enum(["mock", "real"]).default("mock"),
  KSEF_BASE_URL: z.string().url().default("https://api-test.ksef.mf.gov.pl"),
  KSEF_NIP: z.string().optional(),
  KSEF_TOKEN: z.string().optional(),

  SCHEDULER_ENABLED: z
    .string()
    .default("true")
    .transform((value) => value === "true"),
});

function loadEnv() {
  // Build w Dockerze nie ma dostępu do prawdziwej bazy ani tokenów, a Next.js i tak
  // wykonuje moduły przy prerenderowaniu. Ta furtka pozwala zbudować obraz bez sekretów;
  // w runtime walidacja obowiązuje normalnie.
  if (process.env.SKIP_ENV_VALIDATION === "1") {
    return envSchema.parse({ ...process.env, DATABASE_URL: process.env.DATABASE_URL ?? "postgresql://build" });
  }

  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`).join("\n");
    throw new Error(`Niepoprawna konfiguracja środowiska:\n${details}\n\nPorównaj swój .env z .env.example.`);
  }

  return parsed.data;
}

export const env = loadEnv();

/**
 * Czy integracja z KSeF ma szansę zadziałać w trybie `real`.
 * UI używa tego, żeby zawczasu powiedzieć "brakuje tokena", zamiast pozwolić
 * użytkownikowi kliknąć "Pobierz" i dostać błąd 401 z serwera MF.
 */
export function isKsefRealModeConfigured(): boolean {
  return env.KSEF_MODE === "real" && Boolean(env.KSEF_NIP) && Boolean(env.KSEF_TOKEN);
}
