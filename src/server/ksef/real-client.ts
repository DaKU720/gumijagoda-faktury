import { constants, createPublicKey, publicEncrypt, X509Certificate } from "node:crypto";
import type { KsefClient, KsefInvoiceRef, KsefQuery } from "@/server/ksef/client";
import { KsefError } from "@/server/ksef/client";

/**
 * Klient KSeF API 2.0 — środowisko TESTOWE Ministerstwa Finansów.
 *
 * Uwierzytelnienie w KSeF nie jest zwykłym „wyślij token w nagłówku”. To sześcioetapowy taniec,
 * zaprojektowany tak, żeby token nigdy nie przeleciał przez sieć w postaci jawnej i żeby nie dało
 * się powtórzyć przechwyconego żądania:
 *
 *   1. pobierz certyfikat klucza publicznego MF        GET  /security/public-key-certificates
 *   2. poproś o wyzwanie (challenge + znacznik czasu)  POST /auth/challenge
 *   3. zaszyfruj "token|timestamp" kluczem MF (RSA-OAEP SHA-256)
 *      → timestamp pełni rolę jednorazowego nonce: ten sam szyfrogram nie przejdzie drugi raz
 *   4. wyślij wyzwanie + szyfrogram                    POST /auth/ksef-token   → token tymczasowy
 *   5. odpytuj o status operacji                       GET  /auth/{referenceNumber}
 *   6. wymień token tymczasowy na docelowy             POST /auth/token/redeem → accessToken + refreshToken
 *
 * `accessToken` żyje kilkanaście minut, `refreshToken` do 7 dni — dlatego trzymamy oba
 * i odświeżamy dostęp bez powtarzania całego tańca (POST /auth/token/refresh).
 *
 * Kryptografia: wyłącznie wbudowany `node:crypto`. Żadnej zewnętrznej biblioteki —
 * RSA-OAEP z SHA-256 jest w standardzie Node, a mniej zależności w kodzie dotykającym
 * sekretów to mniej powierzchni ataku.
 */

type TokenSet = {
  accessToken: string;
  /** Znacznik wygaśnięcia accessTokena (ms) — odświeżamy z zapasem, nie czekamy na 401. */
  accessTokenExpiresAt: number;
  refreshToken: string;
};

/** Zapas przed wygaśnięciem tokena: lepiej odświeżyć minutę za wcześnie niż sekundę za późno. */
const TOKEN_REFRESH_MARGIN_MS = 60_000;
const AUTH_POLL_INTERVAL_MS = 1_000;
const AUTH_POLL_TIMEOUT_MS = 30_000;

/** Kody statusu operacji uwierzytelnienia wg dokumentacji MF. */
const AUTH_IN_PROGRESS = 100;
const AUTH_SUCCESS = 200;

export class RealKsefClient implements KsefClient {
  private tokens: TokenSet | null = null;

  constructor(
    private readonly baseUrl: string,
    private readonly nip: string,
    private readonly token: string,
  ) {}

  // --- Publiczne API (kontrakt KsefClient) -----------------------------------

  async listInvoices(query: KsefQuery): Promise<KsefInvoiceRef[]> {
    const accessToken = await this.getAccessToken();

    // Subject1 = jesteśmy sprzedawcą (faktury sprzedażowe), Subject2 = jesteśmy nabywcą (kosztowe).
    const subjectType = query.kind === "SALES" ? "Subject1" : "Subject2";

    const invoices: KsefInvoiceRef[] = [];
    const pageSize = 100;
    let pageOffset = 0;

    // KSeF stronicuje wyniki. Pobieramy do skutku — inaczej przy większym zakresie dat
    // cicho zgubilibyśmy wszystko poza pierwszą setką faktur.
    for (;;) {
      const response = await this.request<{ invoices?: KsefInvoiceMetadata[]; hasMore?: boolean }>(
        `/api/v2/invoices/query/metadata?pageOffset=${pageOffset}&pageSize=${pageSize}`,
        {
          method: "POST",
          accessToken,
          body: {
            subjectType,
            dateRange: {
              dateType: "Issue", // filtrujemy po dacie WYSTAWIENIA — tak myśli księgowość
              from: toKsefDate(query.dateFrom),
              to: toKsefDate(query.dateTo),
            },
          },
        },
      );

      for (const invoice of response.invoices ?? []) {
        invoices.push(toInvoiceRef(invoice));
      }

      if (!response.hasMore || (response.invoices ?? []).length === 0) break;
      pageOffset += pageSize;
    }

    return invoices;
  }

