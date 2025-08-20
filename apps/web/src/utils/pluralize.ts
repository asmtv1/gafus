// src/utils/pluralize.ts
export function declOfNum(n: number, titles: [string, string, string]) {
  return titles[
    n % 10 === 1 && n % 100 !== 11
      ? 0
      : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100)
        ? 1
        : 2
  ];
}
