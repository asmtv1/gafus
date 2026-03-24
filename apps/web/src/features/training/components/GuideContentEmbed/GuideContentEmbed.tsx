"use client";
/* eslint-disable @gafus/require-client-catch-tracer -- защитный доступ к iframe.contentDocument; штатные ограничения браузера */

import React, { useCallback, useEffect, useRef, useState } from "react";

const MSG_TYPE = "gafus:guide-height";

/**
 * Добавляет скрипт в srcdoc для замера высоты.
 * Safari: load и document.fonts.ready в srcdoc iframe могут не срабатывать,
 * поэтому добавлен немедленный вызов и DOMContentLoaded.
 */
function injectHeightScript(html: string): string {
  const script = `<script>
    function reportHeight() {
      var h = document.documentElement.scrollHeight;
      if (h > 0) parent.postMessage({ type: "${MSG_TYPE}", height: h }, "*");
    }
    reportHeight();
    document.addEventListener("DOMContentLoaded", reportHeight);
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
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const srcDoc = useCallback(() => injectHeightScript(content), [content])();

  const applyHeight = useCallback((h: number) => {
    if (h > 0) {
      setHeight(h);
      setReady(true);
    }
  }, []);

  useEffect(() => {
    setHeight(0);
    setReady(false);

    const handler = (e: MessageEvent) => {
      if (e.data?.type === MSG_TYPE && typeof e.data.height === "number") {
        applyHeight(e.data.height);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [content, applyHeight]);

  // Fallback для Safari: читаем высоту из contentDocument при onLoad iframe (srcdoc — same-origin).
  // Safari может вызвать onLoad до завершения layout — повторяем через rAF и 100ms.
  const handleIframeLoad = useCallback(() => {
    if (ready) return;
    const tryRead = () => {
      try {
        const doc = iframeRef.current?.contentDocument;
        const h = doc?.documentElement?.scrollHeight ?? 0;
        if (h > 0) applyHeight(h);
      } catch {
        /* same-origin для srcdoc */
      }
    };
    tryRead();
    requestAnimationFrame(() => {
      tryRead();
      setTimeout(tryRead, 100);
    });
  }, [ready, applyHeight]);

  // Таймаут: если postMessage и onLoad не сработали (Safari Cmd+R), скрываем спиннер через 3 с
  useEffect(() => {
    if (ready) return;
    const t = setTimeout(() => {
      try {
        const doc = iframeRef.current?.contentDocument;
        const h = doc?.documentElement?.scrollHeight ?? 600;
        setHeight(h > 0 ? h : 600);
        setReady(true);
      } catch {
        setHeight(600);
        setReady(true);
      }
    }, 3000);
    return () => clearTimeout(t);
  }, [content, ready]);

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
        ref={iframeRef}
        srcDoc={srcDoc}
        title="Контент гайда"
        className={className}
        style={{
          height: ready ? height : 0,
          overflow: "hidden",
          opacity: ready ? 1 : 0,
        }}
        sandbox="allow-scripts"
        onLoad={handleIframeLoad}
      />
    </div>
  );
}
