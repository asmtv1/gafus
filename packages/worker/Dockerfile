# ---------- prisma deps ----------
FROM gafus/prisma-base:latest AS prisma-deps
# prisma-deps already has node_modules with @prisma/client & prisma engines

# ---------- build worker ----------
FROM node:20-alpine AS build
WORKDIR /app

# 1. package.json + lock
COPY ../../package.json ../../package-lock.json ./
COPY ./package.json ./
RUN npm ci --omit=dev

# 2. копируем собранный prisma-клиент
COPY --from=prisma-deps /app/node_modules/.prisma              ./node_modules/.prisma
COPY --from=prisma-deps /app/node_modules/@prisma/client       ./node_modules/@prisma/client

# 3. исходники
COPY . .

# 4. компиляция TS
RUN npx tsc -p tsconfig.json

# ---------- runtime ----------
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist         ./dist
COPY .env .env

CMD ["node", "dist/index.js"]