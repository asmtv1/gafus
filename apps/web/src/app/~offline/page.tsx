export const metadata = {
  title: "Оффлайн",
  description: "Вы потеряли соединение с интернетом. Попробуйте обновить страницу.",
  robots: { index: false, follow: false },
};

// Делаем страницу полностью статической
export const dynamic = "force-static";
export const revalidate = false;

export default function OfflinePage() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        padding: "20px",
        textAlign: "center",
        background: "#f8f9fa",
      }}
    >
      <div
        style={{
          background: "white",
          padding: "40px",
          borderRadius: "12px",
          boxShadow: "0 4px 6px rgba(0, 0, 0, 0.1)",
          maxWidth: "500px",
        }}
      >
        <h1 style={{ color: "#dc3545", marginBottom: "20px" }}>🔴 Нет подключения к интернету</h1>

        <p style={{ fontSize: "18px", marginBottom: "20px", color: "#6c757d" }}>
          Приложение работает в offline режиме
        </p>

        <div
          style={{
            background: "#e9ecef",
            padding: "20px",
            borderRadius: "8px",
            marginBottom: "20px",
          }}
        >
          <h3 style={{ marginBottom: "15px" }}>Что работает offline:</h3>
          <ul style={{ textAlign: "left", margin: 0, paddingLeft: "20px" }}>
            <li>✅ Просмотр загруженных курсов</li>
            <li>✅ Тренировки и прогресс</li>
            <li>✅ Профиль и настройки</li>
            <li>✅ Навигация по основным страницам</li>
          </ul>
        </div>

        <div
          style={{
            background: "#fff3cd",
            padding: "15px",
            borderRadius: "8px",
            border: "1px solid #ffeaa7",
          }}
        >
          <p style={{ margin: 0, fontSize: "14px" }}>
            <strong>💡 Совет:</strong> Ваши действия сохраняются локально и будут синхронизированы
            при восстановлении соединения.
          </p>
        </div>

        <button
          style={{
            background: "#007bff",
            color: "white",
            border: "none",
            borderRadius: "8px",
            padding: "12px 24px",
            fontSize: "16px",
            cursor: "pointer",
            marginTop: "20px",
          }}
        >
          Попробовать снова
        </button>
      </div>
    </div>
  );
}
