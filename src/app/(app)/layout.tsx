import Link from "next/link";
import { MainNav } from "@/components/layout/main-nav";
import { prisma } from "@/server/db";

/**
 * Szkielet aplikacji. Licznik dokumentów w buforze liczymy tutaj (Server Component),
 * bo widoczny jest w nawigacji na każdej stronie — dzięki temu jedno zapytanie
 * zamiast fetchowania z klienta na każdym widoku.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const bufferCount = await prisma.document.count({ where: { status: "BUFFER" } });

  return (
    <div className="flex min-h-screen flex-col">
      <header className="bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky top-0 z-40 border-b backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1600px] items-center gap-8 px-6">
          <Link href="/dokumenty" className="flex items-center gap-2.5">
            <span aria-hidden className="text-xl">
              🫐
            </span>
            <span className="text-[15px] leading-tight font-semibold">
              Gumijagoda
              <span className="text-muted-foreground block text-xs font-normal">ewidencja faktur</span>
            </span>
          </Link>

          <MainNav bufferCount={bufferCount} />
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1600px] flex-1 px-6 py-8">{children}</main>
    </div>
  );
}
