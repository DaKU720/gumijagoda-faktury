import "server-only";
import { ZodError } from "zod";
import type { ActionState } from "@/lib/action-state";
import { DomainError } from "@/server/services/errors";

/**
 * Most między warstwą wejścia (server actions) a domeną.
 *
 * Tłumaczy wyjątki na wynik, który da się pokazać w formularzu:
 *  - `ZodError`   → pierwszy komunikat walidacji + pole, którego dotyczy
 *  - `DomainError`→ komunikat reguły biznesowej (np. "Faktura już istnieje")
 *  - cokolwiek innego → wpada wyżej i kończy jako 500, bo to prawdziwa awaria,
 *    a nie przewidziana odpowiedź systemu. Nie zamiatamy jej pod dywan.
 *
 * Dzięki temu w każdym pliku `actions.ts` nie ma ani jednego bloku try/catch —
 * są tylko wywołania serwisów.
 */
export async function runAction(work: () => Promise<string>): Promise<ActionState> {
  try {
    const message = await work();
    return { status: "success", message };
  } catch (error) {
    if (error instanceof ZodError) {
      const issue = error.issues[0];
      return {
        status: "error",
        message: issue?.message ?? "Niepoprawne dane",
        field: issue?.path?.[0]?.toString(),
      };
    }

    if (error instanceof DomainError) {
      return { status: "error", message: error.message, field: error.field };
    }

    throw error;
  }
}
