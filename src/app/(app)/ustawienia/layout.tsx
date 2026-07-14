import { SettingsNav } from "@/components/settings/settings-nav";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Ustawienia</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Słowniki systemu: typy dokumentów, kategorie kosztów, kontrahenci oraz harmonogram pobierania z KSeF.
        </p>
      </div>

      <SettingsNav />

      {children}
    </div>
  );
}
