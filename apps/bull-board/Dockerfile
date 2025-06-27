FROM node:20-bookworm-slim
WORKDIR /app
COPY ../../package*.json ./
COPY . .
RUN npm ci --omit=dev && npm run build
CMD ["node", "dist/bull-board.js"]