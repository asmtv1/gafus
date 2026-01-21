/**
 * Hono App Setup
 * Конфигурация middleware и маршрутов
 */
import { Hono } from "hono";
import { logger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";
import { requestId } from "hono/request-id";

import { corsMiddleware } from "./middleware/cors.js";
import { errorHandler } from "./middleware/error-handler.js";
import { authMiddleware } from "./middleware/auth.js";
import { authRateLimiter, apiRateLimiter } from "./middleware/rate-limit.js";
import { healthRoutes } from "./routes/v1/health.js";
import { authRoutes } from "./routes/v1/auth.js";
import { userRoutes } from "./routes/v1/user.js";
import { coursesRoutes } from "./routes/v1/courses.js";
import { petsRoutes } from "./routes/v1/pets.js";
import { trainingRoutes } from "./routes/v1/training.js";

export const app = new Hono();

// Global middleware
app.use("*", requestId());
app.use("*", logger());
app.use("*", secureHeaders());
app.use("*", corsMiddleware);

// Health routes (no auth)
app.route("/", healthRoutes);

// Auth routes (rate limited, no auth required)
app.use("/api/v1/auth/*", authRateLimiter);
app.route("/api/v1/auth", authRoutes);

// Protected routes - require auth
app.use("/api/v1/user/*", apiRateLimiter);
app.use("/api/v1/user/*", authMiddleware);
app.route("/api/v1/user", userRoutes);

app.use("/api/v1/courses/*", apiRateLimiter);
app.use("/api/v1/courses/*", authMiddleware);
app.route("/api/v1/courses", coursesRoutes);

app.use("/api/v1/pets/*", apiRateLimiter);
app.use("/api/v1/pets/*", authMiddleware);
app.route("/api/v1/pets", petsRoutes);

app.use("/api/v1/training/*", apiRateLimiter);
app.use("/api/v1/training/*", authMiddleware);
app.route("/api/v1/training", trainingRoutes);

// Global error handler
app.onError(errorHandler);

// 404 handler
app.notFound((c) => {
  return c.json({ success: false, error: "Endpoint не найден" }, 404);
});
