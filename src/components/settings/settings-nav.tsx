"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const tabs = [
  { href: "/ustawienia/kategorie", label: "Kategorie" },
  { href: "/ustawienia/kontrahenci", label: "Kontrahenci" },
  { href: "/ustawienia/typy-dokumentow", label: "Typy dokumentów" },
  { href: "/ustawienia/harmonogram", label: "Harmonogram KSeF" },
];

export function SettingsNav() {
  const pathname = usePathname();

  return (
    <div className="border-b">
      <nav className="-mb-px flex gap-6">
        {tabs.map((tab) => {
          const active = pathname.startsWith(tab.href);

          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "border-b-2 px-1 pb-3 text-sm font-medium transition-colors",
                active
                  ? "border-primary text-foreground"
                  : "text-muted-foreground hover:text-foreground border-transparent",
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
