"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/action-state";
import { runAction } from "@/server/actions/run-action";
import { updateScheduleConfig } from "@/server/services/scheduler";

export async function updateScheduleAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const config = await updateScheduleConfig({
      enabled: formData.get("enabled") === "on",
      hours: formData.getAll("hours").map((hour) => Number(hour)),
      kinds: formData.getAll("kinds").map(String),
      lookbackDays: Number(formData.get("lookbackDays") ?? 7),
    });

    revalidatePath("/ustawienia/harmonogram");

    if (!config.enabled) return "Harmonogram wyłączony";
    if (config.hours.length === 0) return "Zapisano, ale nie wybrano żadnej godziny — nic się nie uruchomi";

    return `Harmonogram aktywny: pobieranie o ${config.hours.map((h) => `${String(h).padStart(2, "0")}:00`).join(", ")}`;
  });
}
