export function getAge(birthDate: string | Date): number {
  const birth = new Date(birthDate);
  const today = new Date();
  
  // Используем UTC даты для консистентности между сервером и клиентом
  const birthUTC = new Date(Date.UTC(birth.getFullYear(), birth.getMonth(), birth.getDate()));
  const todayUTC = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));

  let age = todayUTC.getUTCFullYear() - birthUTC.getUTCFullYear();
  const monthDiff = todayUTC.getUTCMonth() - birthUTC.getUTCMonth();
  const dayDiff = todayUTC.getUTCDate() - birthUTC.getUTCDate();

  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
    age--;
  }

  return age;
}