  async fetchInvoiceXml(ksefNumber: string): Promise<string> {
    const accessToken = await this.getAccessToken();

    const response = await fetch(`${this.baseUrl}/api/v2/invoices/ksef/${encodeURIComponent(ksefNumber)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      throw new KsefError(
        `Nie udało się pobrać faktury ${ksefNumber} z KSeF (HTTP ${response.status})`,
        response.status,
      );
    }

    // Ten endpoint zwraca surowy XML (application/xml), nie JSON.
    return response.text();
  }

  // --- Uwierzytelnienie ------------------------------------------------------

  private async getAccessToken(): Promise<string> {
    if (this.tokens && Date.now() < this.tokens.accessTokenExpiresAt - TOKEN_REFRESH_MARGIN_MS) {
      return this.tokens.accessToken;
    }

    if (this.tokens) {
      try {
        return await this.refreshAccessToken();
      } catch {
        // Refresh token też wygasł (albo sesja została unieważniona) — przechodzimy
        // pełną ścieżkę uwierzytelnienia zamiast zwracać błąd użytkownikowi.
        this.tokens = null;
      }
    }

    return this.authenticate();
  }

  private async refreshAccessToken(): Promise<string> {
    const response = await this.request<{ accessToken: TokenInfo }>("/api/v2/auth/token/refresh", {
      method: "POST",
      accessToken: this.tokens!.refreshToken,
    });

    this.tokens = {
      ...this.tokens!,
      accessToken: response.accessToken.token,
      accessTokenExpiresAt: parseValidUntil(response.accessToken),
    };

    return this.tokens.accessToken;
  }

  private async authenticate(): Promise<string> {
    // 1–2. Klucz publiczny MF i wyzwanie.
    const [publicKeyPem, challenge] = await Promise.all([this.fetchPublicKey(), this.fetchChallenge()]);

    // 3. Szyfrogram: "token|timestamp". Timestamp z odpowiedzi serwera (nie lokalny zegar!) —
    //    to on czyni żądanie jednorazowym i chroni przed powtórzeniem.
    const encryptedToken = publicEncrypt(
      {
        key: publicKeyPem,
        padding: constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: "sha256",
      },
      Buffer.from(`${this.token}|${challenge.timestampMs}`, "utf8"),
    ).toString("base64");

    // 4. Inicjacja uwierzytelnienia → token tymczasowy + numer referencyjny operacji.
    const init = await this.request<{ authenticationToken: TokenInfo; referenceNumber: string }>(
      "/api/v2/auth/ksef-token",
      {
        method: "POST",
        body: {
          challenge: challenge.challenge,
          contextIdentifier: { type: "nip", value: this.nip },
          encryptedToken,
        },
      },
    );

    // 5. Uwierzytelnienie jest asynchroniczne — odpytujemy, aż KSeF potwierdzi.
    await this.waitForAuth(init.referenceNumber, init.authenticationToken.token);

    // 6. Wymiana tokena tymczasowego na docelowy.
    const redeemed = await this.request<{ accessToken: TokenInfo; refreshToken: TokenInfo }>(
      "/api/v2/auth/token/redeem",
      { method: "POST", accessToken: init.authenticationToken.token },
    );

    this.tokens = {
      accessToken: redeemed.accessToken.token,
      accessTokenExpiresAt: parseValidUntil(redeemed.accessToken),
      refreshToken: redeemed.refreshToken.token,
    };

    return this.tokens.accessToken;
  }

  private async fetchPublicKey(): Promise<string> {
    const certificates = await this.request<PublicKeyCertificate[]>("/api/v2/security/public-key-certificates", {
      method: "GET",
    });

    // MF potrafi wystawić kilka certyfikatów (rotacja kluczy). Bierzemy ten, który
    // obowiązuje TERAZ — użycie wygasłego skończyłoby się odrzuceniem szyfrogramu.
    const now = Date.now();
    const usable =
      certificates.find(
        (certificate) =>
          Date.parse(certificate.validFrom) <= now && Date.parse(certificate.validTo) >= now,
      ) ?? certificates[0];

    if (!usable) {
      throw new KsefError("KSeF nie udostępnił certyfikatu klucza publicznego");
    }

    // Certyfikat przychodzi jako DER zakodowany w Base64. Wyciągamy z niego klucz publiczny.
    const certificate = new X509Certificate(Buffer.from(usable.certificate, "base64"));
    return createPublicKey(certificate.publicKey).export({ type: "spki", format: "pem" }).toString();
  }

  private async fetchChallenge(): Promise<{ challenge: string; timestampMs: number }> {
    const response = await this.request<{ challenge: string; timestamp: string | number }>(
      "/api/v2/auth/challenge",
      { method: "POST" },
    );

    // `timestamp` bywa liczbą (ms) albo datą ISO — akceptujemy oba kształty,
    // bo od tej wartości zależy poprawność szyfrogramu.
    const timestampMs =
      typeof response.timestamp === "number" ? response.timestamp : Date.parse(String(response.timestamp));

    if (!Number.isFinite(timestampMs)) {
      throw new KsefError("KSeF zwrócił wyzwanie bez poprawnego znacznika czasu");
    }

    return { challenge: response.challenge, timestampMs };
  }

  private async waitForAuth(referenceNumber: string, authToken: string): Promise<void> {
    const deadline = Date.now() + AUTH_POLL_TIMEOUT_MS;

    for (;;) {
      const status = await this.request<{ status: { code: number; description: string } }>(
        `/api/v2/auth/${referenceNumber}`,
        { method: "GET", accessToken: authToken },
      );

      if (status.status.code === AUTH_SUCCESS) return;

      if (status.status.code !== AUTH_IN_PROGRESS) {
        throw new KsefError(`Uwierzytelnienie w KSeF nie powiodło się: ${status.status.description}`);
      }

      if (Date.now() > deadline) {
        throw new KsefError("Uwierzytelnienie w KSeF przekroczyło limit czasu");
      }

      await sleep(AUTH_POLL_INTERVAL_MS);
    }
  }

  // --- Warstwa HTTP ----------------------------------------------------------

  private async request<T>(
    path: string,
    options: { method: "GET" | "POST"; body?: unknown; accessToken?: string },
  ): Promise<T> {
    let response: Response;

    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method: options.method,
        headers: {
          Accept: "application/json",
          ...(options.body ? { "Content-Type": "application/json" } : {}),
          ...(options.accessToken ? { Authorization: `Bearer ${options.accessToken}` } : {}),
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
      });
    } catch (error) {
      // Sieć nie odpowiedziała: KSeF leży, DNS padł, brak internetu. To NIE jest błąd
      // aplikacji — użytkownik ma się dowiedzieć, że system MF jest niedostępny,
      // a nie zobaczyć zrzut stosu.
      throw new KsefError(`KSeF jest niedostępny: ${(error as Error).message}`);
    }

    if (!response.ok) {
      throw new KsefError(await describeError(response), response.status);
    }

    return (await response.json()) as T;
  }
}

// --- Typy odpowiedzi KSeF (tylko pola, których używamy) ----------------------

type TokenInfo = { token: string; validUntil?: string; exp?: number };

type PublicKeyCertificate = {
  certificate: string;
  certificateId: string;
  publicKeyId: string;
  validFrom: string;
  validTo: string;
};

type KsefInvoiceMetadata = {
  ksefNumber: string;
  invoiceNumber: string;
  issueDate: string;
  seller?: { identifier?: string; nip?: string };
  buyer?: { identifier?: string; nip?: string };
  netAmount?: number;
  vatAmount?: number;
  grossAmount?: number;
  currency?: string;
};

function toInvoiceRef(invoice: KsefInvoiceMetadata): KsefInvoiceRef {
  return {
    ksefNumber: invoice.ksefNumber,
    invoiceNumber: invoice.invoiceNumber,
    issueDate: invoice.issueDate,
    sellerNip: invoice.seller?.nip ?? invoice.seller?.identifier ?? null,
    buyerNip: invoice.buyer?.nip ?? invoice.buyer?.identifier ?? null,
    grossAmount: invoice.grossAmount ?? null,
    currency: invoice.currency ?? null,
  };
}

/** KSeF oczekuje dat w ISO 8601 z częścią czasową. */
function toKsefDate(date: Date): string {
  return date.toISOString();
}

function parseValidUntil(token: TokenInfo): number {
  if (token.validUntil) {
    const parsed = Date.parse(token.validUntil);
    if (Number.isFinite(parsed)) return parsed;
  }
  if (typeof token.exp === "number") return token.exp * 1000;

  // Gdy KSeF nie poda terminu ważności, przyjmujemy konserwatywne 10 minut —
  // przy błędzie w drugą stronę dostalibyśmy 401 w środku importu.
  return Date.now() + 10 * 60_000;
}

/** Wyciąga z odpowiedzi błędu coś, co da się pokazać człowiekowi. */
async function describeError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as {
      status?: { description?: string; details?: string[] };
      title?: string;
      detail?: string;
    };

    const description =
      body.status?.description ?? body.title ?? body.detail ?? `HTTP ${response.status}`;
    const details = body.status?.details?.join("; ");

    return details ? `${description} (${details})` : description;
  } catch {
    return `KSeF odpowiedział błędem HTTP ${response.status}`;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
