"use client";

import { useUserData, useUserPreferences } from "@shared/stores";
import { useState } from "react";

export default function UserProfile() {
  const { user, profile, isLoading, error } = useUserData();
  const { preferences, isUpdatingPreferences, preferencesError } = useUserPreferences();
  const [showSettings, setShowSettings] = useState(false);

  if (!user) {
    return (
      <div className="p-4 text-center">
        <p>Пожалуйста, войдите в систему</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-4 text-center">
        <p>Загрузка профиля...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-center text-red-600">
        <p>Ошибка загрузки профиля: {error}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md p-4">
      <div className="rounded-lg bg-white p-6 shadow-md">
        <h2 className="mb-4 text-xl font-semibold">Профиль пользователя</h2>

        {/* Основная информация */}
        <div className="mb-6">
          <h3 className="mb-2 text-lg font-medium">Основная информация</h3>
          <div className="space-y-2">
            <p>
              <strong>Имя пользователя:</strong> {user?.username}
            </p>
            <p>
              <strong>Роль:</strong> {user?.role}
            </p>
            {profile?.fullName && (
              <p>
                <strong>Полное имя:</strong> {profile.fullName}
              </p>
            )}
            {profile?.about && (
              <p>
                <strong>О себе:</strong> {profile.about}
              </p>
            )}
          </div>
        </div>

        {/* Настройки */}
        <div className="mb-6">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-lg font-medium">Настройки</h3>
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="text-blue-600 hover:text-blue-800"
            >
              {showSettings ? "Скрыть" : "Показать"}
            </button>
          </div>

          {showSettings && (
            <div className="space-y-4">
              {/* Настройки уведомлений */}
              <div>
                <h4 className="mb-2 font-medium">Уведомления</h4>
                <div className="space-y-1">
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={preferences.notifications.push}
                      disabled={isUpdatingPreferences}
                      className="mr-2"
                    />
                    Push-уведомления
                  </label>
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={preferences.notifications.email}
                      disabled={isUpdatingPreferences}
                      className="mr-2"
                    />
                    Email-уведомления
                  </label>
                </div>
              </div>

              {/* Настройки звука */}
              <div>
                <h4 className="mb-2 font-medium">Звук</h4>
                <div className="space-y-1">
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={preferences.sound.enabled}
                      disabled={isUpdatingPreferences}
                      className="mr-2"
                    />
                    Включить звук
                  </label>
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={preferences.sound.trainingSounds}
                      disabled={isUpdatingPreferences}
                      className="mr-2"
                    />
                    Звуки тренировок
                  </label>
                </div>
              </div>

              {/* Настройки интерфейса */}
              <div>
                <h4 className="mb-2 font-medium">Интерфейс</h4>
                <div className="space-y-1">
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={preferences.interface.showProgress}
                      disabled={isUpdatingPreferences}
                      className="mr-2"
                    />
                    Показывать прогресс
                  </label>
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={preferences.interface.showTips}
                      disabled={isUpdatingPreferences}
                      className="mr-2"
                    />
                    Показывать подсказки
                  </label>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Ошибки */}
        {preferencesError && (
          <div className="mb-4 text-sm text-red-600">Ошибка настроек: {preferencesError}</div>
        )}

        {/* Статус загрузки */}
        {isUpdatingPreferences && (
          <div className="text-sm text-blue-600">Обновление настроек...</div>
        )}
      </div>
    </div>
  );
}
