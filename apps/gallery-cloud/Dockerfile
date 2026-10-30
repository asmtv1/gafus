FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN npm install --ignore-scripts --no-save esbuild@0.27.2 @aws-sdk/client-s3@3.980.0
COPY apps/gallery-cloud/src apps/gallery-cloud/src
COPY packages/gallery-storage/src packages/gallery-storage/src
COPY packages/core/src/services/gallery packages/core/src/services/gallery
COPY packages/cdn-upload/src/isolatedNonprodS3.ts packages/cdn-upload/src/isolatedNonprodS3.ts
COPY packages/cdn-upload/src/localReadonlyCdn.ts packages/cdn-upload/src/localReadonlyCdn.ts
RUN ./node_modules/.bin/esbuild apps/gallery-cloud/src/job.ts --bundle --platform=node --target=node22 --format=esm --external:sharp --alias:@gafus/gallery-storage=./packages/gallery-storage/src --alias:@gafus/core/services/gallery/imageProcessing=./packages/core/src/services/gallery/imageProcessing.ts --alias:@gafus/cdn-upload/isolated-nonprod-s3=./packages/cdn-upload/src/isolatedNonprodS3.ts --alias:@gafus/cdn-upload/local-readonly-cdn=./packages/cdn-upload/src/localReadonlyCdn.ts --outfile=job.mjs '--banner:js=import { createRequire } from "node:module"; const require = createRequire(import.meta.url);'
FROM node:22-bookworm-slim
WORKDIR /app
RUN npm install --omit=dev --ignore-scripts sharp@0.35.5
COPY --from=build /app/job.mjs ./job.mjs
USER node
CMD ["node", "job.mjs"]
