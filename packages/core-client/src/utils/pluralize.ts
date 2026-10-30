/**
 * Склонение числительных для русского языка
 * @param n - число
 * @param titles - массив склонений [1, 2, 5] например ["год", "года", "лет"]
 * @returns правильное склонение для числа
 *
 * @example
 * declOfNum(1, ["год", "года", "лет"]) // "год"
 * declOfNum(2, ["год", "года", "лет"]) // "года"
 * declOfNum(5, ["год", "года", "лет"]) // "лет"
 */
export function declOfNum(n: number, titles: [string, string, string]): string {
  return titles[
    n % 10 === 1 && n % 100 !== 11
      ? 0
      : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100)
        ? 1
        : 2
  ];
}
