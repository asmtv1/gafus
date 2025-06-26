# Слой сборки
FROM gafus/prisma-base:latest AS deps
WORKDIR /app

COPY ./tsconfig.json .
COPY worker/tsconfig.worker.json .
COPY ./package.json ./package-lock.json ./
COPY ./src ./src
COPY ./shared ./shared 

# Устанавливаем всё, включая dev-зависимости
RUN npm ci

# Сборка TypeScript-кода
RUN npm run build:worker

# Очищаем dev-зависимости
RUN npm prune --omit=dev

# Финальный рантайм-слой
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

COPY --from=deps /app/dist ./dist
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./

CMD ["node", "dist/worker/push-worker.js"]