/** Formatowanie danych do wyświetlenia. Wspólne dla rejestru, bufora i podglądu. */

const moneyFormatter = new Intl.NumberFormat("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dateFormatter = new Intl.DateTimeFormat("pl-PL", { day: "2-digit", month: "2-digit", year: "numeric" });

/** Kwoty przychodzą z serwera jako string (Decimal), żeby po drodze nie zgubić groszy na float. */
export function formatMoney(amount: string | number, currency = "PLN"): string {
  const value = typeof amount === "string" ? Number(amount) : amount;
  return `${moneyFormatter.format(value)} ${currency}`;
}

export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return "—";
  return dateFormatter.format(typeof date === "string" ? new Date(date) : date);
}

/** Format dla inputu typu `date` (YYYY-MM-DD). */
export function toDateInput(date: string | Date | null | undefined): string {
  if (!date) return "";
  const value = typeof date === "string" ? new Date(date) : date;
  return value.toISOString().slice(0, 10);
}

/** Ile dni do terminu płatności; ujemne = po terminie. */
export function daysUntil(date: string | Date | null | undefined): number | null {
  if (!date) return null;
  const due = typeof date === "string" ? new Date(date) : date;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - today.getTime()) / 86_400_000);
}
