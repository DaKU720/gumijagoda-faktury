"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/action-state";
import { runAction } from "@/server/actions/run-action";
import { createContractor, deleteContractor, updateContractor } from "@/server/services/contractors";

const NO_CATEGORY = "__none__";

function readContractorInput(formData: FormData) {
  const category = String(formData.get("defaultCategoryId") ?? "");

  return {
    name: String(formData.get("name") ?? ""),
    nip: String(formData.get("nip") ?? ""),
    address: String(formData.get("address") ?? ""),
    bankAccount: String(formData.get("bankAccount") ?? ""),
    defaultCategoryId: category === NO_CATEGORY ? "" : category,
  };
}

export async function createContractorAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const contractor = await createContractor(readContractorInput(formData));

    revalidatePath("/ustawienia/kontrahenci");
    revalidatePath("/dokumenty");
    return `Dodano kontrahenta „${contractor.name}”`;
  });
}

export async function updateContractorAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const contractor = await updateContractor(String(formData.get("id")), readContractorInput(formData));

    revalidatePath("/ustawienia/kontrahenci");
    revalidatePath("/dokumenty");
    return `Zapisano kontrahenta „${contractor.name}”`;
  });
}

export async function deleteContractorAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    await deleteContractor(String(formData.get("id")));

    revalidatePath("/ustawienia/kontrahenci");
    return "Kontrahent usunięty";
  });
}
