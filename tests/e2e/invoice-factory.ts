import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * Generator faktur XML dla testów e2e.
 *
 * Każdy przebieg testów tworzy fakturę z UNIKALNYM numerem. To pozwala testom być
 * jednocześnie deterministycznymi i nieniszczącymi: nie musimy czyścić bazy, żeby test
 * przeszedł, a mimo to wiemy dokładnie, czego szukać na ekranie.
 *
 * Ważny efekt uboczny: te same testy można puścić przeciwko WDROŻONEJ aplikacji
 * (E2E_BASE_URL=https://…), bo nie zakładają, że baza jest pusta ani że wolno ją skasować.
 *
 * NIP sprzedawcy jest stały i pochodzi z seeda (Kartoniaki) — sprawdzamy przy okazji, że import
 * dopasowuje istniejącego kontrahenta po NIP-ie i stosuje jego regułę auto-kategoryzacji,
 * zamiast zakładać duplikat firmy.
 */

export const SELLER_NIP = "5252248481"; // Kartoniaki Sp. z o.o. — kontrahent z seeda, reguła → Opakowania
export const BUYER_NIP = "6771102954"; // Gumijagoda Sp. z o.o. — my

export type TestInvoice = {
  number: string;
  filePath: string;
  netAmount: string;
  grossAmount: string;
  lineName: string;
};

export function createTestInvoice(): TestInvoice {
  // Numer musi przetrwać zderzenie z tym, co już jest w bazie (także na wdrożeniu),
  // więc bierze się ze znacznika czasu.
  const number = `E2E/${Date.now()}`;
  const lineName = "Karton testowy e2e";

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Faktura xmlns="http://crd.gov.pl/wzor/2023/06/29/12648/">
  <Naglowek>
    <KodFormularza kodSystemowy="FA (2)" wersjaSchemy="1-0E">FA</KodFormularza>
    <WariantFormularza>2</WariantFormularza>
    <DataWytworzeniaFa>2026-07-14T10:00:00Z</DataWytworzeniaFa>
  </Naglowek>
  <Podmiot1>
    <DaneIdentyfikacyjne>
      <NIP>${SELLER_NIP}</NIP>
      <Nazwa>Kartoniaki Sp. z o.o.</Nazwa>
    </DaneIdentyfikacyjne>
    <Adres>
      <KodKraju>PL</KodKraju>
      <AdresL1>ul. Tekturowa 12</AdresL1>
      <AdresL2>31-042 Kraków</AdresL2>
    </Adres>
  </Podmiot1>
  <Podmiot2>
    <DaneIdentyfikacyjne>
      <NIP>${BUYER_NIP}</NIP>
      <Nazwa>Gumijagoda Sp. z o.o.</Nazwa>
    </DaneIdentyfikacyjne>
  </Podmiot2>
  <Fa>
    <KodWaluty>PLN</KodWaluty>
    <P_1>2026-07-14</P_1>
    <P_2>${number}</P_2>
    <P_6>2026-07-14</P_6>
    <FaWiersz>
      <NrWierszaFa>1</NrWierszaFa>
      <P_7>${lineName}</P_7>
      <P_8A>szt</P_8A>
      <P_8B>100</P_8B>
      <P_9A>10.00</P_9A>
      <P_11>1000.00</P_11>
      <P_12>23</P_12>
    </FaWiersz>
    <P_13_1>1000.00</P_13_1>
    <P_14_1>230.00</P_14_1>
    <P_15>1230.00</P_15>
    <Platnosc>
      <TerminPlatnosci>
        <Termin>2026-07-28</Termin>
      </TerminPlatnosci>
      <RachunekBankowy>
        <NrRB>61109010140000071219812874</NrRB>
      </RachunekBankowy>
    </Platnosc>
  </Fa>
</Faktura>`;

  const directory = mkdtempSync(path.join(tmpdir(), "gumijagoda-e2e-"));
  const filePath = path.join(directory, "faktura.xml");
  writeFileSync(filePath, xml, "utf8");

  return { number, filePath, netAmount: "1000.00", grossAmount: "1230.00", lineName };
}
