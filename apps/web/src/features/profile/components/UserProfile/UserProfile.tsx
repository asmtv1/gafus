"use client";

import { useUserData } from "@shared/stores";

export default function UserProfile() {
  const { user, profile, isLoading, error } = useUserData();

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
      </div>
    </div>
  );
}
