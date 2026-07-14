/**
 * Kryptografia KSeF bez `node:crypto` — WYMAGANA zmiana przy migracji na Cloudflare Workers.
 *
 * DLACZEGO TO JEST KONIECZNE
 *
 * Nasz `RealKsefClient` robi dziś tak:
 *
 *   const certificate = new X509Certificate(Buffer.from(cert, "base64"));
 *   const pem = createPublicKey(certificate.publicKey).export({ type: "spki", format: "pem" });
 *   publicEncrypt({ key: pem, padding: RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" }, data);
 *
 * `X509Certificate` **nie jest zaimplementowane w silniku Cloudflare Workers** (workerd) — nawet
 * z flagą `nodejs_compat`. To brakujące API, nie kwestia konfiguracji. Kod, który go używa,
 * wysypie się w runtime na produkcji.
 *
 * ROZWIĄZANIE
 *
 * WebCrypto (`crypto.subtle`) potrafi zaimportować klucz publiczny w formacie **SPKI** i wykonać
 * RSA-OAEP. Brakuje mu tylko jednego: umiejętności wyciągnięcia SPKI z certyfikatu X.509.
 * Robimy to sami — minimalnym parserem DER.
 *
 * Brzmi groźniej niż jest. Certyfikat X.509 to zagnieżdżone „pudełka” w formacie TLV
 * (Type-Length-Value). Nie musimy go rozumieć w całości — musimy tylko dojść do siódmego pudełka
 * w środku pierwszego. Poniżej dokładnie to robimy.
 */

// --- Minimalny czytnik DER (Type-Length-Value) --------------------------------

type Tlv = {
  tag: number;
  /** Zawartość (bez nagłówka). */
  value: Uint8Array;
  /** Całe pudełko wraz z nagłówkiem — tego potrzebujemy, bo SPKI musi zachować własny nagłówek. */
  raw: Uint8Array;
  /** Gdzie w buforze kończy się to pudełko. */
  end: number;
};

/**
 * Czyta jedno pudełko TLV zaczynające się na pozycji `offset`.
 *
 * Format DER:
 *   [1 bajt: tag][długość][zawartość]
 *
 * Długość ma dwie postaci:
 *   - krótka: jeden bajt < 0x80, i to jest po prostu długość (np. 0x1A = 26 bajtów),
 *   - długa:  bajt >= 0x80, gdzie dolne 7 bitów mówi, ILE KOLEJNYCH bajtów tworzy liczbę-długość.
 *     Np. 0x82 0x01 0x0A = „długość zapisana na 2 bajtach” → 0x010A = 266 bajtów.
 */
function readTlv(data: Uint8Array, offset: number): Tlv {
  const start = offset;
  const tag = data[offset];
  offset += 1;

  let length = data[offset];
  offset += 1;

  if (length & 0x80) {
    const lengthBytes = length & 0x7f;
    length = 0;
    for (let i = 0; i < lengthBytes; i += 1) {
      length = length * 256 + data[offset];
      offset += 1;
    }
  }

  const end = offset + length;

  return {
    tag,
    value: data.subarray(offset, end),
    raw: data.subarray(start, end),
    end,
  };
}

/** Rozbija zawartość SEQUENCE na listę pudełek, które są w środku. */
function readChildren(sequence: Uint8Array): Tlv[] {
  const children: Tlv[] = [];
  let offset = 0;

  while (offset < sequence.length) {
    const tlv = readTlv(sequence, offset);
    children.push(tlv);
    offset = tlv.end;
  }

  return children;
}

/**
 * Wyciąga SubjectPublicKeyInfo (SPKI) z certyfikatu X.509 w formacie DER.
 *
 * Struktura certyfikatu (uproszczona, wg RFC 5280):
 *
 *   Certificate ::= SEQUENCE {
 *     tbsCertificate ::= SEQUENCE {
 *        [0] version              ← opcjonalne! tag 0xA0
 *        serialNumber             INTEGER
 *        signature                SEQUENCE
 *        issuer                   SEQUENCE
 *        validity                 SEQUENCE
 *        subject                  SEQUENCE
 *        subjectPublicKeyInfo     SEQUENCE   ← TEGO SZUKAMY
 *        ...
 *     }
 *     signatureAlgorithm
 *     signatureValue
 *   }
 *
 * Pole `version` jest opcjonalne, więc nie możemy po prostu wziąć „siódmego dziecka” —
 * trzeba sprawdzić, czy pierwsze dziecko ma tag 0xA0 (kontekstowy [0]) i odpowiednio przesunąć indeks.
 * To jedyna subtelność w całym parsowaniu.
 */
