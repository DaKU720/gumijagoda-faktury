# Multi-stage build. Runtime keeps node_modules (not `output: standalone`) on purpose:
# the container also runs `prisma migrate deploy` + seed at startup, which needs the Prisma CLI.
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
# DATABASE_URL is not needed at build time, but Next.js may evaluate module scope during
# static analysis, so a syntactically valid placeholder is provided.
ENV DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"
ENV SKIP_ENV_VALIDATION=1
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV TZ=Europe/Warsaw
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.ts ./next.config.ts
COPY --from=builder /app/tsconfig.json ./tsconfig.json
# prisma.config.ts jest potrzebny W RUNTIME, nie tylko przy budowaniu: to z niego CLI czyta
# adres bazy przy `prisma migrate deploy` i przy seedzie odpalanym w entrypoincie.
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
# Wygenerowany klient Prismy (Prisma 7 kładzie go w src/generated, nie w node_modules).
# Bez tego seed uruchamiany w entrypoincie nie ma czego zaimportować.
COPY --from=builder /app/src/generated ./src/generated
# Przykładowe faktury dla trybu KSEF_MODE=mock. MockKsefClient czyta je z dysku w RUNTIME
# (nie są wkompilowane w bundle), więc muszą trafić do obrazu — inaczej tryb mock działa
# lokalnie, a na wdrożeniu zwraca pustkę.
COPY --from=builder /app/src/server/ksef/fixtures ./src/server/ksef/fixtures
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh
EXPOSE 3000
ENTRYPOINT ["./docker-entrypoint.sh"]
