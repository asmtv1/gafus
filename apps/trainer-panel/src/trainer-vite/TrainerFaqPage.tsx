import { createElement, useState } from "react";
import type { PanelActor } from "./consultationContract";

/** Static Next FAQ content, available only in an active staff session. */
export function TrainerFaqPage(p: {
  pathname: string;
  actor: PanelActor;
  token: string | null;
  authEpoch?: string;
  getCurrentSession?: () => { actor: PanelActor; token: string | null; authEpoch?: string } | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const current = p.getCurrentSession ? p.getCurrentSession() : {
    actor: p.actor, token: p.token, authEpoch: p.authEpoch,
  };
  const allowed = p.pathname === "/main-panel/faq" &&
    !!p.token && !!p.authEpoch && !!current &&
    current.actor.id === p.actor.id && current.actor.role === p.actor.role &&
    current.token === p.token && current.authEpoch === p.authEpoch &&
    ["TRAINER", "ADMIN", "MODERATOR"].includes(p.actor.role);
  if (!allowed) return createElement("main", null,
    createElement("p", { role: "alert" }, "Частые вопросы недоступны"));
  return createElement("main", { "data-trainer-faq": "legacy-content" },
    createElement("h1", null, "Частые вопросы"),
    createElement("p", null, "Найдите ответы на часто задаваемые вопросы о работе с панелью тренера"),
    createElement("section", null,
      createElement("h2", null,
        createElement("button", {
          type: "button", "aria-expanded": expanded,
          "aria-controls": "trainer-faq-create-course",
          onClick: () => setExpanded(previous => !previous),
        }, "Как создать курс на платформе")),
      expanded ? createElement("div", { id: "trainer-faq-create-course" },
        createElement("video", {
          controls: true,
          preload: "metadata",
          width: "100%",
          style: { maxWidth: 800, borderRadius: 8 },
          src: "https://storage.yandexcloud.net/gafus-media/uploads/how_to_create_a_course.mp4",
        }, "Ваш браузер не поддерживает видео.")) : null));
}
