# Используем заранее собранный образ с Prisma-клиентом
FROM gafus/prisma-base:latest AS prisma-base

# --- Stage 1: builder ---
FROM node:18-alpine AS builder
WORKDIR /app

# 1) Копируем package-файлы и устанавливаем dev-зависимости
COPY package.json package-lock.json tsconfig.json next.config.ts ./
RUN npm ci

# 2) Копируем сгенерированный Prisma-клиент и перезаписываем им зависимости
COPY --from=prisma-base /app/node_modules/@prisma /app/node_modules/@prisma
COPY --from=prisma-base /app/node_modules/.prisma /app/node_modules/.prisma

# 3) Копируем код и schema/seed
COPY shared ./shared
COPY src ./src
COPY public ./public
COPY prisma ./prisma         
RUN npm run build

# --- Stage 2: runtime ---
FROM node:18-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Копируем только прод-зависимости
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Копируем билд, модули, shared и сиды
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/shared ./shared
COPY --from=builder /app/prisma ./prisma     

EXPOSE 3000
CMD ["npx", "next", "start"]