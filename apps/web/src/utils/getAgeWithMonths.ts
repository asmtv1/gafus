export function getAgeWithMonths(birthDateString: string) {
  const birthDate = new Date(birthDateString);
  const now = new Date();

  let years = now.getFullYear() - birthDate.getFullYear();
  let months = now.getMonth() - birthDate.getMonth();

  if (months < 0) {
    years--;
    months += 12;
  }

  return { years, months };
}
