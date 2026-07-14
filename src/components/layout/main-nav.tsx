"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileText, Inbox, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

const links = [
  { href: "/dokumenty", label: "Rejestr dokumentów", icon: FileText },
  { href: "/bufor", label: "Bufor", icon: Inbox },
  { href: "/ustawienia", label: "Ustawienia", icon: Settings },
];

export function MainNav({ bufferCount }: { bufferCount: number }) {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-1">
      {links.map(({ href, label, icon: Icon }) => {
        const active = pathname.startsWith(href);

        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              active ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted",
            )}
          >
            <Icon className="size-4" />
            {label}
            {href === "/bufor" && bufferCount > 0 && (
              <span className="bg-primary text-primary-foreground ml-1 rounded-full px-1.5 py-0.5 text-xs leading-none font-semibold tabular-nums">
                {bufferCount}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
