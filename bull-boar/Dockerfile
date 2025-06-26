# Stage 1 — build
FROM node:20-alpine AS builder
WORKDIR /app

# Копируем package.json + lock + общий tsconfig + shared
COPY bull-boar/package*.json ./
COPY ../tsconfig.json ./tsconfig.base.json
COPY shared ./shared

# Устанавливаем dev-зависимости
RUN npm ci

# Скопируем исходники
COPY bull-boar/bull-board.ts ./
COPY src/lib/queues ./src/lib/queues

# Подменяем tsconfig.base на работающий tsconfig.local
COPY bull-boar/tsconfig.json ./tsconfig.local.json
RUN mv tsconfig.local.json tsconfig.json

# Компиляция
RUN npm run build

# Stage 2 — runtime
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY bull-boar/package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist

EXPOSE 3001
CMD ["node", "dist/bull-board.js"]