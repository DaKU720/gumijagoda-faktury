"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/action-state";
import { runAction } from "@/server/actions/run-action";
import { acceptDocuments, rejectDocuments } from "@/server/services/buffer";

function readIds(formData: FormData): string[] {
  return formData.getAll("ids").map(String).filter(Boolean);
}

export async function acceptAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const count = await acceptDocuments(readIds(formData));

    revalidatePath("/bufor");
    revalidatePath("/dokumenty");

    if (count === 0) return "Wybrane dokumenty zostały już wcześniej rozpatrzone";
    return count === 1 ? "Dokument przeniesiony do rejestru" : `${count} dokumentów przeniesionych do rejestru`;
  });
}

export async function rejectAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const count = await rejectDocuments(readIds(formData));

    revalidatePath("/bufor");

    if (count === 0) return "Wybrane dokumenty zostały już wcześniej rozpatrzone";
    return count === 1 ? "Dokument odrzucony" : `${count} dokumentów odrzuconych`;
  });
}
