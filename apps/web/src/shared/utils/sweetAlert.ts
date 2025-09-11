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
