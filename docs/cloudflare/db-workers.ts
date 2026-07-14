import { getCloudflareContext } from "@opennextjs/cloudflare";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

/**
 * Klient bazy danych na Cloudflare Workers — ZAMIENNIK dla `src/server/db.ts`.
 *
 * Różnica względem wersji dla Railway jest fundamentalna i warto ją rozumieć, a nie tylko
 * przekleić:
 *
 * NA SERWERZE (Railway, Docker):
 *   Proces żyje tygodniami. Tworzymy JEDEN PrismaClient i używamy go dla tysięcy żądań.
 *   Klient trzyma pulę otwartych połączeń do Postgresa. To jest optymalne — nawiązanie
 *   połączenia jest drogie, więc robimy to raz.
 *
 * NA WORKERS:
 *   Worker budzi się na jedno żądanie i umiera. Nie ma „długo żyjącego procesu”, w którym
 *   mógłby mieszkać singleton. Co gorsza, kod workera bywa uruchamiany w wielu izolatach naraz
 *   — singleton z pulą połączeń oznaczałby setki równoległych pul i natychmiastowe wyczerpanie
 *   limitu połączeń bazy.
 *
 *   Dlatego: KLIENT NA ŻĄDANIE, z `maxUses: 1`.
 *
 *   Nie jest to marnotrawstwo, bo prawdziwą pulę połączeń trzyma HYPERDRIVE — po stronie
 *   Cloudflare, blisko bazy. Worker dostaje od niego gotowe połączenie i nie płaci za handshake.
 *
 * `cache()` z Reacta sprawia, że w obrębie JEDNEGO żądania klient powstaje raz, a nie przy każdym
 * wywołaniu `getDb()` w różnych komponentach serwerowych.
 */
import { cache } from "react";

export const getDb = cache(() => {
  const { env } = getCloudflareContext();

  const adapter = new PrismaPg({
    // Hyperdrive podstawia własny connection string — worker nigdy nie widzi hasła do bazy.
    connectionString: env.HYPERDRIVE.connectionString,
    // Kluczowe: połączenie nie może być współdzielone między żądaniami.
    maxUses: 1,
  });

  return new PrismaClient({ adapter });
});

/**
 * Wariant asynchroniczny — potrzebny w miejscach, gdzie kontekst Cloudflare nie jest jeszcze
 * dostępny synchronicznie (np. w handlerze `scheduled`, poza obsługą żądania HTTP).
 */
export async function getDbAsync() {
  const { env } = await getCloudflareContext({ async: true });

  const adapter = new PrismaPg({
    connectionString: env.HYPERDRIVE.connectionString,
    maxUses: 1,
  });

  return new PrismaClient({ adapter });
}

/**
 * MIGRACJA KODU: wszystkie miejsca, które dziś robią
 *
 *   import { prisma } from "@/server/db";
 *   await prisma.document.findMany(...)
 *
 * muszą przejść na
 *
 *   import { getDb } from "@/server/db";
 *   const prisma = getDb();
 *   await prisma.document.findMany(...)
 *
 * To mechaniczna zmiana w ~10 plikach serwisów. Nic w logice biznesowej się nie zmienia —
 * i to jest właśnie zysk z trzymania jej poza komponentami: warstwa dostępu do danych zmienia
 * się w jednym miejscu, domena zostaje nietknięta.
 */
