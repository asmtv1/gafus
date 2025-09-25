/**
 * Утилиты для работы с обработчиками событий
 * Обеспечивают лучшую производительность с пассивными слушателями
 */

// Проверяем поддержку пассивных слушателей
let supportsPassive = false;
try {
  const opts = Object.defineProperty({}, 'passive', {
    get: function() {
      supportsPassive = true;
    }
  });
  window.addEventListener('test', () => { /* test handler */ }, opts);
} catch (_e) {
  // Пассивные слушатели не поддерживаются
}

/**
 * Безопасно добавляет обработчик события с пассивным слушателем
 * @param element - элемент для добавления слушателя
 * @param event - тип события
 * @param handler - обработчик события
 * @param options - дополнительные опции
 */
export function addPassiveEventListener(
  element: EventTarget,
  event: string,
  handler: EventListener,
  options: AddEventListenerOptions = {}
): void {
  // Для событий прокрутки и касаний используем пассивные слушатели
  const scrollBlockingEvents = ['touchstart', 'touchmove', 'wheel', 'mousewheel', 'scroll'];
  
  if (scrollBlockingEvents.includes(event)) {
    const passiveOptions = { ...options, passive: true };
    
    if (supportsPassive) {
      element.addEventListener(event, handler, passiveOptions);
    } else {
      // Fallback для старых браузеров
      element.addEventListener(event, handler, options);
    }
  } else {
    // Для других событий используем обычные слушатели
    element.addEventListener(event, handler, options);
  }
}

/**
 * Безопасно удаляет обработчик события
 * @param element - элемент для удаления слушателя
 * @param event - тип события
 * @param handler - обработчик события
 * @param options - дополнительные опции
 */
export function removePassiveEventListener(
  element: EventTarget,
  event: string,
  handler: EventListener,
  options: AddEventListenerOptions = {}
): void {
  const scrollBlockingEvents = ['touchstart', 'touchmove', 'wheel', 'mousewheel', 'scroll'];
  
  if (scrollBlockingEvents.includes(event)) {
    const passiveOptions = { ...options, passive: true };
    
    if (supportsPassive) {
      element.removeEventListener(event, handler, passiveOptions);
    } else {
      element.removeEventListener(event, handler, options);
    }
  } else {
    element.removeEventListener(event, handler, options);
  }
}

/**
 * Создает обработчик события с автоматическим удалением после первого срабатывания
 * @param element - элемент для добавления слушателя
 * @param event - тип события
 * @param handler - обработчик события
 * @param options - дополнительные опции
 */
export function addOnceEventListener(
  element: EventTarget,
  event: string,
  handler: EventListener,
  options: AddEventListenerOptions = {}
): void {
  const onceHandler = (e: Event) => {
    handler(e);
    removePassiveEventListener(element, event, onceHandler, options);
  };
  
  addPassiveEventListener(element, event, onceHandler, options);
}
