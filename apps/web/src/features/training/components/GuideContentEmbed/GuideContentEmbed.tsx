"use client";

import React, { useCallback, useEffect, useState } from "react";

const MSG_TYPE = "gafus:guide-height";

/**
 * Добавляет скрипт в srcdoc с двумя замерами высоты:
 * - сразу при load (быстрый первый замер)
 * - после fonts.ready (финальный — когда шрифты загружены и layout стабилен)
 */
function injectHeightScript(html: string): string {
  const script = `<script>
    function reportHeight() {
      parent.postMessage({ type: "${MSG_TYPE}", height: document.documentElement.scrollHeight }, "*");
    }
    window.addEventListener("load", reportHeight);
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(reportHeight);
    }
  </scr` + `ipt>`;
  const closeBody = html.lastIndexOf("</body>");
  if (closeBody !== -1) {
    return html.slice(0, closeBody) + script + html.slice(closeBody);
  }
  return html + script;
}

interface GuideContentEmbedProps {
  content: string;
  className?: string;
}

/**
 * Iframe с авто-высотой. Показывает спиннер пока не придёт финальная высота
 * после загрузки шрифтов — экран не прыгает.
 */
export default function GuideContentEmbed({ content, className }: GuideContentEmbedProps) {
  const [height, setHeight] = useState(0);
  const [ready, setReady] = useState(false);

  const srcDoc = useCallback(() => injectHeightScript(content), [content])();

  useEffect(() => {
    setHeight(0);
    setReady(false);

    const handler = (e: MessageEvent) => {
      if (e.data?.type === MSG_TYPE && typeof e.data.height === "number" && e.data.height > 0) {
        setHeight(e.data.height);
        setReady(true);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [content]);

  return (
    <div style={{ position: "relative", minHeight: ready ? undefined : "100vh" }}>
      {!ready && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100vw",
            height: "100vh",
            backgroundColor: "rgba(255, 255, 255, 0.1)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              width: "48px",
              height: "48px",
              border: "6px solid #ccc",
              borderTop: "6px solid #333",
              borderRadius: "50%",
              animation: "spin 1s linear infinite",
            }}
          />
          <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
        </div>
      )}
      <iframe
        srcDoc={srcDoc}
        title="Контент гайда"
        className={className}
        style={{
          height: ready ? height : 0,
          overflow: "hidden",
          opacity: ready ? 1 : 0,
        }}
        sandbox="allow-scripts"
      />
    </div>
  );
}
