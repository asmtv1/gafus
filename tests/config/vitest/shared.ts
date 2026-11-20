/** Pure shared defaults: a unit test importing this file never starts Prisma, Docker or a socket. */
export const unitExclude = [
  '**/node_modules/**', '**/dist/**', '**/.next/**',
  '**/*real-pg*.test.ts', '**/*realpg*.test.ts',
  '**/*isolatedpg*.test.ts', '**/*private-work*.test.ts',
  '**/*permanent-work*.test.ts',
] as const;

export const coverageExclude = [
  '**/*.d.ts', '**/generated/**', '**/dist/**', '**/node_modules/**',
] as const;
