import { ContractorList } from "@/components/settings/contractor-list";
import { getCategoriesFlat } from "@/server/services/categories";
import { getContractors } from "@/server/services/contractors";

export default async function ContractorsPage() {
  const [contractors, categories] = await Promise.all([getContractors(), getCategoriesFlat()]);

  // Prisma zwraca obiekty z relacjami i licznikami; do klienta przekazujemy tylko to,
  // co UI faktycznie rysuje. Mniej danych przez granicę serwer→klient, mniej sprzężenia.
  const rows = contractors.map((contractor) => ({
    id: contractor.id,
    name: contractor.name,
    nip: contractor.nip,
    address: contractor.address,
    bankAccount: contractor.bankAccount,
    defaultCategoryId: contractor.defaultCategoryId,
    defaultCategoryName: contractor.defaultCategory?.name ?? null,
    documentCount: contractor._count.documents,
  }));

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-medium">Kontrahenci</h2>
        <p className="text-muted-foreground mt-1 max-w-2xl text-sm">
          Kontrahent z ustawioną <strong>kategorią domyślną</strong> działa jak reguła automatycznej kategoryzacji:
          każdy jego dokument — pobrany z KSeF, wgrany czy dodany ręcznie — od razu trafia do tej kategorii.
        </p>
      </div>

      <ContractorList contractors={rows} categories={categories} />
    </section>
  );
}
