import { redirect } from "next/navigation";

/** Rejestr dokumentów jest ekranem startowym — to on jest sercem systemu. */
export default function Home() {
  redirect("/dokumenty");
}
