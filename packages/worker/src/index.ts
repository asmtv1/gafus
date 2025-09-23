#!/usr/bin/env node
import { createWorkerLogger } from "@gafus/logger";

const logger = createWorkerLogger('bootstrap');
logger.info("Bootstrapping...");

// Импортируем основную логику воркера
import "./push-worker";

logger.success("Worker is up and running 🚀");
