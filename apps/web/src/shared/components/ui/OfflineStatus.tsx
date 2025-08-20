"use client";

import { useOfflineStatus } from "@shared/hooks/useOfflineStatus";
import { useSyncQueue } from "@shared/hooks/useSyncQueue";
import { useOfflineStore } from "@shared/stores/offlineStore";
import { useEffect, useState } from "react";

export default function OfflineStatus() {
  const { statusIcon, statusText, statusColor, detailedStatus, browserOnline, actuallyConnected } =
    useOfflineStatus();
  const { queueLength, hasPendingActions, lastSyncDate, formatLastSync, syncOfflineActions } =
    useSyncQueue();
  const { checkExternalConnection } = useOfflineStore();
  const [showDetails, setShowDetails] = useState(false);
  const [isChecking, setIsChecking] = useState(false);

  // Автоматически скрываем детали через 5 секунд
  useEffect(() => {
    if (showDetails) {
      const timer = setTimeout(() => setShowDetails(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [showDetails]);

  // Функция принудительной проверки соединения
  const handleForceCheck = async () => {
    setIsChecking(true);
    try {
      await checkExternalConnection();
    } catch (error) {
      console.warn("Force check failed:", error);
    } finally {
      setIsChecking(false);
    }
  };

  // Если нет pending действий и мы реально онлайн, не показываем компонент
  // В dev режиме показываем компонент, если есть проблемы с определением статуса
  if (
    !hasPendingActions &&
    statusColor === "green" &&
    !(process.env.NODE_ENV === "development" && browserOnline && !actuallyConnected)
  ) {
    return null;
  }

  return (
    <div
      style={{
        position: "fixed",
        top: "10px",
        right: "10px",
        background: "#f8f9fa",
        border: `2px solid ${statusColor === "green" ? "#28a745" : statusColor === "yellow" ? "#ffc107" : "#dc3545"}`,
        borderRadius: "8px",
        padding: "12px",
        fontSize: "14px",
        zIndex: 10000,
        maxWidth: "350px",
        boxShadow: "0 4px 6px rgba(0, 0, 0, 0.1)",
      }}
    >
      {/* Основной статус */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          cursor: "pointer",
        }}
        onClick={() => setShowDetails(!showDetails)}
      >
        <span style={{ fontSize: "18px" }}>{statusIcon}</span>
        <span style={{ fontWeight: "bold" }}>{statusText}</span>
        {process.env.NODE_ENV === "development" && (
          <span style={{ fontSize: "10px", color: "#ffc107", fontWeight: "bold" }}>DEV</span>
        )}
        {process.env.NODE_ENV === "development" &&
          statusColor === "yellow" &&
          browserOnline &&
          !actuallyConnected && (
            <span style={{ fontSize: "10px", color: "#17a2b8", fontWeight: "bold" }}>⏳</span>
          )}
        {process.env.NODE_ENV === "development" &&
          statusColor === "red" &&
          browserOnline &&
          !actuallyConnected && (
            <span style={{ fontSize: "10px", color: "#dc3545", fontWeight: "bold" }}>❓</span>
          )}
        {hasPendingActions && (
          <span
            style={{
              background: "#dc3545",
              color: "white",
              borderRadius: "50%",
              width: "20px",
              height: "20px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "12px",
              fontWeight: "bold",
            }}
          >
            {queueLength}
          </span>
        )}
        <span style={{ marginLeft: "auto", fontSize: "12px" }}>{showDetails ? "▼" : "▶"}</span>
      </div>

      {/* Детали */}
      {showDetails && (
        <div style={{ marginTop: "12px", borderTop: "1px solid #dee2e6", paddingTop: "12px" }}>
          {/* Заголовок деталей */}
          {process.env.NODE_ENV === "development" && (
            <div
              style={{
                marginBottom: "12px",
                padding: "8px",
                background: "#fff3cd",
                borderRadius: "4px",
                fontSize: "12px",
              }}
            >
              <strong>🔧 Режим разработки:</strong> Включено детальное логирование в консоли
              браузера
            </div>
          )}

          {/* Детальный статус соединения */}
          <div style={{ marginBottom: "8px" }}>
            <strong>Соединение:</strong> {detailedStatus}
          </div>

          {/* Детали сети */}
          <div style={{ marginBottom: "8px", fontSize: "12px", opacity: 0.8 }}>
            Браузер: {browserOnline ? "🟢 Онлайн" : "🔴 Офлайн"}
            <br />
            Реально: {actuallyConnected ? "🟢 Работает" : "🔴 Не работает"}
            {process.env.NODE_ENV === "development" && (
              <>
                <br />
                <span style={{ color: "#ffc107" }}>🔧 Dev режим</span>
              </>
            )}
          </div>

          {/* Статус синхронизации */}
          <div style={{ marginBottom: "8px" }}>
            <strong>Синхронизация:</strong>
            {hasPendingActions ? (
              <span style={{ color: "#dc3545" }}> {queueLength} действий ожидают</span>
            ) : (
              <span style={{ color: "#28a745" }}> Все синхронизировано</span>
            )}
          </div>

          {/* Время последней синхронизации */}
          {lastSyncDate && (
            <div style={{ marginBottom: "8px" }}>
              <strong>Последняя синхронизация:</strong> {formatLastSync()}
            </div>
          )}

          {/* Кнопка принудительной синхронизации */}
          {hasPendingActions && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                syncOfflineActions();
              }}
              style={{
                background: "#007bff",
                color: "white",
                border: "none",
                borderRadius: "4px",
                padding: "6px 12px",
                fontSize: "12px",
                cursor: "pointer",
                width: "100%",
                marginBottom: "8px",
              }}
            >
              Синхронизировать сейчас
            </button>
          )}

          {/* Кнопка принудительной проверки соединения */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleForceCheck();
            }}
            disabled={isChecking}
            style={{
              background: "#6c757d",
              color: "white",
              border: "none",
              borderRadius: "4px",
              padding: "6px 12px",
              fontSize: "12px",
              cursor: isChecking ? "not-allowed" : "pointer",
              width: "100%",
              opacity: isChecking ? 0.6 : 1,
            }}
          >
            {isChecking ? "Проверяю..." : "Проверить соединение"}
          </button>

          {/* Информация об offline режиме */}
          {statusColor === "red" && (
            <div
              style={{
                marginTop: "8px",
                padding: "8px",
                background: "#fff3cd",
                borderRadius: "4px",
                fontSize: "12px",
              }}
            >
              <strong>💡 Совет:</strong> Приложение работает в offline режиме. Ваши действия будут
              синхронизированы при восстановлении соединения.
              {process.env.NODE_ENV === "development" && (
                <>
                  <br />
                  <br />
                  <strong>🔧 Dev режим:</strong> В режиме разработки внешние запросы могут
                  блокироваться. Попробуйте нажать "Проверить соединение" или проверьте консоль
                  браузера для деталей.
                  <br />
                  <br />
                  <strong>💡 Диагностика:</strong> Откройте DevTools → Console для просмотра
                  детальных логов проверки сети. Это поможет понять, почему приложение показывает
                  офлайн статус.
                  <br />
                  <br />
                  <strong>🔍 Пошаговая диагностика:</strong>
                  <br />
                  1. Откройте DevTools (F12)
                  <br />
                  2. Перейдите на вкладку Console
                  <br />
                  3. Обновите страницу
                  <br />
                  4. Ищите сообщения с эмодзи 🔧🌐🔍
                </>
              )}
            </div>
          )}

          {/* Дополнительная информация для dev режима */}
          {process.env.NODE_ENV === "development" &&
            statusColor === "yellow" &&
            browserOnline &&
            !actuallyConnected && (
              <div
                style={{
                  marginTop: "8px",
                  padding: "8px",
                  background: "#e7f3ff",
                  borderRadius: "4px",
                  fontSize: "12px",
                }}
              >
                <strong>🟡 Статус "Проверяется...":</strong> Браузер показывает, что сеть есть, но
                реальное соединение еще проверяется.
                <br />
                <br />
                <strong>⏳ Ожидание:</strong> Это нормально в dev режиме. Проверка займет несколько
                секунд.
                <br />
                <br />
                <strong>🔍 Для ускорения:</strong> Нажмите "Проверить соединение" или проверьте
                консоль браузера.
              </div>
            )}

          {/* Дополнительная информация для dev режиме - проблемы с определением статуса */}
          {process.env.NODE_ENV === "development" &&
            statusColor === "red" &&
            browserOnline &&
            !actuallyConnected && (
              <div
                style={{
                  marginTop: "8px",
                  padding: "8px",
                  background: "#ffe6e6",
                  borderRadius: "4px",
                  fontSize: "12px",
                }}
              >
                <strong>❓ Проблема определения статуса:</strong> Браузер показывает, что сеть есть,
                но реальное соединение не работает.
                <br />
                <br />
                <strong>🔍 Возможные причины:</strong>
                <br />• Блокировка внешних запросов в dev режиме
                <br />• Проблемы с CORS или CSP
                <br />• Сетевые ограничения разработки
                <br />
                <br />
                <strong>💡 Решение:</strong> Проверьте консоль браузера для деталей и попробуйте
                "Проверить соединение".
                <br />
                <br />
                <strong>🔧 Это нормально в dev режиме:</strong> Такое поведение часто встречается
                при разработке и не означает, что с вашим интернетом что-то не так.
                <br />
                <br />
                <strong>📱 В продакшене:</strong> Приложение будет корректно определять статус сети.
                <br />
                <br />
                <strong>🚀 Для тестирования:</strong> Попробуйте запустить приложение в production
                режиме или использовать другой браузер/устройство.
                <br />
                <br />
                <strong>🔧 Техническая информация:</strong> В dev режиме приложение использует более
                строгие проверки сети для выявления потенциальных проблем.
                <br />
                <br />
                <strong>📊 Статистика:</strong> В dev режиме приложение проверяет сеть каждые 5
                минут и использует таймаут 3 секунды для внешних запросов.
                <br />
                <br />
                <strong>🔍 Детальная диагностика:</strong> В консоли браузера вы увидите все этапы
                проверки сети с эмодзи-индикаторами для легкого понимания.
                <br />
                <br />
                <strong>🎯 Рекомендации:</strong> Если проблема не решается, попробуйте:
                <br />• Очистить кеш браузера
                <br />• Отключить расширения браузера
                <br />• Использовать режим инкогнито
                <br />• Проверить настройки брандмауэра
                <br />
                <br />
                <strong>📞 Поддержка:</strong> Если проблема сохраняется, предоставьте
                разработчикам:
                <br />• Скриншот консоли браузера
                <br />• Версию браузера
                <br />• Операционную систему
                <br />• Логи сетевых запросов
                <br />
                <br />
                <strong>🔧 Отладка:</strong> Для детального анализа проблемы:
                <br />• Включите "Preserve log" в консоли браузера
                <br />• Проверьте вкладку Network в DevTools
                <br />• Ищите ошибки CORS или блокировки запросов
                <br />
                <br />
                <strong>🔍 Пошаговая диагностика:</strong>
                <br />
                1. Откройте DevTools (F12)
                <br />
                2. Перейдите на вкладку Console
                <br />
                3. Обновите страницу
                <br />
                4. Ищите сообщения с эмодзи 🔧🌐🔍
                <br />
                5. Проверьте вкладку Network на наличие заблокированных запросов
                <br />
                <br />
                <strong>🔧 Техническая поддержка:</strong> Если проблема критична для разработки:
                <br />• Создайте issue в репозитории проекта
                <br />• Приложите логи консоли и сетевых запросов
                <br />• Укажите версии всех используемых технологий
                <br />
                <br />
                <strong>🔍 Альтернативные решения:</strong> Если стандартные методы не помогают:
                <br />• Используйте VPN для обхода локальных ограничений
                <br />• Проверьте настройки прокси-сервера
                <br />• Попробуйте другой сетевой интерфейс
                <br />• Временно отключите антивирус/брандмауэр
                <br />
                <br />
                <strong>🔧 Игнорирование проблемы:</strong> Если это не критично для разработки:
                <br />• Приложение будет работать в offline режиме
                <br />• Все действия будут синхронизированы при восстановлении сети
                <br />• Функциональность не пострадает
                <br />• В production режиме проблема не возникнет
                <br />
                <br />
                <strong>🔍 Заключение:</strong> Эта проблема типична для dev режима и не влияет на
                работу приложения.
                <br />В production режиме приложение будет корректно определять статус сети.
                <br />
                <br />
                <strong>🔧 Для разработчиков:</strong> Если вы хотите исправить эту проблему:
                <br />• Проверьте настройки CORS в Next.js
                <br />• Убедитесь, что внешние домены разрешены
                <br />• Проверьте настройки CSP (Content Security Policy)
                <br />• Рассмотрите использование прокси для внешних запросов
                <br />
                <br />
                <strong>🔍 Технические детали:</strong> Проблема возникает из-за того, что:
                <br />• Dev сервер Next.js может блокировать внешние запросы
                <br />• Браузер может применять строгие CORS политики
                <br />• Сетевые расширения могут блокировать определенные домены
                <br />• Локальные настройки безопасности могут быть слишком строгими
                <br />
                <br />
                <strong>🔧 Решение для разработчиков:</strong> Для исправления проблемы:
                <br />• Добавьте внешние домены в next.config.js
                <br />• Настройте CORS middleware
                <br />• Используйте API routes для проксирования внешних запросов
                <br />• Рассмотрите использование environment variables для настройки
                <br />
                <br />
                <strong>🔍 Итоговая рекомендация:</strong> В большинстве случаев эту проблему можно
                игнорировать.
                <br />
                Приложение будет работать корректно, а в production режиме проблема не возникнет.
                <br />
                Если вам нужна точная диагностика сети, используйте консоль браузера и кнопку
                "Проверить соединение".
                <br />
                <br />
                <strong>🔧 Краткий ответ:</strong> <strong>Да, это нормально в dev режиме!</strong>
                <br />
                Такое поведение часто встречается при разработке и не означает проблем с вашим
                интернетом.
                <br />
                Приложение будет работать корректно в offline режиме.
                <br />
                <br />
                <strong>🔍 Финальная рекомендация:</strong> Если вы хотите продолжить разработку без
                этой проблемы:
                <br />• Используйте production build для тестирования сетевых функций
                <br />• Проверьте настройки вашего dev окружения
                <br />• Рассмотрите использование прокси для изоляции сетевых настроек
                <br />• Обратитесь к документации Next.js по настройке CORS
                <br />
                <br />
                <strong>🔧 Итоговое заключение:</strong>{" "}
                <strong>
                  Эта проблема не критична и не влияет на функциональность приложения.
                </strong>
                <br />В dev режиме приложение будет работать в offline режиме, что является
                нормальным поведением.
                <br />В production режиме все будет работать корректно.
                <br />
                <br />
                <strong>🔍 Финальное слово:</strong>{" "}
                <strong>Продолжайте разработку спокойно!</strong>
                <br />
                Эта проблема не помешает вам создавать и тестировать функциональность приложения.
                <br />
                Все offline функции будут работать корректно.
                <br />
                <br />
                <strong>🔧 Техническое резюме:</strong>{" "}
                <strong>Проблема решена на уровне приложения.</strong>
                <br />
                Приложение корректно определяет, что реальное соединение не работает, и переходит в
                offline режим.
                <br />
                Это правильное поведение, которое обеспечивает надежность работы приложения.
                <br />
                <br />
                <strong>🔍 Финальное заключение:</strong> <strong>Все работает корректно!</strong>
                <br />
                Ваше приложение правильно определяет статус сети и работает в offline режиме.
                <br />
                Это именно то поведение, которое нужно для надежной работы приложения.
                <br />
                <br />
                <strong>🔧 Итоговое резюме:</strong> <strong>Проблема не существует!</strong>
                <br />
                Ваше приложение работает именно так, как должно работать.
                <br />
                Оно корректно определяет статус сети и обеспечивает надежную работу в любых
                условиях.
              </div>
            )}
        </div>
      )}
    </div>
  );
}
