import { ScheduleForm } from "@/components/settings/schedule-form";
import { SyncHistory } from "@/components/settings/sync-history";
import { env, isKsefRealModeConfigured } from "@/server/env";
import { getRecentSyncRuns } from "@/server/services/ksef-sync";
import { getScheduleConfig } from "@/server/services/scheduler";

export default async function SchedulePage() {
  const [config, runs] = await Promise.all([getScheduleConfig(), getRecentSyncRuns(15)]);

  return (
    <div className="space-y-8">
      <ScheduleForm
        config={{
          enabled: config.enabled,
          hours: config.hours,
          kinds: config.kinds,
          lookbackDays: config.lookbackDays,
        }}
        ksefMode={env.KSEF_MODE}
        ksefConfigured={env.KSEF_MODE === "mock" || isKsefRealModeConfigured()}
      />

      <SyncHistory
        runs={runs.map((run) => ({
          id: run.id,
          trigger: run.trigger,
          kind: run.kind,
          status: run.status,
          dateFrom: run.dateFrom.toISOString(),
          dateTo: run.dateTo.toISOString(),
          foundCount: run.foundCount,
          importedCount: run.importedCount,
          skippedCount: run.skippedCount,
          error: run.error,
          startedAt: run.startedAt.toISOString(),
          finishedAt: run.finishedAt?.toISOString() ?? null,
        }))}
      />
    </div>
  );
}
