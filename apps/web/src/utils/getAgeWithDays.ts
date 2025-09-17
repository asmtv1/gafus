export function getAgeWithDays(birthDateString: string) {
  // Нормализуем даты к UTC для избежания проблем с часовыми поясами
  const birthDate = new Date(birthDateString);
  const now = new Date();
  
  // Используем UTC даты для консистентности между сервером и клиентом
  const birthUTC = new Date(Date.UTC(birthDate.getFullYear(), birthDate.getMonth(), birthDate.getDate()));
  const nowUTC = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));

  let years = nowUTC.getUTCFullYear() - birthUTC.getUTCFullYear();
  let months = nowUTC.getUTCMonth() - birthUTC.getUTCMonth();
  let days = nowUTC.getUTCDate() - birthUTC.getUTCDate();

  if (days < 0) {
    months--;
    // Получаем количество дней в предыдущем месяце
    const prevMonth = new Date(nowUTC.getUTCFullYear(), nowUTC.getUTCMonth(), 0);
    days += prevMonth.getUTCDate();
  }

  if (months < 0) {
    years--;
    months += 12;
  }

  return { years, months, days };
}
