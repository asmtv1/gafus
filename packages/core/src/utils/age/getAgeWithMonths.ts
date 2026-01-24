export function getAgeWithMonths(birthDateString: string) {
  const birthDate = new Date(birthDateString);
  const now = new Date();

  // Используем UTC даты для консистентности между сервером и клиентом
  const birthUTC = new Date(
    Date.UTC(birthDate.getFullYear(), birthDate.getMonth(), birthDate.getDate()),
  );
  const nowUTC = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));

  let years = nowUTC.getUTCFullYear() - birthUTC.getUTCFullYear();
  let months = nowUTC.getUTCMonth() - birthUTC.getUTCMonth();

  if (months < 0) {
    years--;
    months += 12;
  }

  return { years, months };
}
