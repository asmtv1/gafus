/**
 * Публичные данные для мобильного клиента (без JWT).
 */
import { Hono } from "hono";

import { getMobileAppPublicConfig } from "@gafus/core/services/appFeatureFlags";
import { createWebLogger } from "@gafus/logger";
import { getClientAppContext } from "../../lib/client-app-context.js";

const logger = createWebLogger("api-public-mobile");

export const publicMobileRoutes = new Hono();

publicMobileRoutes.get("/mobile-app", async (c) => {
  try {
    const data = await getMobileAppPublicConfig(getClientAppContext(c));
    c.header("Vary", "X-Client-Platform, X-Client-Version");
    return c.json(
      { success: true, data },
      {
        headers: {
          "Cache-Control": "public, max-age=60",
        },
      },
    );
  } catch (error) {
    logger.error("public mobile-app config failed", error as Error);
    return c.json({ success: false, error: "Не удалось загрузить настройки" }, 500);
  }
});
