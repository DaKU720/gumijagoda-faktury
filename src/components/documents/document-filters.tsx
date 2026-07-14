"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const ALL = "__all__";

export type FilterOptions = {
  types: { id: string; name: string }[];
  contractors: { id: string; name: string }[];
  categories: { id: string; path: string }[];
};

/**
 * Filtry zapisują się w query stringu, nie w stanie komponentu.
 *
 * Konsekwencja: każda zmiana filtra to nawigacja, więc lista przeładowuje się na serwerze
 * ze świeżym zapytaniem do bazy. Zawijamy to w `useTransition`, żeby UI nie zamarzał —
 * poprzednie wyniki zostają na ekranie (przygaszone), zamiast migać pustą tabelą.
 */
export function DocumentFilters({ options }: { options: FilterOptions }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const setParam = (key: string, value: string | null) => {
    const params = new URLSearchParams(searchParams);

    if (!value || value === ALL) {
      params.delete(key);
    } else {
      params.set(key, value);
    }

    // Każda zmiana filtra wraca na pierwszą stronę. Bez tego użytkownik stojący na stronie 4
    // po zawężeniu filtrów wylądowałby na pustej stronie i pomyślał, że nic nie znaleziono.
    params.delete("strona");

    startTransition(() => router.push(`?${params.toString()}`, { scroll: false }));
  };

  const value = (key: string) => searchParams.get(key) ?? "";
  const hasFilters = [...searchParams.keys()].some((key) => key !== "sortuj" && key !== "kierunek" && key !== "strona");

  return (
    <div className={pending ? "opacity-60 transition-opacity" : "transition-opacity"}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
        <div className="space-y-1.5 xl:col-span-1">
          <Label htmlFor="filter-search" className="text-xs">
            Szukaj
          </Label>
          <div className="relative">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
            <Input
              id="filter-search"
              defaultValue={value("szukaj")}
              placeholder="numer, kontrahent, NIP…"
              className="pl-8"
              onKeyDown={(event) => {
                if (event.key === "Enter") setParam("szukaj", event.currentTarget.value);
              }}
              onBlur={(event) => {
                if (event.currentTarget.value !== value("szukaj")) setParam("szukaj", event.currentTarget.value);
              }}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="filter-type" className="text-xs">
            Typ dokumentu
          </Label>
          <Select value={value("typ") || ALL} onValueChange={(next) => setParam("typ", next)}>
            <SelectTrigger id="filter-type" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Wszystkie typy</SelectItem>
              {options.types.map((type) => (
                <SelectItem key={type.id} value={type.id}>
                  {type.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="filter-contractor" className="text-xs">
            Kontrahent
          </Label>
          <Select value={value("kontrahent") || ALL} onValueChange={(next) => setParam("kontrahent", next)}>
            <SelectTrigger id="filter-contractor" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Wszyscy kontrahenci</SelectItem>
              {options.contractors.map((contractor) => (
                <SelectItem key={contractor.id} value={contractor.id}>
                  {contractor.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="filter-category" className="text-xs">
            Kategoria
          </Label>
          <Select value={value("kategoria") || ALL} onValueChange={(next) => setParam("kategoria", next)}>
            <SelectTrigger id="filter-category" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Wszystkie kategorie</SelectItem>
              {options.categories.map((category) => (
                <SelectItem key={category.id} value={category.id}>
                  {category.path}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-muted-foreground text-xs">Obejmuje podkategorie</p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label htmlFor="filter-issue-from" className="text-xs">
              Wystawiono od
            </Label>
            <Input
              id="filter-issue-from"
              type="date"
              defaultValue={value("wystawiona_od")}
              onChange={(event) => setParam("wystawiona_od", event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="filter-issue-to" className="text-xs">
              do
            </Label>
            <Input
              id="filter-issue-to"
              type="date"
              defaultValue={value("wystawiona_do")}
              onChange={(event) => setParam("wystawiona_do", event.target.value)}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label htmlFor="filter-due-from" className="text-xs">
              Termin od
            </Label>
            <Input
              id="filter-due-from"
              type="date"
              defaultValue={value("termin_od")}
              onChange={(event) => setParam("termin_od", event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="filter-due-to" className="text-xs">
              do
            </Label>
            <Input
              id="filter-due-to"
              type="date"
              defaultValue={value("termin_do")}
              onChange={(event) => setParam("termin_do", event.target.value)}
            />
          </div>
        </div>
      </div>

      {hasFilters && (
        <Button
          variant="ghost"
          size="sm"
          className="mt-3"
          onClick={() => startTransition(() => router.push("?", { scroll: false }))}
        >
          <X className="size-4" />
          Wyczyść filtry
        </Button>
      )}
    </div>
  );
}
