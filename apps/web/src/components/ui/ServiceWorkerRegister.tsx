"use client";
import { useEffect } from "react";

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    (async () => {
      try {
        const reg = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
        });
        console.log("SW registered:", reg);

        // persistent хранилище, что браузер не дотянулся.
        if (navigator.storage?.persisted) {
          const isPersisted = await navigator.storage.persisted();
          console.log("Already persisted?", isPersisted);
          if (!isPersisted) {
            const granted = await navigator.storage.persist();
            console.log("Persistent storage", granted ? "granted" : "denied");
          }
        }
      } catch (err) {
        console.error("SW registration or storage persist failed:", err); // выбросить ошибку с просьбой переустановить.. или что?
      }
    })();
  }, []);

  return null;
}
