# syntax=docker/dockerfile:1

FROM node:20-alpine

WORKDIR /app

# Instalar dependencias (incluyendo devDependencies para tsx)
COPY package.json package-lock.json* ./
RUN npm ci

# Copiar código fuente
COPY consumer ./consumer
COPY src ./src
COPY tsconfig.json ./

# Instalar tsx globalmente para ejecutar TypeScript
RUN npm install -g tsx

ENV NODE_ENV=production

CMD ["tsx", "consumer/index.ts"]
