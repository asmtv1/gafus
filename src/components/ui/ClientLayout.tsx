"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";

export default function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [loading, setLoading] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    // Показываем спиннер при смене маршрута
    setLoading(true);
    const timeout = setTimeout(() => setLoading(false), 400); // минимальная задержка, чтобы не мигал

    return () => clearTimeout(timeout);
  }, [pathname]);

  return (
    <>
      {loading && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            backgroundColor: "rgba(255, 255, 255, 0.8)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
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
    </>
  );
}
