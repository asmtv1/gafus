"use client";
import { useState, useEffect } from "react";
// Импортируем серверные экшны
import { getVapidPublicKey, saveSubscription } from "@/utils/push";

// Утилита для конвертации VAPID-ключа из base64 в Uint8Array
function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return new Uint8Array([...rawData].map((char) => char.charCodeAt(0)));
}

export default function NotificationRequester() {
  console.log("🔔 NotificationRequester rendered"); // <–– тут
  const [permission, setPermission] = useState<NotificationPermission | null>(
    null
  );

  useEffect(() => {
    if (typeof Notification !== "undefined") {
      setPermission(Notification.permission);
    } else {
      setPermission("default");
    }
  }, []);

  useEffect(() => {
    if (permission !== "granted") {
      console.log("🔔 NotificationRequester permission !== granted");
      return;
    }
    (async () => {
      try {
        console.log("🔔 NotificationRequester permission == granted");
        const registration = await navigator.serviceWorker.ready;
        console.log("SW ready:", registration);

        const vapidPublicKey = await getVapidPublicKey();
        console.log("VAPID Public Key:", vapidPublicKey);

        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
        });
        console.log("Push subscription:", subscription);

        const subscriptionJSON = subscription.toJSON();
        if (!subscriptionJSON.endpoint) {
          console.error("Subscription JSON has no endpoint, skipping save");
          return;
        }

        console.log(
          "🔹 Before savePushSubscription, endpoint:",
          subscriptionJSON.endpoint
        );
        await saveSubscription(
          subscriptionJSON as {
            endpoint: string;
            keys: { p256dh: string; auth: string };
          }
        );
        console.log("✅ After savePushSubscription");
      } catch (err) {
        console.error("Error during push subscription:", err);
      }
    })();
  }, [permission]);

  if (permission === null) return null;

  if (permission === "granted") {
    return (
      <div className="flex items-center justify-center p-4">
        <p>Уведомления уже разрешены и подписка настроена ✅</p>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center p-4">
      <button
        onClick={async () => {
          if (typeof Notification === "undefined") {
            alert("Этот браузер не поддерживает уведомления.");
            return;
          }
          try {
            const result = await Notification.requestPermission();
            setPermission(result);
            if (result !== "granted") {
              alert("Пользователь не разрешил уведомления");
            }
          } catch (err) {
            console.error("Ошибка запроса разрешения уведомлений:", err);
            alert("Не удалось запросить разрешение.");
          }
        }}
        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
      >
        Разрешить уведомления
      </button>
    </div>
  );
}
