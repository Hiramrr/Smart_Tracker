# syntax=docker/dockerfile:1

# ==========================================
# Stage 1: Dependencias
# ==========================================
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

# ==========================================
# Stage 2: Builder
# ==========================================
FROM node:20-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Variables de entorno necesarias para build
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

RUN npm run build

# Instalar .NET 10 SDK y publicar el parser C# (self-contained para Alpine)
RUN apk add --no-cache curl bash icu-libs && \
    curl -sSL https://dot.net/v1/dotnet-install.sh | bash /dev/stdin --channel 10.0 --install-dir /usr/share/dotnet && \
    ln -s /usr/share/dotnet/dotnet /usr/local/bin/dotnet

RUN DOTNET_RID="linux-musl-$(uname -m | sed 's/x86_64/x64/' | sed 's/aarch64/arm64/')" && \
    dotnet publish tools/csharp-parser/FortniteReplayCSharpParser.csproj \
    -c Release \
    -r "$DOTNET_RID" \
    --self-contained true \
    -o /app/tools/csharp-parser/publish

# ==========================================
# Stage 3: Runner
# ==========================================
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

RUN apk add --no-cache icu-libs

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copiar archivos necesarios para ejecutar
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/tools/csharp-parser/publish ./tools/csharp-parser/publish

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]
