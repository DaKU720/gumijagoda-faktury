"use client";

import type { ColumnOrderState, VisibilityState } from "@tanstack/react-table";
import { ArrowDown, ArrowUp, RotateCcw, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { columnLabels } from "@/components/documents/columns";

/**
 * Konfiguracja kolumn: co widać i w jakiej kolejności.
 *
 * Kolejność zmieniamy strzałkami, nie drag-and-dropem. Świadomie: przeciąganie wymaga
 * dodatkowej biblioteki (dnd-kit) i i tak potrzebuje wariantu klawiaturowego, żeby być
 * dostępne. Strzałki działają myszą, klawiaturą i czytnikiem ekranu od razu — a wymaganie
 * mówi o możliwości zmiany kolejności, nie o konkretnej gestyce.
 */
export function ColumnSettings({
  visibility,
  setVisibility,
  order,
  moveColumn,
  reset,
}: {
  visibility: VisibilityState;
  setVisibility: (updater: (current: VisibilityState) => VisibilityState) => void;
  order: ColumnOrderState;
  moveColumn: (columnId: string, direction: -1 | 1) => void;
  reset: () => void;
}) {
  const hiddenCount = order.filter((id) => visibility[id] === false).length;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          <Settings2 className="size-4" />
          Kolumny
          {hiddenCount > 0 && <span className="text-muted-foreground ml-1 text-xs">({hiddenCount} ukryte)</span>}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-72 p-0">
        <div className="flex items-center justify-between px-3 py-2.5">
          <span className="text-sm font-medium">Widoczne kolumny</span>
          <Button variant="ghost" size="sm" onClick={reset} className="h-7 text-xs">
            <RotateCcw className="size-3" />
            Domyślne
          </Button>
        </div>

        <Separator />

        <ul className="max-h-96 overflow-y-auto p-1">
          {order.map((columnId, index) => {
            const visible = visibility[columnId] !== false;

            return (
              <li key={columnId} className="hover:bg-muted/50 flex items-center gap-2 rounded px-2 py-1.5">
                <Checkbox
                  id={`column-${columnId}`}
                  checked={visible}
                  onCheckedChange={(checked) =>
                    setVisibility((current) => ({ ...current, [columnId]: checked === true }))
                  }
                />
                <label htmlFor={`column-${columnId}`} className="flex-1 cursor-pointer text-sm">
                  {columnLabels[columnId] ?? columnId}
                </label>

                <div className="flex">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="size-7 p-0"
                    disabled={index === 0}
                    onClick={() => moveColumn(columnId, -1)}
                    aria-label={`Przesuń „${columnLabels[columnId]}” w lewo`}
                  >
                    <ArrowUp className="size-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="size-7 p-0"
                    disabled={index === order.length - 1}
                    onClick={() => moveColumn(columnId, 1)}
                    aria-label={`Przesuń „${columnLabels[columnId]}” w prawo`}
                  >
                    <ArrowDown className="size-3.5" />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
