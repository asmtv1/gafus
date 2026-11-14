/// <reference types="vite/client" />
import { startBrowserTelemetry } from "@gafus/error-handling/browser";
import { ErrorBoundary } from "@gafus/error-handling";
// Opt-in immutable release mapping; no backend secret or DSN in browser code.
startBrowserTelemetry({
  service: "gafus-admin-panel",
  appVersion: import.meta.env.VITE_GAFUS_APP_VERSION || "1.7.3",
  build: import.meta.env.VITE_GAFUS_BUILD_ID || "",
  enabled: import.meta.env.VITE_GAFUS_TELEMETRY_ENABLED === "true",
});
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./style.css";
const root = document.getElementById("admin-root");
if (!root) throw Error("Missing admin root");
createRoot(root).render(
  <StrictMode>
    <ErrorBoundary config={{ appName: "gafus-admin-panel", logToConsole: false }}><App /></ErrorBoundary>
  </StrictMode>,
);
