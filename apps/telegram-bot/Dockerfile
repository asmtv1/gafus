# --- Stage 1: Build stage ---
FROM node:20-alpine AS builder

WORKDIR /app

# Копируем корневые конфиги
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./

# Копируем package.json нужных пакетов
COPY apps/telegram-bot/package.json ./apps/telegram-bot/package.json

# Устанавливаем pnpm и зависимости
RUN corepack enable && corepack prepare pnpm@9.1.0 --activate
RUN pnpm install --frozen-lockfile

# Копируем весь исходный код (теперь, когда зависимости установлены — быстрее кешируется)
COPY . .

# Собираем telegram-бота
RUN pnpm --filter @gafus/telegram-bot run build

# --- Stage 2: Runtime stage ---
FROM node:20-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production

# Копируем только нужные файлы
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/telegram-bot/package.json ./apps/telegram-bot/package.json

# Устанавливаем pnpm и production-зависимости
RUN corepack enable && corepack prepare pnpm@9.1.0 --activate
RUN pnpm install --prod --filter @gafus/telegram-bot... --frozen-lockfile

# Копируем собранный билд, prisma-клиент и shared пакеты
COPY --from=builder /app/apps/telegram-bot/dist ./apps/telegram-bot/dist
COPY --from=builder /app/generated/prisma-client ./generated/prisma-client


# Переключаемся в рабочую папку бота (только на этом этапе)
WORKDIR /app/apps/telegram-bot

CMD ["node", "dist/bot.js"]
