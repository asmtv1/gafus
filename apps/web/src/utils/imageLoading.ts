/**
 * Определяет, нужно ли использовать lazy loading для изображения
 * @param index - индекс элемента в списке
 * @param isAboveFold - находится ли элемент выше fold (видимый без прокрутки)
 * @param isCritical - критично ли изображение для UX
 * @returns true если нужно использовать lazy loading
 */
export function shouldUseLazyLoading(
  index: number,
  isAboveFold = false,
  isCritical = false,
): boolean {
  // Если изображение критично или выше fold - не используем lazy loading
  if (isCritical || isAboveFold) {
    return false;
  }

  // Для первых 2 элементов в списке не используем lazy loading
  if (index < 2) {
    return false;
  }

  // Для остальных используем lazy loading
  return true;
}

/**
 * Определяет приоритет загрузки изображения
 * @param index - индекс элемента в списке
 * @param isAboveFold - находится ли элемент выше fold
 * @param isCritical - критично ли изображение для UX
 * @returns true если нужно использовать priority
 */
export function shouldUsePriority(index: number, isAboveFold = false, isCritical = false): boolean {
  // Если изображение критично или выше fold - используем priority
  if (isCritical || isAboveFold) {
    return true;
  }

  // Для первых 2 элементов в списке используем priority
  if (index < 2) {
    return true;
  }

  // Для остальных не используем priority
  return false;
}
