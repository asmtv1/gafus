"use client";

export default function OfflinePage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
        <div className="mb-6">
          <div className="mx-auto w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mb-4">
            <svg
              className="w-8 h-8 text-yellow-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Нет соединения с сервером
          </h1>
          <p className="text-gray-600">
            Сервер временно недоступен, но вы можете использовать приложение в офлайн режиме
          </p>
        </div>

        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-left">
            <h3 className="font-semibold text-blue-900 mb-2">Что доступно:</h3>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>• Просмотр загруженных курсов</li>
              <li>• Таймеры и тренировки (если были закэшированы)</li>
              <li>• Прогресс и статистика (из кэша)</li>
              <li>• Работа с кэшированным контентом</li>
              <li>• Локальные действия (сохранятся при восстановлении связи)</li>
            </ul>
          </div>

          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-left">
            <h3 className="font-semibold text-yellow-900 mb-2">Что недоступно:</h3>
            <ul className="text-sm text-yellow-800 space-y-1">
              <li>• Загрузка новых курсов</li>
              <li>• Синхронизация с сервером</li>
              <li>• Обновление данных</li>
            </ul>
          </div>

          <button
            onClick={() => window.location.reload()}
            className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Попробовать снова
          </button>

          <button
            onClick={() => window.history.back()}
            className="w-full bg-gray-200 text-gray-800 py-3 px-4 rounded-lg hover:bg-gray-300 transition-colors"
          >
            Назад
          </button>
        </div>

        <div className="mt-6 text-xs text-gray-500">
          <p>Приложение будет автоматически синхронизироваться при восстановлении соединения</p>
        </div>
      </div>
    </div>
  );
}
