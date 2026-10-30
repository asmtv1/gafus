/** Lazy, style-isolated Admin shell for the shared Web Vite 5173 origin. */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import adminCss from "./style.css?raw";

export function mountAdminInWeb(host: HTMLElement): void {
  if (host.shadowRoot) throw Error("Admin was already mounted");
  // Keep the main GAFUS site CSS and global selectors out of the admin shell.
  host.style.setProperty("max-width", "none");
  host.style.setProperty("width", "100%");
  host.style.setProperty("margin", "0");
  host.style.setProperty("padding", "0");
  host.style.setProperty("min-height", "100vh");
  const shadow = host.attachShadow({ mode: "open" });
  const css = document.createElement("style");
  css.textContent = `:host { display:block; min-height:100vh; background:#f6f6f2; }\n${adminCss}`;
  shadow.append(css);
  const mountPoint = document.createElement("div");
  mountPoint.id = "admin-root";
  shadow.append(mountPoint);
  createRoot(mountPoint).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
