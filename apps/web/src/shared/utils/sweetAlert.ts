import Swal from 'sweetalert2';

// Настройки темы под ваш дизайн
const customTheme = {
  confirmButtonColor: '#FFF8E5',
  cancelButtonColor: '#FFF8E5',
};

// Стилизованное уведомление о незавершенном курсе
export const showCourseRatingAlert = () => {
  return Swal.fire({
    title: 'Курс не завершен',
    text: 'Завершите курс, чтобы поставить рейтинг',
    imageUrl: '/logo.png',
    imageWidth: 160,
    imageHeight: 160,
    imageAlt: 'Гафус',
    confirmButtonText: 'окай :(',
    confirmButtonColor: customTheme.cancelButtonColor,
    customClass: {
      popup: 'swal2-popup-custom',
      title: 'swal2-title-custom',
      htmlContainer: 'swal2-content-custom',
      confirmButton: 'swal2-confirm-custom',
    },
    timer: 3000,
  });
};

// Стилизованное уведомление об ошибке
export const showErrorAlert = (message: string) => {
  return Swal.fire({
    title: 'Ошибка',
    text: message,
    imageUrl: '/logo.png',
    imageWidth: 50,
    imageHeight: 50,
    imageAlt: 'Гафус',
    confirmButtonText: 'Понятно',
    confirmButtonColor: customTheme.cancelButtonColor,
    customClass: {
      popup: 'swal2-popup-custom',
      title: 'swal2-title-custom',
      htmlContainer: 'swal2-content-custom',
      confirmButton: 'swal2-confirm-custom',
    },
  });
};

// Стилизованное уведомление об успехе
export const showSuccessAlert = (message: string) => {
  return Swal.fire({
    title: 'Успешно',
    text: message,
    imageUrl: '/logo.png',
    imageWidth: 160,
    imageHeight: 160,
    imageAlt: 'Гафус',
    confirmButtonText: 'Отлично',
    confirmButtonColor: customTheme.cancelButtonColor,
    customClass: {
      popup: 'swal2-popup-custom',
      title: 'swal2-title-custom',
      htmlContainer: 'swal2-content-custom',
      confirmButton: 'swal2-confirm-custom',
    },
    timer: 2000,
  });
};

// Стилизованный запрос разрешения на уведомления
export const showNotificationPermissionAlert = (
  onAllow: () => void,
  onDeny: () => void,
  isLoading: boolean = false,
  error: string | null = null
) => {
  return Swal.fire({
    title: 'Включить уведомления?',
    text: 'Включите уведомления, чтобы получать оповещения о завершении упражнения.\n' +
      'Так вы сможете не отвлекаться на телефон во время тренировки.\n' +
      'Отключить уведомления можно в настройках профиля.',
    imageUrl: '/logo.png',
    imageWidth: 160,
    imageHeight: 160,
    imageAlt: 'Гафус',
    showCancelButton: true,
    confirmButtonText: isLoading ? 'Загрузка...' : 'Включить',
    cancelButtonText: 'Не сейчас',
    confirmButtonColor: customTheme.confirmButtonColor,
    cancelButtonColor: customTheme.cancelButtonColor,
    customClass: {
      popup: 'swal2-popup-custom',
      title: 'swal2-title-custom',
      htmlContainer: 'swal2-content-custom',
      confirmButton: 'swal2-confirm-custom',
      cancelButton: 'swal2-cancel-custom',
    },
    allowOutsideClick: false,
    allowEscapeKey: false,
    didOpen: () => {
      if (error) {
        Swal.showValidationMessage(error);
      }
    },
  }).then(async (result) => {
    if (result.isConfirmed) {
      // Показываем загрузку
      Swal.showLoading();
      try {
        await onAllow();
        // Закрываем модальное окно после успешного выполнения
        Swal.close();
      } catch {
        // Показываем ошибку, но не закрываем модальное окно
        Swal.hideLoading();
        Swal.showValidationMessage('Произошла ошибка при включении уведомлений');
      }
    } else if (result.dismiss === Swal.DismissReason.cancel) {
      await onDeny();
      // Закрываем модальное окно после выполнения действия
      Swal.close();
    }
  });
};
