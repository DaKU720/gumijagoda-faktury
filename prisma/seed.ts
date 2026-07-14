/**
 * Seed — dane testowe wymagane w deliverables zadania.
 *
 * Idempotentny (upserty po kluczach naturalnych), bo uruchamia się przy każdym starcie
 * kontenera. Odpalenie go dwa razy nie może zdublować danych — to zresztą ta sama zasada,
 * której pilnujemy przy imporcie faktur.
 *
 * Fabuła zgodna z zadaniem: Gumijagoda Sp. z o.o. kupuje opakowania, cukier, nawozy
 * i transport chłodniczy, a sprzedaje żelki i syropy cukierniom i sieciom handlowym.
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, DocumentDirection, DocumentSource, DocumentStatus } from "../src/generated/prisma/client";

// Seed łączy się z bazą tak samo jak aplikacja (adapter pg), ale tworzy własnego klienta:
// nie może importować src/server/db.ts, bo tamten moduł jest oznaczony "server-only"
// i żyje w kontekście Next.js, którego tu nie ma.
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  console.log("Seedowanie danych testowych...");

  // --- Typy dokumentów -------------------------------------------------------
  // Dwa typy systemowe (nieusuwalne — import z KSeF musi mieć do czego przypiąć dokument)
  // plus jeden własny, żeby od razu było widać, że użytkownik może definiować swoje.
  const [invoiceCost, invoiceSales] = await Promise.all([
    prisma.documentType.upsert({
      where: { name: "Faktura kosztowa" },
      update: {},
      create: { name: "Faktura kosztowa", direction: DocumentDirection.PAYABLE, isSystem: true },
    }),
    prisma.documentType.upsert({
      where: { name: "Faktura sprzedażowa" },
      update: {},
      create: { name: "Faktura sprzedażowa", direction: DocumentDirection.RECEIVABLE, isSystem: true },
    }),
  ]);

  await prisma.documentType.upsert({
    where: { name: "Nota obciążeniowa" },
    update: {},
    create: { name: "Nota obciążeniowa", direction: DocumentDirection.PAYABLE, isSystem: false },
  });

  // --- Drzewo kategorii ------------------------------------------------------
  // Dwa poziomy zagnieżdżenia, żeby widać było, że hierarchia naprawdę działa.
  async function upsertCategory(name: string, parentId: string | null) {
    const existing = await prisma.category.findFirst({ where: { name, parentId } });
    if (existing) return existing;
    return prisma.category.create({ data: { name, parentId } });
  }

  const costs = await upsertCategory("Koszty operacyjne", null);
  const production = await upsertCategory("Produkcja", costs.id);
  const packaging = await upsertCategory("Opakowania", production.id);
  const rawMaterials = await upsertCategory("Surowce", production.id);
  const logistics = await upsertCategory("Logistyka", costs.id);
  const coldTransport = await upsertCategory("Transport chłodniczy", logistics.id);
  const plantation = await upsertCategory("Plantacja", costs.id);
  await upsertCategory("Nawozy", plantation.id);
  const sales = await upsertCategory("Sprzedaż", null);
  const wholesale = await upsertCategory("Hurt", sales.id);

  // --- Kontrahenci -----------------------------------------------------------
  // NIP-y mają poprawne sumy kontrolne (walidacja by je odrzuciła, gdyby nie miały).
  // Część kontrahentów ma ustawioną kategorię domyślną — to reguła auto-kategoryzacji
  // "kontrahent -> kategoria" z wymagania 3.3, widoczna od razu po seedzie.
  const contractors = [
    {
      nip: "5252248481",
      name: "Kartoniaki Sp. z o.o.",
      address: "ul. Tekturowa 12, 31-042 Kraków",
      bankAccount: "61109010140000071219812874",
      defaultCategoryId: packaging.id,
    },
    {
      nip: "7010012356",
      name: "Cukrownia Beskidzka S.A.",
      address: "ul. Słodka 3, 43-300 Bielsko-Biała",
      bankAccount: "05102028920000390204873893",
      defaultCategoryId: rawMaterials.id,
    },
    {
      nip: "6771234561",
      name: "ChłodTrans Logistyka Sp. z o.o.",
      address: "ul. Mroźna 8, 30-698 Kraków",
      bankAccount: "37109024020000000610000434",
      defaultCategoryId: coldTransport.id,
    },
    {
      nip: "9542345674",
      name: "AgroNawóz Polska Sp. z o.o.",
      address: "ul. Polna 44, 40-020 Katowice",
      bankAccount: "45105000992301234567891234",
      defaultCategoryId: null, // celowo bez reguły — pokazuje kontrast w UI
    },
    {
      nip: "1132456789",
      name: "Cukiernia Pod Różą",
      address: "ul. Floriańska 14, 31-021 Kraków",
      bankAccount: "27114020040000300201355387",
      defaultCategoryId: wholesale.id,
    },
    {
      nip: "8992345679",
      name: "Sieć Handlowa Smakosz S.A.",
      address: "ul. Handlowa 100, 50-950 Wrocław",
      bankAccount: "83101010230000261395100000",
      defaultCategoryId: wholesale.id,
    },
  ];

  const saved = new Map<string, string>();
  for (const contractor of contractors) {
    const record = await prisma.contractor.upsert({
      where: { nip: contractor.nip },
      update: {},
      create: contractor,
    });
    saved.set(contractor.nip, record.id);
  }

  // --- Dokumenty -------------------------------------------------------------
  // Mieszanka: część w rejestrze (ACCEPTED), część w buforze (BUFFER) — żeby po
  // wejściu do aplikacji oba widoki miały co pokazać, jeszcze przed pierwszym importem.
  const documents = [
    {
      number: "FV/2026/06/118",
      typeId: invoiceCost.id,
      nip: "5252248481",
      issueDate: "2026-06-04",
      dueDate: "2026-06-18",
      net: 12400.0,
      vat: 2852.0,
      categoryId: packaging.id,
      source: DocumentSource.KSEF,
      ksefNumber: "5252248481-20260604-0100A1B2C3-4D",
      status: DocumentStatus.ACCEPTED,
    },
    {
      number: "FS/2026/06/002",
      typeId: invoiceCost.id,
      nip: "7010012356",
      issueDate: "2026-06-09",
      dueDate: "2026-07-09",
      net: 38500.0,
      vat: 3080.0,
      categoryId: rawMaterials.id,
      source: DocumentSource.KSEF,
      ksefNumber: "7010012356-20260609-0200B2C3D4-5E",
      status: DocumentStatus.ACCEPTED,
    },
    {
      number: "CT/06/2026/441",
      typeId: invoiceCost.id,
      nip: "6771234561",
      issueDate: "2026-06-15",
      dueDate: "2026-06-29",
      net: 7300.0,
      vat: 1679.0,
      categoryId: coldTransport.id,
      source: DocumentSource.MANUAL,
      ksefNumber: null,
      status: DocumentStatus.ACCEPTED,
    },
    {
      number: "GJ/2026/06/031",
      typeId: invoiceSales.id,
      nip: "1132456789",
      issueDate: "2026-06-20",
      dueDate: "2026-07-04",
      net: 4250.0,
      vat: 340.0,
      categoryId: wholesale.id,
      source: DocumentSource.KSEF,
      ksefNumber: "1132456789-20260620-0300C3D4E5-6F",
      status: DocumentStatus.ACCEPTED,
    },
    {
      number: "GJ/2026/06/032",
      typeId: invoiceSales.id,
      nip: "8992345679",
      issueDate: "2026-06-28",
      dueDate: "2026-07-28",
      net: 96800.0,
      vat: 7744.0,
      categoryId: wholesale.id,
      source: DocumentSource.KSEF,
      ksefNumber: "8992345679-20260628-0400D4E5F6-7A",
      status: DocumentStatus.ACCEPTED,
    },
    // --- w buforze, czekają na akceptację ---
    {
      number: "AN/2026/07/0091",
      typeId: invoiceCost.id,
      nip: "9542345674",
      issueDate: "2026-07-02",
      dueDate: "2026-07-16",
      net: 5600.0,
      vat: 1288.0,
      categoryId: null, // kontrahent bez reguły => brak auto-kategorii, użytkownik przypisze ręcznie
      source: DocumentSource.KSEF,
      ksefNumber: "9542345674-20260702-0500E5F6A7-8B",
      status: DocumentStatus.BUFFER,
    },
    {
      number: "FV/2026/07/004",
      typeId: invoiceCost.id,
      nip: "5252248481",
      issueDate: "2026-07-06",
      dueDate: "2026-07-20",
      net: 9100.0,
      vat: 2093.0,
      categoryId: packaging.id, // auto-kategoria z reguły kontrahenta
      source: DocumentSource.KSEF,
      ksefNumber: "5252248481-20260706-0600F6A7B8-9C",
      status: DocumentStatus.BUFFER,
    },
  ];

  for (const doc of documents) {
    const contractorId = saved.get(doc.nip)!;
    const net = doc.net;
    const vat = doc.vat;

    await prisma.document.upsert({
      where: { number_contractorId: { number: doc.number, contractorId } },
      update: {},
      create: {
        number: doc.number,
        typeId: doc.typeId,
        contractorId,
        categoryId: doc.categoryId,
        issueDate: new Date(doc.issueDate),
        dueDate: new Date(doc.dueDate),
        netAmount: net,
        vatAmount: vat,
        grossAmount: net + vat,
        currency: "PLN",
        paymentAccount: contractors.find((c) => c.nip === doc.nip)?.bankAccount ?? null,
        source: doc.source,
        ksefNumber: doc.ksefNumber,
        status: doc.status,
      },
    });
  }

  // --- Harmonogram -----------------------------------------------------------
  // Domyślnie wyłączony: świeżo postawiona instancja nie powinna sama strzelać do KSeF,
  // zanim użytkownik w ogóle skonfiguruje token. Godziny z przykładu z zadania (1:00, 2:00, 3:00).
  await prisma.ksefScheduleConfig.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default", enabled: false, hours: [1, 2, 3], lookbackDays: 7 },
  });

  const counts = await Promise.all([
    prisma.documentType.count(),
    prisma.category.count(),
    prisma.contractor.count(),
    prisma.document.count(),
  ]);

  console.log(
    `Gotowe: ${counts[0]} typów dokumentów, ${counts[1]} kategorii, ${counts[2]} kontrahentów, ${counts[3]} dokumentów.`,
  );
}

main()
  .catch((error) => {
    console.error("Seed nie powiódł się:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
