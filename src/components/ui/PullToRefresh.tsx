"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function PullToRefresh({
  children,
}: {
  children: React.ReactNode;
}) {
  const [startY, setStartY] = useState<number | null>(null);
  const [pulling, setPulling] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const handleTouchStart = (e: TouchEvent) => {
      if (window.scrollY === 0) {
        setStartY(e.touches[0].clientY);
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (startY !== null) {
        const currentY = e.touches[0].clientY;
        if (currentY - startY > 60) {
          setPulling(true);
        }
      }
    };

    const handleTouchEnd = () => {
      if (pulling) {
        // ⚡ способ 1: только обновить данные
        router.refresh();
        // 🌀 способ 2 (если надо перезагрузить всё):
        // location.reload()
      }
      setStartY(null);
      setPulling(false);
    };

    document.addEventListener("touchstart", handleTouchStart);
    document.addEventListener("touchmove", handleTouchMove);
    document.addEventListener("touchend", handleTouchEnd);

    return () => {
      document.removeEventListener("touchstart", handleTouchStart);
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("touchend", handleTouchEnd);
    };
  }, [startY, pulling, router]);

  return (
    <div>
      {pulling && (
        <div style={{ textAlign: "center", padding: 8 }}>🔄 Обновление…</div>
      )}
      {children}
    </div>
  );
}
