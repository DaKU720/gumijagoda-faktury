import { readFileSync } from "node:fs";
import path from "node:path";
import { FaParseError, parseFaXml } from "@/server/domain/fa-parser";

/**
 * Parser faktur ustrukturyzowanych.
 *
 * Testujemy na tych samych plikach, których używa MockKsefClient — więc test sprawdza
 * dokładnie ten XML, który przechodzi przez produkcyjną ścieżkę importu, a nie sztuczny
 * przykład napisany pod test.
 */
const fixture = (name: string) =>
  readFileSync(path.join(process.cwd(), "src", "server", "ksef", "fixtures", name), "utf8");

describe("parser FA(2)", () => {
  const invoice = parseFaXml(fixture("fa2-kosztowa-kartoniaki.xml"));

  it("rozpoznaje wersję schematu", () => {
    expect(invoice.schemaVersion).toBe("FA(2)");
  });

  it("czyta nagłówek faktury", () => {
    expect(invoice.number).toBe("FV/2026/07/117");
    expect(invoice.issueDate).toBe("2026-07-08");
    expect(invoice.dueDate).toBe("2026-07-22");
    expect(invoice.currency).toBe("PLN");
  });

  it("czyta obie strony transakcji wraz z adresami", () => {
    expect(invoice.seller.nip).toBe("5252248481");
    expect(invoice.seller.name).toBe("Kartoniaki Sp. z o.o.");
    expect(invoice.seller.address).toContain("Tekturowa");
    expect(invoice.buyer.nip).toBe("6771102954");
  });

  it("sumuje kwoty tak, że netto + VAT = brutto", () => {
    expect(invoice.netAmount).toBe(11000);
    expect(invoice.vatAmount).toBe(2530);
    expect(invoice.grossAmount).toBe(13530);
    expect(invoice.netAmount + invoice.vatAmount).toBeCloseTo(invoice.grossAmount, 2);
  });

  it("czyta pozycje faktury", () => {
    expect(invoice.lines).toHaveLength(2);
    expect(invoice.lines[0]).toMatchObject({
      no: 1,
      name: "Karton fałdowy 300x200x150 z nadrukiem",
      unit: "szt",
      quantity: 4000,
      netValue: 8400,
      vatRate: "23",
    });
  });

  it("czyta rachunek do zapłaty", () => {
    expect(invoice.paymentAccount).toBe("61109010140000071219812874");
  });
});

describe("parser FA(3)", () => {
  const invoice = parseFaXml(fixture("fa3-kosztowa-chlodtrans.xml"));

  it("rozpoznaje nowszy schemat", () => {
    expect(invoice.schemaVersion).toBe("FA(3)");
  });

  it("sumuje wiele stawek VAT, zamiast czytać jedno pole", () => {
    // 7200 (23%) + 1500 (8%) = 8700 netto; 1656 + 120 = 1776 VAT.
    // To jest sedno: gdyby parser czytał tylko P_13_1, zgubiłby całą pozycję ze stawką 8%.
    expect(invoice.netAmount).toBe(8700);
    expect(invoice.vatAmount).toBe(1776);
    expect(invoice.grossAmount).toBe(10476);
  });

  it("czyta pozycje z różnymi stawkami", () => {
    expect(invoice.lines.map((line) => line.vatRate)).toEqual(["23", "8"]);
  });
});

describe("parser — faktura sprzedażowa", () => {
  const invoice = parseFaXml(fixture("fa2-sprzedazowa-smakosz.xml"));

  it("widzi nas po stronie sprzedawcy", () => {
    expect(invoice.seller.nip).toBe("6771102954");
    expect(invoice.buyer.name).toBe("Sieć Handlowa Smakosz S.A.");
  });
});

describe("parser — przypadki brzegowe", () => {
  it("odrzuca plik, który nie jest fakturą KSeF", () => {
    expect(() => parseFaXml("<Cokolwiek><Innego/></Cokolwiek>")).toThrow(FaParseError);
  });

  it("odrzuca niepoprawny XML", () => {
    expect(() => parseFaXml("to nie jest xml")).toThrow(FaParseError);
  });

  it("odrzuca fakturę bez numeru", () => {
    const xml = `<Faktura><Naglowek><WariantFormularza>2</WariantFormularza></Naglowek><Fa><P_1>2026-07-01</P_1></Fa></Faktura>`;
    expect(() => parseFaXml(xml)).toThrow(/numeru/i);
  });

  it("radzi sobie z fakturą bez terminu płatności i bez rachunku", () => {
    // Faktura płatna gotówką: brak sekcji Platnosc. Nie wolno się na tym wywrócić —
    // brak terminu to poprawny stan, a nie błąd.
    const xml = `<Faktura xmlns="http://crd.gov.pl/wzor/2023/06/29/12648/">
      <Naglowek><WariantFormularza>2</WariantFormularza></Naglowek>
      <Podmiot1><DaneIdentyfikacyjne><NIP>5252248481</NIP><Nazwa>Sprzedawca</Nazwa></DaneIdentyfikacyjne></Podmiot1>
      <Podmiot2><DaneIdentyfikacyjne><NIP>6771102954</NIP><Nazwa>Nabywca</Nazwa></DaneIdentyfikacyjne></Podmiot2>
      <Fa><KodWaluty>PLN</KodWaluty><P_1>2026-07-01</P_1><P_2>GOT/1</P_2>
        <P_13_1>100.00</P_13_1><P_14_1>23.00</P_14_1><P_15>123.00</P_15>
      </Fa></Faktura>`;

    const invoice = parseFaXml(xml);

    expect(invoice.dueDate).toBeNull();
    expect(invoice.paymentAccount).toBeNull();
    expect(invoice.lines).toHaveLength(0);
    expect(invoice.grossAmount).toBe(123);
  });

  it("nie zamienia numeru faktury na liczbę", () => {
    // Klasyczna pułapka parserów XML: "2026/07/001" po automatycznej konwersji przestaje
    // być numerem faktury. Dlatego parsowanie wartości jest wyłączone.
    const xml = `<Faktura xmlns="http://crd.gov.pl/wzor/2023/06/29/12648/">
      <Naglowek><WariantFormularza>2</WariantFormularza></Naglowek>
      <Podmiot1><DaneIdentyfikacyjne><NIP>5252248481</NIP><Nazwa>S</Nazwa></DaneIdentyfikacyjne></Podmiot1>
      <Podmiot2><DaneIdentyfikacyjne><NIP>6771102954</NIP><Nazwa>N</Nazwa></DaneIdentyfikacyjne></Podmiot2>
      <Fa><P_1>2026-07-01</P_1><P_2>0001</P_2><P_15>1.00</P_15></Fa></Faktura>`;

    expect(parseFaXml(xml).number).toBe("0001");
  });
});