export function extractSpkiFromCertificate(certificateDer: Uint8Array): Uint8Array {
  const certificate = readTlv(certificateDer, 0);
  const tbsCertificate = readTlv(certificate.value, 0);
  const fields = readChildren(tbsCertificate.value);

  // Jeśli jest pole `version` ([0] EXPLICIT, tag 0xA0), reszta pól przesuwa się o jeden.
  const hasVersion = fields[0]?.tag === 0xa0;
  const spkiIndex = hasVersion ? 6 : 5;

  const spki = fields[spkiIndex];

  if (!spki || spki.tag !== 0x30) {
    throw new Error("Nie udało się odczytać klucza publicznego z certyfikatu KSeF (niepoprawna struktura DER)");
  }

  // Zwracamy CAŁE pudełko (`raw`, z nagłówkiem) — WebCrypto oczekuje kompletnej struktury SPKI.
  return spki.raw;
}

// --- Szyfrowanie tokena KSeF (WebCrypto zamiast node:crypto) ------------------

/**
 * Szyfruje `token|timestamp` kluczem publicznym Ministerstwa — algorytm RSA-OAEP z SHA-256,
 * dokładnie ten sam co w wersji na Node. Zmienia się wyłącznie API, nie kryptografia.
 *
 * `timestamp` pochodzi z odpowiedzi serwera (`/auth/challenge`) i pełni rolę jednorazowego nonce:
 * ten sam szyfrogram nie przejdzie drugi raz.
 */
export async function encryptKsefToken(params: {
  /** Certyfikat z `GET /security/public-key-certificates`, zakodowany w Base64 (DER). */
  certificateBase64: string;
  token: string;
  timestampMs: number;
}): Promise<string> {
  const certificateDer = base64ToBytes(params.certificateBase64);
  const spki = extractSpkiFromCertificate(certificateDer);

  const publicKey = await crypto.subtle.importKey(
    "spki",
    spki,
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["encrypt"],
  );

  const plaintext = new TextEncoder().encode(`${params.token}|${params.timestampMs}`);
  const encrypted = await crypto.subtle.encrypt({ name: "RSA-OAEP" }, publicKey, plaintext);

  return bytesToBase64(new Uint8Array(encrypted));
}

// --- Base64 bez Buffera (Buffer jest w Workers, ale te funkcje są uniwersalne) ---

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

/**
 * JAK TO WPIĄĆ W `RealKsefClient`
 *
 * Zamiast metody `fetchPublicKey()` (która zwracała PEM) i wywołania `publicEncrypt(...)`:
 *
 *   const certificates = await this.request<PublicKeyCertificate[]>("/api/v2/security/public-key-certificates", { method: "GET" });
 *   const usable = pickValidCertificate(certificates);   // ta sama logika co dziś: bierzemy ważny „teraz”
 *
 *   const encryptedToken = await encryptKsefToken({
 *     certificateBase64: usable.certificate,
 *     token: this.token,
 *     timestampMs: challenge.timestampMs,
 *   });
 *
 * Reszta klienta (challenge → init → polling → redeem → refresh) NIE WYMAGA ŻADNYCH ZMIAN —
 * to zwykłe wywołania `fetch`, które w Workers działają natywnie.
 *
 * WERYFIKACJA: parser DER i szyfrowanie da się przetestować jednostkowo, bez sieci — wystarczy
 * jeden prawdziwy certyfikat w pliku fixture i porównanie SPKI z wynikiem `openssl x509 -pubkey`.
 * Warto to zrobić PRZED wdrożeniem, bo błąd tutaj objawi się dopiero jako odmowa uwierzytelnienia
 * po stronie MF — czyli w najgorszym możliwym momencie.
 */
