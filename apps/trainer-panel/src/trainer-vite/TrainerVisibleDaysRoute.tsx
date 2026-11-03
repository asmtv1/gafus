import { createElement } from "react";
import type { PanelActor } from "./consultationContract";
import type { VisibleDaysTransport } from "./trainerVisibleDaysRead20261022";
import type { TrainerContentWriteTransport } from "./TrainerContentEditorRoute";
import { TrainerVisibleDaysChooser20261022 } from "./TrainerVisibleDaysChooser20261022";

/** Live read-only route reuse. Next creation/edit/deletion still requires separate API wiring. */
export function TrainerVisibleDaysRoute(p: {
  pathname: string;
  actor: PanelActor;
  token: string | null;
  authEpoch?: string;
  enableVisibleDays?: boolean;
  enableContentManage?: boolean;
  visibleDaysTransport?: VisibleDaysTransport;
  contentWriteTransport?: TrainerContentWriteTransport;
  getCurrentSession?: () => { actor: PanelActor; token: string | null; authEpoch?: string } | null;
}) {
  const isCurrent = () => {
    const current = p.getCurrentSession ? p.getCurrentSession() : {
      actor: p.actor, token: p.token, authEpoch: p.authEpoch,
    };
    return !!current && current.actor.id === p.actor.id &&
      current.actor.role === p.actor.role && current.token === p.token &&
      current.authEpoch === p.authEpoch;
  };
  const enabled = p.pathname === "/main-panel/days" && !!p.token &&
    !!p.authEpoch && p.enableVisibleDays === true && isCurrent();
  return createElement("main", { "data-trainer-days": "read-only", className: "trainer-catalog" },
    createElement("header", { className: "trainer-catalog-heading" },
      createElement("div", null,
        createElement("span", { className: "trainer-catalog-eyebrow" }, "Управление тренировками"),
        createElement("h1", null, "Созданные дни"),
        createElement("p", null, "Поиск, структура, связи и порядок ваших тренировочных дней")),
      p.enableContentManage === true && ["TRAINER", "ADMIN"].includes(p.actor.role)
        ? createElement("a", {
        className: "trainer-catalog-create", href: "/days/new",
      }, "＋ Создать день") : null),
    createElement(TrainerVisibleDaysChooser20261022, {
      actor: p.actor, enabled,
      transport: p.visibleDaysTransport,
      isCurrent,
      showEditorLinks: p.enableContentManage === true,
      writeTransport: p.contentWriteTransport,
    }));
}
