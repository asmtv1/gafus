"use client";

import { getPublicKeyAction } from "@shared/lib/actions/publicKey";
import { useNotificationComposite, useNotificationInitializer } from "@shared/stores";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";

export default function NotificationRequesterNew() {
  const { data: session, status } = useSession();
  const {
    permission,
    hasServerSubscription,
    isLoading,
    error,
    requestPermission,
    removePushSubscription,
    isSupported,
    isGranted,
    checkServerSubscription,
    setUserId,
    shouldShowModal,
    setShowModal,
    dismissModal,
  } = useNotificationComposite();
  const [mounted, setMounted] = useState(false);
  const [vapidKey, setVapidKey] = useState<string | null>(null);

  // Инициализируем уведомления
  useNotificationInitializer();

  useEffect(() => {
    setMounted(true);
  }, []);

  // Получаем публичный VAPID ключ и инициализируем push-уведомления при монтировании
  useEffect(() => {
    console.log("🚀 NotificationRequesterNew: useEffect для инициализации запущен");
    let cancelled = false;
    
    (async () => {
      try {
        console.log("🔧 NotificationRequesterNew: Получаем VAPID ключ...");
        const { publicKey } = await getPublicKeyAction();
        if (!cancelled) {
          setVapidKey(publicKey ?? null);
          console.log("✅ NotificationRequesterNew: VAPID ключ установлен:", !!publicKey);
        }
        
        // Устанавливаем userId для push-уведомлений
        if (session?.user?.id) {
          console.log("🔧 NotificationRequesterNew: Устанавливаем userId:", session.user.id);
          setUserId(session.user.id);
          
          // Проверяем серверную подписку только после установки userId
          console.log("🔧 NotificationRequesterNew: Планируем проверку серверной подписки через 100мс");
          setTimeout(() => {
            console.log("🔧 NotificationRequesterNew: Вызываем checkServerSubscription...");
            checkServerSubscription();
          }, 100);
        } else {
          console.warn("⚠️ NotificationRequesterNew: No user ID found in session");
        }
      } catch (e) {
        if (!cancelled) {
          setVapidKey(null);
          console.error("❌ NotificationRequesterNew: Failed to fetch VAPID public key", e);
        }
      }
    })();
    
    return () => {
      cancelled = true;
    };
  }, [session?.user?.id, setUserId, checkServerSubscription]);

  // Если пользователь не авторизован или уведомления не поддерживаются, не показываем ничего
  if (status !== "authenticated" || !session?.user || !mounted || !isSupported()) {
    return null;
  }

  // Если разрешение уже есть, не показываем модальное окно
  if (permission === "granted") {
    return null;
  }

  // Если не нужно показывать модальное окно, не показываем ничего
  if (!shouldShowModal()) {
    return null;
  }

  const handleAllowNotifications = async () => {
    console.log("🚀 NotificationRequesterNew: handleAllowNotifications вызван");
    if (vapidKey) {
      console.log("✅ NotificationRequesterNew: VAPID ключ доступен, запрашиваем разрешение");
      await requestPermission(vapidKey);
      dismissModal();
    } else {
      console.error("❌ NotificationRequesterNew: VAPID key not available");
    }
  };

  const handleDenyNotifications = async () => {
    console.log("🚀 NotificationRequesterNew: handleDenyNotifications вызван");
    await removePushSubscription();
    dismissModal();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md mx-4 text-center">
        <h2 className="text-xl font-bold mb-4">Включить уведомления?</h2>
        <p className="text-gray-600 mb-6">
          Получайте уведомления о новых тренировках и напоминания о занятиях
        </p>
        
        {error && (
          <div className="text-red-500 text-sm mb-4">
            Ошибка: {error}
          </div>
        )}
        
        <div className="flex gap-3 justify-center">
          <button
            onClick={handleAllowNotifications}
            disabled={isLoading}
            className="bg-blue-500 text-white px-6 py-2 rounded-lg hover:bg-blue-600 disabled:opacity-50"
          >
            {isLoading ? "Загрузка..." : "Включить"}
          </button>
          <button
            onClick={handleDenyNotifications}
            className="bg-gray-300 text-gray-700 px-6 py-2 rounded-lg hover:bg-gray-400"
          >
            Не сейчас
          </button>
        </div>
      </div>
    </div>
  );
}
