"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/action-state";
import { runAction } from "@/server/actions/run-action";
import { createCategory, deleteCategory, updateCategory } from "@/server/services/categories";

/**
 * Warstwa wejścia: wyciągnij dane z FormData, oddaj do serwisu, odśwież widok.
 * Zero reguł biznesowych — te siedzą w `src/server/services/categories.ts`.
 */

/**
 * Komponent Select (Radix) nie dopuszcza pustej wartości jako opcji, więc "brak rodzica"
 * jedzie przez sentinel. Tłumaczymy go z powrotem na pustkę tu, na granicy — dalej w głąb
 * systemu nie przecieka nic, co pachnie UI.
 */
const NO_PARENT = "__root__";

function readParentId(formData: FormData): string {
  const value = String(formData.get("parentId") ?? "");
  return value === NO_PARENT ? "" : value;
}

export async function createCategoryAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const category = await createCategory({
      name: String(formData.get("name") ?? ""),
      parentId: readParentId(formData),
    });

    revalidatePath("/ustawienia/kategorie");
    return `Dodano kategorię „${category.name}”`;
  });
}

export async function updateCategoryAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const category = await updateCategory(String(formData.get("id")), {
      name: String(formData.get("name") ?? ""),
      parentId: readParentId(formData),
    });

    revalidatePath("/ustawienia/kategorie");
    return `Zapisano kategorię „${category.name}”`;
  });
}

export async function deleteCategoryAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    await deleteCategory(String(formData.get("id")));

    revalidatePath("/ustawienia/kategorie");
    return "Kategoria usunięta";
  });
}
