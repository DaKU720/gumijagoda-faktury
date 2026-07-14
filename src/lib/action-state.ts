/**
 * Wspólny kształt odpowiedzi server action.
 *
 * Typ żyje w `src/lib` (a nie w `src/server`), bo przechodzi przez granicę serwer→klient:
 * komponenty formularzy czytają go w `useActionState`. To jedyna rzecz, którą UI wie
 * o warstwie serwerowej — sam kształt wyniku, nigdy jej wnętrze.
 */
export type ActionState =
  | { status: "idle" }
  | { status: "success"; message: string }
  | { status: "error"; message: string; field?: string };

export const idleState: ActionState = { status: "idle" };
