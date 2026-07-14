import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { env } from "@/server/env";

/**
 * Singleton PrismaClient.
 *
 * W trybie deweloperskim Next.js przeładowuje moduły przy każdej zmianie pliku.
 * Bez tego cache'a każde przeładowanie tworzyłoby nowy pool połączeń, aż Postgres
 * zacząłby odrzucać kolejne ("too many clients"). Na produkcji moduł ładuje się raz.
 *
 * Adapter `PrismaPg`: w Prisma 7 schema.prisma opisuje wyłącznie kształt danych,
 * a połączenie z bazą jest konfiguracją środowiska podawaną przy tworzeniu klienta.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createPrismaClient() {
  const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });

  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
