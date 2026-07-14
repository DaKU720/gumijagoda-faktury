import "server-only";
import { prisma } from "@/server/db";
import { DomainError, DuplicateError, isUniqueViolation } from "@/server/services/errors";
import { categorySchema } from "@/server/validation/schemas";

export type CategoryNode = {
  id: string;
  name: string;
  parentId: string | null;
  /** Ścieżka od korzenia, np. "Koszty operacyjne / Produkcja / Opakowania" — do wyświetlania w selectach. */
  path: string;
  depth: number;
  documentCount: number;
  children: CategoryNode[];
};

/**
 * Zwraca całe drzewo kategorii wraz z liczbą przypiętych dokumentów.
 *
 * Jedno zapytanie do bazy, drzewo składane w pamięci. Świadomie: kategorii są dziesiątki,
 * nie miliony — rekurencyjne CTE byłoby tu przedwczesną optymalizacją, a kod trudniejszy
 * do czytania. (Inaczej niż przy FILTROWANIU dokumentów po kategorii, gdzie potomków szukamy
 * już w bazie — tam wolumen danych jest zupełnie inny.)
 */
export async function getCategoryTree(): Promise<CategoryNode[]> {
  const categories = await prisma.category.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { documents: true } } },
  });

  const nodes = new Map<string, CategoryNode>();
  for (const category of categories) {
    nodes.set(category.id, {
      id: category.id,
      name: category.name,
      parentId: category.parentId,
      path: category.name,
      depth: 0,
      documentCount: category._count.documents,
      children: [],
    });
  }

  const roots: CategoryNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.parentId ? nodes.get(node.parentId) : undefined;
    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  // Ścieżki i głębokości liczymy dopiero po spięciu drzewa — inaczej rodzic mógłby
  // jeszcze nie mieć ustalonej własnej ścieżki.
  const assign = (node: CategoryNode, prefix: string, depth: number) => {
    node.path = prefix ? `${prefix} / ${node.name}` : node.name;
    node.depth = depth;
    for (const child of node.children) assign(child, node.path, depth + 1);
  };
  for (const root of roots) assign(root, "", 0);

  return roots;
}

/** Spłaszczone drzewo w kolejności "jak w drzewie" — do selectów i list. */
export async function getCategoriesFlat(): Promise<CategoryNode[]> {
  const flatten = (nodes: CategoryNode[]): CategoryNode[] =>
    nodes.flatMap((node) => [node, ...flatten(node.children)]);
  return flatten(await getCategoryTree());
}

/**
 * Wszystkie identyfikatory kategorii w poddrzewie (włącznie z korzeniem).
 *
 * Używane przy filtrowaniu dokumentów: użytkownik wybiera "Produkcja", a chce zobaczyć
 * też faktury z "Opakowania" i "Surowce". Rekurencyjne CTE, bo to zapytanie leci przy
 * każdym filtrowaniu rejestru i musi być tanie także przy dużym zbiorze dokumentów.
 */
export async function getCategorySubtreeIds(categoryId: string): Promise<string[]> {
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    WITH RECURSIVE subtree AS (
      SELECT id FROM "Category" WHERE id = ${categoryId}
      UNION ALL
      SELECT c.id FROM "Category" c JOIN subtree s ON c."parentId" = s.id
    )
    SELECT id FROM subtree
  `;
  return rows.map((row) => row.id);
}

export async function createCategory(input: unknown) {
  const data = categorySchema.parse(input);

  try {
    return await prisma.category.create({
      data: { name: data.name, parentId: data.parentId },
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new DuplicateError("Kategoria o tej nazwie już istnieje w tym miejscu drzewa", "name");
    }
    throw error;
  }
}

export async function updateCategory(id: string, input: unknown) {
  const data = categorySchema.parse(input);

  // Kategoria nie może zostać własnym przodkiem — inaczej powstałby cykl,
  // a rekurencyjne CTE przy filtrowaniu wpadłoby w nieskończoną pętlę.
  if (data.parentId) {
    if (data.parentId === id) {
      throw new DomainError("Kategoria nie może być swoim własnym rodzicem", "parentId");
    }
    const descendants = await getCategorySubtreeIds(id);
    if (descendants.includes(data.parentId)) {
      throw new DomainError("Nie można przenieść kategorii do jej własnej podkategorii", "parentId");
    }
  }

  try {
    return await prisma.category.update({
      where: { id },
      data: { name: data.name, parentId: data.parentId },
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new DuplicateError("Kategoria o tej nazwie już istnieje w tym miejscu drzewa", "name");
    }
    throw error;
  }
}

/**
 * Usunięcie kategorii. Blokujemy, gdy ma podkategorie lub przypisane dokumenty —
 * ciche kasowanie kaskadowe wyczyściłoby użytkownikowi kategoryzację całej ewidencji.
 */
export async function deleteCategory(id: string) {
  const [children, documents, contractors] = await Promise.all([
    prisma.category.count({ where: { parentId: id } }),
    prisma.document.count({ where: { categoryId: id } }),
    prisma.contractor.count({ where: { defaultCategoryId: id } }),
  ]);

  if (children > 0) {
    throw new DomainError("Najpierw usuń lub przenieś podkategorie");
  }
  if (documents > 0) {
    throw new DomainError(`Kategoria jest przypisana do ${documents} dokument(ów) — najpierw je przepnij`);
  }
  if (contractors > 0) {
    throw new DomainError(`Kategoria jest domyślną dla ${contractors} kontrahent(ów) — najpierw zmień regułę`);
  }

  await prisma.category.delete({ where: { id } });
}
