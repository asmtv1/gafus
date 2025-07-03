# --- Stage 1: Build stage ---
FROM node:20-alpine AS builder

WORKDIR /app

# Копируем корневые конфиги
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./

# Копируем package.json самого worker
COPY packages/worker/package.json ./packages/worker/package.json

# Устанавливаем pnpm и зависимости
RUN corepack enable && corepack prepare pnpm@9.1.0 --activate
RUN pnpm install --frozen-lockfile

# Копируем весь исходный код
COPY . .

# Собираем worker
RUN pnpm --filter @gafus/worker run build

# --- Stage 2: Runtime stage ---
FROM node:20-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production

# Копируем package.json и lock-файл
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/worker/package.json ./packages/worker/package.json

# Устанавливаем только production зависимости
RUN corepack enable && corepack prepare pnpm@9.1.0 --activate
RUN pnpm install --prod --filter @gafus/worker... --frozen-lockfile

# Копируем собранный билд
COPY --from=builder /app/packages/worker/dist ./packages/worker/dist

# Устанавливаем рабочую директорию
WORKDIR /app/packages/worker

# Стартуем worker
CMD ["node", "dist/worker/src/index.js"]
