"use client";

import { useEffect, useState } from "react";
import type { ColumnOrderState, VisibilityState } from "@tanstack/react-table";
import { defaultColumnOrder, defaultColumnVisibility } from "@/components/documents/columns";

type Preferences = { visibility: VisibilityState; order: ColumnOrderState };

/**
 * Układ kolumn (widoczność + kolejność) trzymany w localStorage.
 *
 * Świadomie po stronie przeglądarki, nie w bazie: to preferencja prezentacji jednego
 * użytkownika przy jednym biurku, nie dana biznesowa. Zapis do bazy oznaczałby round-trip
 * na każde kliknięcie w checkboxa i tabelę użytkowników, której zadanie nie wymaga
 * (dopuszczalny tryb jednego użytkownika).
 *
 * Wczytujemy w `useEffect`, a nie w inicjalizatorze `useState`, bo przy renderze serwerowym
 * `localStorage` nie istnieje — czytanie go podczas hydracji dałoby rozjazd między HTML-em
 * z serwera a pierwszym renderem klienta.
 */
export function useTablePreferences(storageKey: string) {
  const [visibility, setVisibility] = useState<VisibilityState>(defaultColumnVisibility);
  const [order, setOrder] = useState<ColumnOrderState>(defaultColumnOrder);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<Preferences>;
        if (parsed.visibility) setVisibility(parsed.visibility);

        // Zapisana kolejność może być nieaktualna (nowa wersja aplikacji dodała kolumnę).
        // Bierzemy zapisane kolumny, które nadal istnieją, i dopisujemy na koniec nowe —
        // zamiast wyrzucać cały układ użytkownika albo, gorzej, ukryć mu nową kolumnę.
        if (parsed.order) {
          const known = parsed.order.filter((id) => defaultColumnOrder.includes(id));
          const missing = defaultColumnOrder.filter((id) => !known.includes(id));
          setOrder([...known, ...missing]);
        }
      }
    } catch {
      // Uszkodzony wpis (albo tryb prywatny bez localStorage) nie może wysadzić tabeli —
      // zostajemy przy układzie domyślnym.
    }
    setLoaded(true);
  }, [storageKey]);

  useEffect(() => {
    if (!loaded) return;
    window.localStorage.setItem(storageKey, JSON.stringify({ visibility, order }));
  }, [visibility, order, loaded, storageKey]);

  const reset = () => {
    setVisibility(defaultColumnVisibility);
    setOrder(defaultColumnOrder);
  };

  const moveColumn = (columnId: string, direction: -1 | 1) => {
    setOrder((current) => {
      const index = current.indexOf(columnId);
      const target = index + direction;
      if (index === -1 || target < 0 || target >= current.length) return current;

      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  return { visibility, setVisibility, order, moveColumn, reset };
}
