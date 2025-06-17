# --- Stage 0: готовый клиент ---
FROM gafus/prisma-base:latest AS prisma

# --- Stage 1: build ---
FROM node:20-alpine AS builder
WORKDIR /app

# 1. ставим всё, включая dev (нужен tsc)
COPY telegram-bot/package*.json .
RUN npm ci

# 2. подсовываем client
COPY --from=prisma /app/node_modules/.prisma  ./node_modules/.prisma
COPY --from=prisma /app/node_modules/@prisma ./node_modules/@prisma

# 3. исходники
COPY shared        ./shared
COPY telegram-bot  ./telegram-bot

# 4. компиляция → ./dist
RUN npx tsc -p telegram-bot/tsconfig.json

# --- Stage 2: runtime ---
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/node_modules      ./node_modules
RUN npm prune --production
COPY --from=builder /app/dist              ./dist
COPY --from=builder /app/shared            ./shared

CMD ["node", "dist/telegram-bot/bot.js"]