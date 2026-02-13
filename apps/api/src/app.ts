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
import { authRateLimiter, apiRateLimiter, paymentsRateLimiter } from "./middleware/rate-limit.js";
import { healthRoutes } from "./routes/v1/health.js";
import { authRoutes } from "./routes/v1/auth.js";
import { userRoutes } from "./routes/v1/user.js";
import { coursesRoutes } from "./routes/v1/courses.js";
import { petsRoutes } from "./routes/v1/pets.js";
import { trainingRoutes } from "./routes/v1/training.js";
import { examRoutes } from "./routes/v1/exam.js";
import { offlineRoutes } from "./routes/v1/offline.js";
import { achievementsRoutes } from "./routes/v1/achievements.js";
import { subscriptionsRoutes } from "./routes/v1/subscriptions.js";
import { notesRoutes } from "./routes/v1/notes.js";
import { remindersRoutes } from "./routes/v1/reminders.js";
import { paymentsRoutes } from "./routes/v1/payments.js";

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

// Training routes - большинство требуют JWT
// authMiddleware пропускает маршруты /video/:videoId/manifest и /video/:videoId/segment
app.use("/api/v1/training/*", apiRateLimiter);
app.use("/api/v1/training/*", authMiddleware);
app.route("/api/v1/training", trainingRoutes);

app.use("/api/v1/exam/*", apiRateLimiter);
app.use("/api/v1/exam/*", authMiddleware);
app.route("/api/v1/exam", examRoutes);

app.use("/api/v1/offline/*", apiRateLimiter);
app.use("/api/v1/offline/*", authMiddleware);
app.route("/api/v1/offline", offlineRoutes);

app.use("/api/v1/achievements/*", apiRateLimiter);
app.use("/api/v1/achievements/*", authMiddleware);
app.route("/api/v1/achievements", achievementsRoutes);

app.use("/api/v1/subscriptions/*", apiRateLimiter);
app.use("/api/v1/subscriptions/*", authMiddleware);
app.route("/api/v1/subscriptions", subscriptionsRoutes);

app.use("/api/v1/notes/*", apiRateLimiter);
app.use("/api/v1/notes/*", authMiddleware);
app.route("/api/v1/notes", notesRoutes);

app.use("/api/v1/reminders/*", apiRateLimiter);
app.use("/api/v1/reminders/*", authMiddleware);
app.route("/api/v1/reminders", remindersRoutes);

app.use("/api/v1/payments/*", authMiddleware);
app.use("/api/v1/payments/create", paymentsRateLimiter);
app.route("/api/v1/payments", paymentsRoutes);

// Global error handler
app.onError(errorHandler);

// 404 handler
app.notFound((c) => {
  return c.json({ success: false, error: "Endpoint не найден" }, 404);
});
