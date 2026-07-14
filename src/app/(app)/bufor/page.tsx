import { BufferView } from "@/components/buffer/buffer-view";
import { env } from "@/server/env";
import { getCategoriesFlat } from "@/server/services/categories";
import { getContractors } from "@/server/services/contractors";
import { toDocumentRow } from "@/server/services/document-rows";
import { getDocumentTypes } from "@/server/services/document-types";
import { listDocuments } from "@/server/services/documents";
import { parseListParams, toFilters, toSort } from "@/server/validation/list-params";

/**
 * Bufor: dokumenty ze statusem BUFFER — pobrane z KSeF albo wgrane z pliku, czekające
 * na akceptację. Ta sama warstwa zapytań co rejestr, inny status. To bezpośrednia
 * konsekwencja modelu z ADR 0002 i powód, dla którego kod listy nie jest zduplikowany.
 */
export default async function BufferPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = parseListParams(await searchParams);

  const [result, types, contractors, categories] = await Promise.all([
    listDocuments({
      filters: toFilters(params, "BUFFER"),
      sort: toSort(params),
      page: params.strona,
      pageSize: 50,
    }),
    getDocumentTypes(),
    getContractors(),
    getCategoriesFlat(),
  ]);

  return (
    <BufferView
      rows={result.documents.map(toDocumentRow)}
      total={result.total}
      page={result.page}
      pageCount={result.pageCount}
      types={types.map((type) => ({ id: type.id, name: type.name, direction: type.direction }))}
      contractors={contractors.map((contractor) => ({ id: contractor.id, name: contractor.name }))}
      categories={categories.map((category) => ({ id: category.id, path: category.path }))}
      ksefMode={env.KSEF_MODE}
    />
  );
}
