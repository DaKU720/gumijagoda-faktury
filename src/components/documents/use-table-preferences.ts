"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { ColumnOrderState, VisibilityState } from "@tanstack/react-table";
import { defaultColumnOrder, defaultColumnVisibility } from "@/components/documents/columns";

type Preferences = { visibility: VisibilityState; order: ColumnOrderState };

const DEFAULTS: Preferences = { visibility: defaultColumnVisibility, order: defaultColumnOrder };

/**
 * Układ kolumn (widoczność + kolejność) trzymany w localStorage.
 *
 * Świadomie po stronie przeglądarki, nie w bazie: to preferencja prezentacji jednego użytkownika,
 * nie dana biznesowa. Zapis do bazy oznaczałby round-trip na każde kliknięcie w checkbox
 * i tabelę użytkowników, której zadanie nie wymaga (dopuszczalny tryb jednego użytkownika).
 *
 * Dlaczego `useSyncExternalStore`, a nie `useState` + `useEffect`:
 * localStorage JEST zewnętrznym magazynem, a to jest hook stworzony dokładnie do subskrybowania
 * takich magazynów. Wariant z efektem („wczytaj po zamontowaniu i wywołaj setState”) daje
 * dodatkowy przebieg renderowania i miga domyślnym układem, zanim wskoczy zapisany.
 * Ten hook obsługuje też render serwerowy (`getServerSnapshot`) — serwer i pierwszy render klienta
 * zgadzają się co do treści, więc nie ma rozjazdu hydracji.
 */

const listeners = new Set<() => void>();

/**
 * Cache snapshotu. `useSyncExternalStore` wywołuje `getSnapshot` przy każdym renderze i porównuje
 * wynik REFERENCYJNIE — świeżo sparsowany obiekt za każdym razem oznaczałby nieskończoną pętlę
 * renderów. Dlatego pamiętamy ostatni surowy string i zwracamy ten sam obiekt, dopóki się nie zmienił.
 */
let cachedRaw: string | null = null;
let cachedValue: Preferences = DEFAULTS;

function readPreferences(storageKey: string): Preferences {
  let raw: string | null = null;

  try {
    raw = window.localStorage.getItem(storageKey);
  } catch {
    // Tryb prywatny albo zablokowany storage — układ domyślny wystarczy, tabela ma działać.
    return DEFAULTS;
  }

  if (raw === cachedRaw) return cachedValue;

  cachedRaw = raw;
  cachedValue = parsePreferences(raw);
  return cachedValue;
}

function parsePreferences(raw: string | null): Preferences {
  if (!raw) return DEFAULTS;

  try {
    const parsed = JSON.parse(raw) as Partial<Preferences>;

    // Zapisana kolejność może być nieaktualna (nowa wersja aplikacji dodała kolumnę). Bierzemy
    // zapisane kolumny, które nadal istnieją, i dopisujemy na koniec nowe — zamiast wyrzucać cały
    // układ użytkownika albo, gorzej, ukryć mu kolumnę, o której istnieniu nie wie.
    const known = (parsed.order ?? []).filter((id) => defaultColumnOrder.includes(id));
    const missing = defaultColumnOrder.filter((id) => !known.includes(id));

    return {
      visibility: parsed.visibility ?? defaultColumnVisibility,
      order: [...known, ...missing],
    };
  } catch {
    // Uszkodzony wpis nie może wysadzić tabeli.
    return DEFAULTS;
  }
}

function writePreferences(storageKey: string, preferences: Preferences) {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(preferences));
  } catch {
    // Brak zapisu nie jest powodem, żeby przerwać interakcję — zmiana i tak zadziała w tej sesji.
  }

  // Unieważniamy cache i budzimy subskrybentów: bez tego `getSnapshot` zwróciłby starą wartość.
  cachedRaw = null;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useTablePreferences(storageKey: string) {
  const preferences = useSyncExternalStore(
    subscribe,
    () => readPreferences(storageKey),
    // Render serwerowy: localStorage nie istnieje, więc zwracamy układ domyślny.
    () => DEFAULTS,
  );

  const update = useCallback(
    (next: Preferences) => writePreferences(storageKey, next),
    [storageKey],
  );

  const setVisibility = useCallback(
    (updater: (current: VisibilityState) => VisibilityState) => {
      update({ ...preferences, visibility: updater(preferences.visibility) });
    },
    [preferences, update],
  );

  const moveColumn = useCallback(
    (columnId: string, direction: -1 | 1) => {
      const index = preferences.order.indexOf(columnId);
      const target = index + direction;
      if (index === -1 || target < 0 || target >= preferences.order.length) return;

      const order = [...preferences.order];
      [order[index], order[target]] = [order[target], order[index]];

      update({ ...preferences, order });
    },
    [preferences, update],
  );

  const reset = useCallback(() => update(DEFAULTS), [update]);

  return { visibility: preferences.visibility, order: preferences.order, setVisibility, moveColumn, reset };
}
