import { createElement, type ReactElement } from "react";
import { activeMockHref, visibleMockNavigation } from "./navigation";
import { matchLegacyPath, previewPageState, type PanelRole } from "./routes";

/**
 * Isolated mock-only Vite design preview.
 * UX/role previews are NOT authorization. Hono owns the real RBAC.
 * No requests, cookies, mutations, server imports or PWA behavior.
 */
export function MockPanelShell({ pathname, role }: {
  pathname: string;
  role: PanelRole;
}): ReactElement {
  const state = previewPageState(pathname, role);
  const route = matchLegacyPath(pathname);
  const heading = {
    login: "Вход требуется",
    denied: "Нет доступа",
    "policy-pending": "Права уточняются",
    "mock-only": "Подготовка панели",
    "not-found": "Страница не найдена",
  }[state];
  const nav = visibleMockNavigation(pathname, role);
  const active = activeMockHref(pathname, role);

  return createElement(
    "div",
    { "data-ag4-preview": "mock-only", "data-page-state": state },
    createElement("a", { href: "#ag4-main" }, "Перейти к содержимому"),
    nav.length > 0 ? createElement(
      "nav", { "aria-label": "Разделы панели тренера" },
      createElement(
        "ul", null,
        ...nav.map(({ href, label }) => createElement(
          "li", { key: href },
          createElement("a", {
            href,
            "aria-current": active === href ? "page" : undefined,
          }, label),
        )),
      ),
    ) : null,
    createElement(
      "main", { id: "ag4-main", tabIndex: -1 },
      createElement("h1", null, heading),
      createElement("p", null, "Только макет. Данные и действия API не подключены."),
      state === "login"
        ? createElement("a", { href: "/login" }, "Перейти ко входу") : null,
      state === "mock-only"
        ? createElement("p", null, "Маршрут: ", route) : null,
      state === "policy-pending"
        ? createElement("p", { role: "status" },
          "Доступ зависит от утверждённой серверной политики AG1.") : null,
      state === "denied"
        ? createElement("p", { role: "alert" },
          "Действие недоступно для роли.") : null,
    ),
  );
}
