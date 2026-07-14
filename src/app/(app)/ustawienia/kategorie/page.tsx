import { CategoryTree } from "@/components/settings/category-tree";
import { getCategoriesFlat, getCategoryTree } from "@/server/services/categories";

export default async function CategoriesPage() {
  const [tree, flat] = await Promise.all([getCategoryTree(), getCategoriesFlat()]);

  return (
    <section className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-medium">Drzewo kategorii</h2>
          <p className="text-muted-foreground mt-1 max-w-2xl text-sm">
            Kategorie mogą mieć dowolnie zagnieżdżone podkategorie. Filtrowanie rejestru po kategorii nadrzędnej
            obejmuje także dokumenty z jej podkategorii.
          </p>
        </div>
      </div>

      <CategoryTree tree={tree} options={flat} />
    </section>
  );
}
