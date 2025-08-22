"use client";

import type { ErrorDashboardReport } from "@gafus/types";
import { useErrors } from "@shared/hooks/useErrors";
import { useEffect, useState } from "react";

interface PushSpecificContext {
  context: string;
  service: string;
  notificationId?: string;
  endpoint?: string;
  level: string;
  timestamp: string;
}

interface PushLogAdditionalContext {
  pushSpecific: PushSpecificContext;
  [key: string]: unknown;
}

export default function PushLogsPage() {
  const [filteredLogs, setFilteredLogs] = useState<ErrorDashboardReport[]>([]);
  const [selectedLevel, setSelectedLevel] = useState<string>("all");
  const [selectedContext, setSelectedContext] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState<string>("");

  // Получаем все push-логи
  const {
    data: allLogs,
    error,
    isLoading,
  } = useErrors({
    appName: "push-notifications",
    limit: 1000, // Получаем больше логов для фильтрации
  });

  // Фильтруем логи
  useEffect(() => {
    if (!allLogs) return;

    let filtered = allLogs;

    // Фильтр по уровню
    if (selectedLevel !== "all") {
      filtered = filtered.filter((log) => {
        const additionalContext = log.additionalContext as PushLogAdditionalContext;
        return additionalContext?.pushSpecific?.level === selectedLevel;
      });
    }

    // Фильтр по контексту
    if (selectedContext !== "all") {
      filtered = filtered.filter((log) => {
        const additionalContext = log.additionalContext as PushLogAdditionalContext;
        return additionalContext?.pushSpecific?.context === selectedContext;
      });
    }

    // Фильтр по поиску
    if (searchTerm) {
      filtered = filtered.filter((log) => {
        const additionalContext = log.additionalContext as PushLogAdditionalContext;
        return (
          log.message.toLowerCase().includes(searchTerm.toLowerCase()) ||
          additionalContext?.pushSpecific?.context?.toLowerCase().includes(searchTerm.toLowerCase())
        );
      });
    }

    setFilteredLogs(filtered);
  }, [allLogs, selectedLevel, selectedContext, searchTerm]);

  // Получаем уникальные значения для фильтров
  const levels = [
    "all",
    ...Array.from(
      new Set(
        allLogs
          ?.map((log) => {
            const additionalContext = log.additionalContext as PushLogAdditionalContext;
            return additionalContext?.pushSpecific?.level;
          })
          .filter(Boolean) || [],
      ),
    ),
  ];

  const contexts = [
    "all",
    ...Array.from(
      new Set(
        allLogs
          ?.map((log) => {
            const additionalContext = log.additionalContext as PushLogAdditionalContext;
            return additionalContext?.pushSpecific?.context;
          })
          .filter(Boolean) || [],
      ),
    ),
  ];

  if (isLoading) return <div className="p-6">Загрузка push-логов...</div>;
  if (error) return <div className="p-6 text-red-600">Ошибка загрузки: {error.message}</div>;

  return (
    <div className="mx-auto max-w-7xl p-6">
      <h1 className="mb-6 text-3xl font-bold">Push-логи</h1>

      {/* Фильтры */}
      <div className="mb-6 space-y-4">
        <div className="flex flex-wrap gap-4">
          <div>
            <label className="mb-2 block text-sm font-medium">Уровень:</label>
            <select
              value={selectedLevel}
              onChange={(e) => setSelectedLevel(e.target.value)}
              className="rounded border px-3 py-2"
            >
              {levels.map((level) => (
                <option key={level} value={level}>
                  {level === "all" ? "Все" : level}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">Контекст:</label>
            <select
              value={selectedContext}
              onChange={(e) => setSelectedContext(e.target.value)}
              className="rounded border px-3 py-2"
            >
              {contexts.map((context) => (
                <option key={context} value={context}>
                  {context === "all" ? "Все" : context}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">Поиск:</label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Поиск по сообщению или контексту..."
              className="w-64 rounded border px-3 py-2"
            />
          </div>
        </div>

        <div className="text-sm text-gray-600">
          Найдено: {filteredLogs.length} из {allLogs?.length || 0} логов
        </div>
      </div>

      {/* Список логов */}
      <div className="space-y-4">
        {filteredLogs.map((log) => {
          const additionalContext = log.additionalContext as PushLogAdditionalContext;
          const pushSpecific = additionalContext?.pushSpecific;

          return (
            <div
              key={log.id}
              className={`rounded-lg border p-4 ${
                pushSpecific?.level === "error"
                  ? "border-red-200 bg-red-50"
                  : pushSpecific?.level === "warn"
                    ? "border-yellow-200 bg-yellow-50"
                    : "border-gray-200 bg-white"
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="mb-2 flex items-center gap-2">
                    <span
                      className={`rounded px-2 py-1 text-xs font-medium ${
                        pushSpecific?.level === "error"
                          ? "bg-red-100 text-red-800"
                          : pushSpecific?.level === "warn"
                            ? "bg-yellow-100 text-yellow-800"
                            : pushSpecific?.level === "info"
                              ? "bg-blue-100 text-blue-800"
                              : "bg-gray-100 text-gray-800"
                      }`}
                    >
                      {pushSpecific?.level || "unknown"}
                    </span>
                    <span className="text-sm text-gray-600">
                      {pushSpecific?.context || "unknown"}
                    </span>
                    <span className="text-sm text-gray-500">
                      {new Date(pushSpecific?.timestamp || log.createdAt).toLocaleString()}
                    </span>
                  </div>

                  <p className="mb-2 font-medium">{log.message}</p>

                  {pushSpecific?.endpoint && (
                    <p className="mb-2 text-sm text-gray-600">
                      Endpoint: {pushSpecific.endpoint.substring(0, 50)}...
                    </p>
                  )}

                  {pushSpecific?.notificationId && (
                    <p className="mb-2 text-sm text-gray-600">
                      Notification ID: {pushSpecific.notificationId}
                    </p>
                  )}

                  {log.tags && log.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {log.tags.map((tag, index) => (
                        <span
                          key={index}
                          className="rounded bg-gray-100 px-2 py-1 text-xs text-gray-700"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {filteredLogs.length === 0 && (
        <div className="py-8 text-center text-gray-500">Логи не найдены</div>
      )}
    </div>
  );
}
