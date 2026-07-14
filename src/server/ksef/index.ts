import "server-only";
import { env } from "@/server/env";
import type { KsefClient } from "@/server/ksef/client";
import { KsefError } from "@/server/ksef/client";
import { MockKsefClient } from "@/server/ksef/mock-client";
import { RealKsefClient } from "@/server/ksef/real-client";

/**
 * Jedyne miejsce, w którym zapada decyzja „mock czy prawdziwy KSeF”.
 *
 * Reszta systemu dostaje `KsefClient` i nie wie, co siedzi w środku (ADR 0001).
 * Klienta trzymamy w module (singleton), żeby nie gubić tokenów dostępu między żądaniami —
 * inaczej każde pobranie faktur przechodziłoby całą procedurę uwierzytelnienia od nowa,
 * co przy harmonogramie odpalanym kilka razy dziennie oznaczałoby dziesiątki zbędnych
 * rozmów z serwerem MF.
 */
let client: KsefClient | null = null;

export function getKsefClient(): KsefClient {
  if (client) return client;

  if (env.KSEF_MODE === "mock") {
    client = new MockKsefClient();
    return client;
  }

  if (!env.KSEF_NIP || !env.KSEF_TOKEN) {
    throw new KsefError(
      "Tryb KSEF_MODE=real wymaga zmiennych KSEF_NIP i KSEF_TOKEN. Uzupełnij je albo przełącz na KSEF_MODE=mock.",
    );
  }

  client = new RealKsefClient(env.KSEF_BASE_URL, env.KSEF_NIP, env.KSEF_TOKEN);
  return client;
}

export type { KsefClient, KsefInvoiceRef, KsefQuery } from "@/server/ksef/client";
export { KsefError } from "@/server/ksef/client";
