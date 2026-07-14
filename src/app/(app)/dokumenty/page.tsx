import { DocumentsView } from "@/components/documents/documents-view";
import { getCategoriesFlat } from "@/server/services/categories";
import { getContractors } from "@/server/services/contractors";
import { toDocumentRow } from "@/server/services/document-rows";
import { getDocumentTypes } from "@/server/services/document-types";
import { listDocuments } from "@/server/services/documents";
import { parseListParams, toFilters, toSort } from "@/server/validation/list-params";

/**
 * Rejestr dokumentów.
 *
 * Filtrowanie, sortowanie i paginacja dzieją się w BAZIE, nie w przeglądarce — stan filtrów
 * jedzie w query stringu, ten komponent tłumaczy go na zapytanie i renderuje jedną stronę wyników.
 * Dzięki temu rejestr zachowuje się tak samo przy 50 i przy 50 000 faktur.
 */
export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = parseListParams(await searchParams);

  const [result, types, contractors, categories] = await Promise.all([
    listDocuments({
      filters: toFilters(params, "ACCEPTED"),
      sort: toSort(params),
      page: params.strona,
    }),
    getDocumentTypes(),
    getContractors(),
    getCategoriesFlat(),
  ]);

  return (
    <DocumentsView
      rows={result.documents.map(toDocumentRow)}
      total={result.total}
      page={result.page}
      pageCount={result.pageCount}
      types={types.map((type) => ({ id: type.id, name: type.name, direction: type.direction }))}
      contractors={contractors.map((contractor) => ({ id: contractor.id, name: contractor.name }))}
      categories={categories.map((category) => ({ id: category.id, path: category.path }))}
    />
  );
}
