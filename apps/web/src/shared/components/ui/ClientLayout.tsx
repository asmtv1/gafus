"use client";

import { CSRFProvider } from "@gafus/csrf";
import { setupGlobalErrorHandling } from "@shared/lib/global-error-handler";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setLoading(true);
    const timeout = setTimeout(() => setLoading(false), 400);
    return () => clearTimeout(timeout);
  }, [pathname]);

  // Настройка глобального отлова ошибок
  useEffect(() => {
    setupGlobalErrorHandling();
  }, []);

  return (
    <CSRFProvider>
      <div style={{ position: "relative" }}>
        {loading && (
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
            <style>{`
              @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
              }
            `}</style>
          </div>
        )}

        {children}
      </div>
    </CSRFProvider>
  );
}
