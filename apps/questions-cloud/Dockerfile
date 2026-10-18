FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN npm install --ignore-scripts --no-save esbuild@0.27.2 @aws-sdk/client-s3@3.980.0 sharp@0.34.3
COPY apps/questions-cloud/src apps/questions-cloud/src
RUN ./node_modules/.bin/esbuild apps/questions-cloud/src/run.ts --bundle --platform=node --target=node22 --format=esm --external:sharp --outfile=questions-job.mjs '--banner:js=import { createRequire } from "node:module"; const require = createRequire(import.meta.url);'
FROM node:22-bookworm-slim
WORKDIR /app
RUN npm install --omit=dev --ignore-scripts sharp@0.34.3
COPY --from=build /app/questions-job.mjs ./questions-job.mjs
USER node
CMD ["node", "questions-job.mjs"]
