import { describe, expect, it } from "vitest";

import { formatDate } from "./utils";
import { getArticles } from "./services/article/articleService";
import { NotFoundError, handlePrismaError } from "./errors";
import { checkUserState } from "./services/auth/authService";

/**
 * Проверяем связность публичного API пакета (без import всего ./index — тяжёлый граф).
 */
describe("package public surface", () => {
  it("errors + auth + article + utils доступны из корневых модулей", () => {
    expect(typeof checkUserState).toBe("function");
    expect(typeof getArticles).toBe("function");
    expect(typeof NotFoundError).toBe("function");
    expect(typeof handlePrismaError).toBe("function");
    expect(typeof formatDate).toBe("function");
  });
});
