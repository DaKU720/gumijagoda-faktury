import { z } from "zod";
import type { DocumentFilters, DocumentSort } from "@/server/services/documents";

/**
 * Filtry i sortowanie żyją w query stringu, nie w stanie Reacta.
 *
 * Trzy powody:
 *  - lista jest renderowana na serwerze, więc filtry muszą dojechać razem z requestem;
 *  - użytkownik może wysłać komuś link do przefiltrowanego widoku, a przycisk "wstecz" działa;
 *  - odświeżenie strony nie gubi filtrów.
 *
 * Query string to jednak wejście od użytkownika — może zawierać cokolwiek. Stąd walidacja:
 * `catch()` zamiast wyjątku, bo błędny parametr w URL-u nie może wywalić całej strony.
 */
const optional = z.string().trim().min(1).optional().catch(undefined);

export const listParamsSchema = z.object({
  typ: optional,
  kontrahent: optional,
  kategoria: optional,
  wystawiona_od: optional,
  wystawiona_do: optional,
  termin_od: optional,
  termin_do: optional,
  szukaj: optional,
  sortuj: z.enum(["issueDate", "dueDate", "number", "grossAmount", "createdAt"]).catch("issueDate"),
  kierunek: z.enum(["asc", "desc"]).catch("desc"),
  strona: z.coerce.number().int().min(1).catch(1),
});

export type ListParams = z.infer<typeof listParamsSchema>;

export function parseListParams(searchParams: Record<string, string | string[] | undefined>): ListParams {
  return listParamsSchema.parse(searchParams);
}

export function toFilters(params: ListParams, status: "BUFFER" | "ACCEPTED"): DocumentFilters {
  return {
    status,
    typeId: params.typ,
    contractorId: params.kontrahent,
    categoryId: params.kategoria,
    issueDateFrom: params.wystawiona_od,
    issueDateTo: params.wystawiona_do,
    dueDateFrom: params.termin_od,
    dueDateTo: params.termin_do,
    search: params.szukaj,
  };
}

export function toSort(params: ListParams): DocumentSort {
  return { field: params.sortuj, direction: params.kierunek };
}
