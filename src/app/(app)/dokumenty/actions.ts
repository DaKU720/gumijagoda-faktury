"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/action-state";
import { runAction } from "@/server/actions/run-action";
import { createDocument, deleteDocument, setDocumentCategory, updateDocument } from "@/server/services/documents";

const NO_CATEGORY = "__none__";

function readDocumentInput(formData: FormData) {
  const category = String(formData.get("categoryId") ?? "");

  return {
    number: String(formData.get("number") ?? ""),
    typeId: String(formData.get("typeId") ?? ""),
    contractorId: String(formData.get("contractorId") ?? ""),
    categoryId: category === NO_CATEGORY ? "" : category,
    issueDate: String(formData.get("issueDate") ?? ""),
    dueDate: String(formData.get("dueDate") ?? ""),
    netAmount: String(formData.get("netAmount") ?? ""),
    vatAmount: String(formData.get("vatAmount") ?? ""),
    grossAmount: String(formData.get("grossAmount") ?? ""),
    currency: String(formData.get("currency") || "PLN"),
    paymentAccount: String(formData.get("paymentAccount") ?? ""),
    notes: String(formData.get("notes") ?? ""),
  };
}

export async function createDocumentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const document = await createDocument(readDocumentInput(formData));

    revalidatePath("/dokumenty");
    return `Dodano dokument „${document.number}”`;
  });
}

export async function updateDocumentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const document = await updateDocument(String(formData.get("id")), readDocumentInput(formData));

    revalidatePath("/dokumenty");
    revalidatePath("/bufor");
    return `Zapisano dokument „${document.number}”`;
  });
}

export async function deleteDocumentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    await deleteDocument(String(formData.get("id")));

    revalidatePath("/dokumenty");
    revalidatePath("/bufor");
    return "Dokument usunięty";
  });
}

/** Szybka zmiana kategorii wprost z listy — bez otwierania całego formularza. */
export async function setCategoryAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const category = String(formData.get("categoryId") ?? "");
    await setDocumentCategory(String(formData.get("id")), category === NO_CATEGORY || !category ? null : category);

    revalidatePath("/dokumenty");
    revalidatePath("/bufor");
    return "Kategoria zaktualizowana";
  });
}
