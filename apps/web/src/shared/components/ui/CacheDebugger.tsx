"use client";

import { useState, useEffect } from "react";

export default function CacheDebugger() {
  const [cacheStatus, setCacheStatus] = useState<Record<string, any>>({});
  const [isLoading, setIsLoading] = useState(false);

  const checkCaches = async () => {
    setIsLoading(true);
    try {
      const cacheNames = await caches.keys();
      const status: Record<string, any> = {};
      
      for (const cacheName of cacheNames) {
        const cache = await caches.open(cacheName);
        const keys = await cache.keys();
        status[cacheName] = {
          entries: keys.length,
          keys: keys.slice(0, 5).map(key => key.url)
        };
      }
      
      setCacheStatus(status);
    } catch (error) {
      console.error("Ошибка проверки кэшей:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const clearAllCaches = async () => {
    try {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map(name => caches.delete(name)));
      setCacheStatus({});
      console.log("Все кэши очищены");
    } catch (error) {
      console.error("Ошибка очистки кэшей:", error);
    }
  };

  useEffect(() => {
    checkCaches();
  }, []);

  return (
    <div style={{ 
      position: "fixed", 
      top: 10, 
      right: 10, 
      background: "white", 
      border: "1px solid #ccc", 
      padding: "10px", 
      borderRadius: "5px",
      zIndex: 9999,
      maxWidth: "300px"
    }}>
      <h3>Cache Debugger</h3>
      <button onClick={checkCaches} disabled={isLoading}>
        {isLoading ? "Проверяем..." : "Проверить кэши"}
      </button>
      <button onClick={clearAllCaches} style={{ marginLeft: "10px" }}>
        Очистить все
      </button>
      
      <div style={{ marginTop: "10px" }}>
        {Object.entries(cacheStatus).map(([name, info]) => (
          <div key={name} style={{ marginBottom: "5px" }}>
            <strong>{name}:</strong> {info.entries} записей
            {info.keys.length > 0 && (
              <div style={{ fontSize: "12px", color: "#666" }}>
                {info.keys.map((key: string, i: number) => (
                  <div key={i}>{key}</div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
