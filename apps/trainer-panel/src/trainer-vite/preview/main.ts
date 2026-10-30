import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { PreviewApp } from "./PreviewApp";
import type { PanelRole } from "../routes";
import "./style.css";

/** Standalone LOCAL mock preview. No authentication, API, persistent storage or PWA. */
const defaultDemoRole: PanelRole = "TRAINER";
const root = document.getElementById("root");
if (!root) throw new Error("AG4 preview mount is missing");

// Explicitly simulated display role, NEVER inferred from an actual user session.
const sample = new URLSearchParams(window.location.search).get("demoRole");
const knownRoles: readonly string[] = [
  "GUEST", "USER", "PARTNER", "TRAINER", "MODERATOR", "ADMIN",
];
const demoRole: PanelRole = sample && knownRoles.includes(sample)
  ? sample as PanelRole
  : defaultDemoRole;

createRoot(root).render(createElement(
  "div", { className: "ag4-app" },
  createElement(
    "header", { className: "ag4-preview-banner", role: "note" },
    createElement("strong", null, "AG4 · ПРЕВЬЮ"),
    createElement("span", null, "Только макет — без API, авторизации и реальных данных"),
  ),
  createElement(PreviewApp, { role: demoRole }),
));
