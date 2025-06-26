// src/lib/workers/register-ts-node.mjs
// ──────────────────────────────────────────────────────────
// Подключаем ts-node как ESM-loader и сразу включаем поддержку
// алиасов из "paths" через опцию tsconfigPaths: true.
// Тогда при запуске НЕ нужно писать  --require tsconfig-paths/register.

import { register } from "ts-node";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// абсолютный путь до worker-tsconfig
const project = resolve(__dirname, "tsconfig.json");

register({
  project, // → src/lib/workers/tsconfig.json
  esm: true, // ESM-режим для NodeNext
  tsconfigPaths: true, // ⬅️ важно: разворачивать @/… во время рантайма
});
