const VERSION_PATTERN = /^\d+\.\d+\.\d+$/;

function parseVersion(version: string): number[] | null {
  const normalized = version.trim();
  if (!VERSION_PATTERN.test(normalized)) {
    return null;
  }
  return normalized.split(".").map(Number);
}

/** Некорректная версия никогда не блокирует приложение: защита работает fail-open. */
export function isAppUpdateRequired(currentVersion: string, minimumVersion: string): boolean {
  const current = parseVersion(currentVersion);
  const minimum = parseVersion(minimumVersion);
  if (!current || !minimum) {
    return false;
  }

  for (let index = 0; index < minimum.length; index++) {
    if (current[index] !== minimum[index]) {
      return current[index] < minimum[index];
    }
  }

  return false;
}
