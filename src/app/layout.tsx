import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  // latin-ext jest konieczne — bez niego "ł", "ż", "ę" spadają na font zastępczy
  subsets: ["latin", "latin-ext"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin", "latin-ext"],
});

export const metadata: Metadata = {
  title: "Gumijagoda — faktury",
  description: "Ewidencja faktur: rejestr, KSeF, kategoryzacja, podgląd dokumentów",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pl" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="bg-background text-foreground min-h-full">
        {children}
        <Toaster position="top-right" richColors />
      </body>
    </html>
  );
}
