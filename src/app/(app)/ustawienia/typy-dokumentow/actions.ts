"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/action-state";
import { runAction } from "@/server/actions/run-action";
import { createDocumentType, deleteDocumentType, updateDocumentType } from "@/server/services/document-types";

function readInput(formData: FormData) {
  return {
    name: String(formData.get("name") ?? ""),
    direction: String(formData.get("direction") ?? ""),
  };
}

export async function createDocumentTypeAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const type = await createDocumentType(readInput(formData));

    revalidatePath("/ustawienia/typy-dokumentow");
    revalidatePath("/dokumenty");
    return `Dodano typ „${type.name}”`;
  });
}

export async function updateDocumentTypeAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const type = await updateDocumentType(String(formData.get("id")), readInput(formData));

    revalidatePath("/ustawienia/typy-dokumentow");
    revalidatePath("/dokumenty");
    return `Zapisano typ „${type.name}”`;
  });
}

export async function deleteDocumentTypeAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    await deleteDocumentType(String(formData.get("id")));

    revalidatePath("/ustawienia/typy-dokumentow");
    return "Typ dokumentu usunięty";
  });
}
