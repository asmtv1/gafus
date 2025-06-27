# syntax=docker/dockerfile:1

# ---------- build ----------
FROM node:20-alpine AS build
WORKDIR /app

# 1. зависимости
COPY ../../package.json ../../package-lock.json ./
COPY ./package.json ./ 
RUN npm ci --omit=dev

# 2. исходники
COPY . .

# 3. компиляция
RUN npx tsc -p tsconfig.json

# ---------- runtime ----------
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY .env .env

CMD ["node", "dist/bot.js"]