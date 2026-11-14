/// <reference types="vite/client" />
import { startBrowserTelemetry } from "@gafus/error-handling/browser";
import { ErrorBoundary } from "@gafus/error-handling";
// Opt-in immutable release mapping; no backend secret or DSN in browser code.
startBrowserTelemetry({
  service: "gafus-trainer-panel",
  appVersion: import.meta.env.VITE_GAFUS_APP_VERSION || "1.7.3",
  build: import.meta.env.VITE_GAFUS_BUILD_ID || "",
  enabled: import.meta.env.VITE_GAFUS_TELEMETRY_ENABLED === "true",
});
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { LiveTrainerApp } from "./LiveTrainerApp";
import "./style.css";
const mount = document.getElementById("root");
if (!mount) throw Error("Trainer root mount missing");
createRoot(mount).render(
  createElement(ErrorBoundary, {
    config:{appName:"gafus-trainer-panel",logToConsole:false},
    children:createElement(LiveTrainerApp),
  }),
);
