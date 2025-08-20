"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

interface PullToRefreshProps {
  children: React.ReactNode;
  onRefresh?: () => Promise<unknown> | void;
  threshold?: number;
  maxPullDistance?: number;
  refreshType?: "router" | "custom" | "both";
}

export default function PullToRefresh({
  children,
  onRefresh,
  threshold = 80,
  maxPullDistance = 150,
  refreshType = "router",
}: PullToRefreshProps) {
  const [startY, setStartY] = useState<number | null>(null);
  const [pulling, setPulling] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshMessage, setRefreshMessage] = useState("");
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleTouchStart = (e: TouchEvent) => {
      if (window.scrollY === 0) {
        setStartY(e.touches[0].clientY);
        setPulling(false);
        setPullDistance(0);
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (startY !== null && window.scrollY === 0) {
        const currentY = e.touches[0].clientY;
        const distance = currentY - startY;

        if (distance > 0) {
          e.preventDefault();
          const clampedDistance = Math.min(distance, maxPullDistance);
          setPullDistance(clampedDistance);

          if (clampedDistance > threshold) {
            setPulling(true);
            setRefreshMessage("Отпустите для обновления");
          } else {
            setPulling(false);
            setRefreshMessage("Потяните вниз для обновления");
          }
        }
      }
    };

    const handleTouchEnd = async () => {
      if (pulling && pullDistance > threshold) {
        setIsRefreshing(true);
        setRefreshMessage("Обновление...");

        try {
          // Выполняем кастомное обновление если есть
          if (onRefresh && refreshType !== "router") {
            await onRefresh();
          }

          // Обновляем роутер если нужно
          if (refreshType !== "custom") {
            router.refresh();
          }

          setRefreshMessage("✅ Обновлено!");

          // Показываем сообщение об успехе на 1 секунду
          setTimeout(() => {
            setRefreshMessage("");
            setIsRefreshing(false);
          }, 1000);
        } catch (error) {
          setRefreshMessage("❌ Ошибка обновления");
          setTimeout(() => {
            setRefreshMessage("");
            setIsRefreshing(false);
          }, 2000);
          console.warn(error);
        }
      }

      setStartY(null);
      setPulling(false);
      setPullDistance(0);
    };

    document.addEventListener("touchstart", handleTouchStart, { passive: false });
    document.addEventListener("touchmove", handleTouchMove, { passive: false });
    document.addEventListener("touchend", handleTouchEnd);

    return () => {
      document.removeEventListener("touchstart", handleTouchStart);
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("touchend", handleTouchEnd);
    };
  }, [startY, pulling, pullDistance, threshold, maxPullDistance, onRefresh, refreshType, router]);

  // Вычисляем прогресс для анимации
  const progress = Math.min(pullDistance / threshold, 1);
  const rotation = Math.min((pullDistance / threshold) * 180, 180);

  return (
    <div ref={containerRef} className="pull-to-refresh-container">
      {/* Индикатор pull-to-refresh */}
      {(pulling || isRefreshing || refreshMessage) && (
        <div
          className="pull-indicator"
          style={{
            transform: `translateY(${Math.min(pullDistance, 60)}px)`,
            opacity: Math.min(pullDistance / 40, 1),
          }}
        >
          <div className="pull-icon-container">
            <div
              className="pull-icon"
              style={{
                transform: `rotate(${rotation}deg)`,
                color: pulling ? "#007bff" : "#6c757d",
              }}
            >
              🔄
            </div>
          </div>

          {refreshMessage && <div className="refresh-message">{refreshMessage}</div>}

          {/* Прогресс бар */}
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${progress * 100}%` }} />
          </div>
        </div>
      )}

      {children}
    </div>
  );
}
