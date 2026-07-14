import { DocumentTypeList } from "@/components/settings/document-type-list";
import { getDocumentTypes } from "@/server/services/document-types";

export default async function DocumentTypesPage() {
  const types = await getDocumentTypes();

  const rows = types.map((type) => ({
    id: type.id,
    name: type.name,
    direction: type.direction,
    isSystem: type.isSystem,
    documentCount: type._count.documents,
  }));

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-medium">Typy dokumentów</h2>
        <p className="text-muted-foreground mt-1 max-w-2xl text-sm">
          Każdy typ ma <strong>kierunek</strong>: należność (pieniądze do otrzymania) albo zobowiązanie (do zapłaty).
          Poza fakturą sprzedażową i kosztową możesz dodać własne typy — np. notę obciążeniową czy odsetkową.
        </p>
      </div>

      <DocumentTypeList types={rows} />
    </section>
  );
}
