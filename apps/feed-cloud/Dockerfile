# GAFUS Moments: two identical Cloud.ru video Jobs. Only H264 Main 360p,
# from a client-verified immutable 720p; no poster or 720p transcoding.
FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN npm install --ignore-scripts --no-save esbuild@0.27.2 sharp@0.35.5 @aws-sdk/client-s3@3.980.0 @aws-sdk/s3-presigned-post@3.980.0 @aws-sdk/s3-request-presigner@3.980.0
COPY apps/feed-cloud/src apps/feed-cloud/src
COPY packages/feed-cloud/src packages/feed-cloud/src
COPY packages/feed-storage/src packages/feed-storage/src
COPY packages/cdn-upload/src/isolatedNonprodS3.ts packages/cdn-upload/src/isolatedNonprodS3.ts
COPY packages/cdn-upload/src/localReadonlyCdn.ts packages/cdn-upload/src/localReadonlyCdn.ts
RUN ./node_modules/.bin/esbuild apps/feed-cloud/src/server.ts --bundle --platform=node --target=node22 --format=esm --external:sharp --alias:@gafus/feed-cloud=./packages/feed-cloud/src/index.ts --alias:@gafus/feed-storage=./packages/feed-storage/src/keys.ts --alias:@gafus/cdn-upload/isolated-nonprod-s3=./packages/cdn-upload/src/isolatedNonprodS3.ts --alias:@gafus/cdn-upload/local-readonly-cdn=./packages/cdn-upload/src/localReadonlyCdn.ts --outfile=server.mjs '--banner:js=import { createRequire } from "node:module"; const require = createRequire(import.meta.url);'
FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*
WORKDIR /app
RUN npm install --omit=dev --ignore-scripts sharp@0.35.5
COPY --from=build /app/server.mjs ./server.mjs
USER node
ENV PORT=8080
EXPOSE 8080
CMD ["node", "server.mjs"]
