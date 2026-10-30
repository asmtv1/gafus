import { createElement, useEffect, useRef, type MouseEvent } from "react";
import { MockPanelShell } from "../MockPanelShell";
import type { PanelRole } from "../routes";
import { navigatePreview, usePreviewPath, validPreviewClick } from "./history";

/** Only the standalone Vite mock uses client History API navigation. */
export function PreviewApp({ role }: { role: PanelRole }) {
  const pathname = usePreviewPath();
  const previous = useRef(pathname);

  useEffect(() => {
    if (previous.current === pathname) return;
    previous.current = pathname;
    document.getElementById("ag4-main")?.focus();
  }, [pathname]);

  function onClick(event: MouseEvent<HTMLDivElement>) {
    if (!(event.target instanceof Element)) return;
    const link = event.target.closest("nav a[href]");
    if (!(link instanceof HTMLAnchorElement) ||
      !event.currentTarget.contains(link) || !validPreviewClick(event, link)) return;
    const href = link.getAttribute("href");
    if (!href) return;
    event.preventDefault();
    navigatePreview(href);
  }

  return createElement("div", { className: "ag4-preview-runtime", onClick },
    createElement(MockPanelShell, { pathname, role }));
}
