import Swal from 'sweetalert2';
import type { PetFormData } from '@gafus/types';

// Настройки темы под ваш дизайн
const customTheme = {
  confirmButtonColor: '#FFF8E5',
  cancelButtonColor: '#FFF8E5',
  confirmButtonTextColor: '#ECE5D2',
  cancelButtonTextColor: '#636128',
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

// Стилизованный диалог подтверждения
export const showConfirmDialog = async (title: string, text: string): Promise<boolean> => {
  const result = await Swal.fire({
    title,
    text,
    imageUrl: '/logo.png',
    imageWidth: 160,
    imageHeight: 160,
    imageAlt: 'Гафус',
    showCancelButton: true,
    confirmButtonText: 'Да',
    cancelButtonText: 'Отмена',
    confirmButtonColor: customTheme.cancelButtonColor,
    cancelButtonColor: '#d32f2f',
    customClass: {
      popup: 'swal2-popup-custom',
      title: 'swal2-title-custom',
      htmlContainer: 'swal2-content-custom',
      confirmButton: 'swal2-confirm-custom',
      cancelButton: 'swal2-cancel-custom',
    },
  });
  return result.isConfirmed;
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
    } else if (result.dismiss === 'cancel') {
      await onDeny();
      // Закрываем модальное окно после выполнения действия
      Swal.close();
    }
  });
};

// Модальное окно редактирования питомца
export const showEditPetAlert = async (pet: PetFormData): Promise<PetFormData | null> => {
  const petTypes = [
    { label: "Собака", value: "DOG" },
    { label: "Кошка", value: "CAT" },
  ];

  const { value: formData } = await Swal.fire({
    title: 'Редактировать питомца',
    html: `
      <div style="text-align: left; margin: 20px 0;">
        <div style="margin-bottom: 15px;">
          <label style="display: block; margin-bottom: 5px; font-weight: 600; color: #352E2E;">Имя питомца *</label>
          <input id="pet-name" type="text" value="${pet.name || ''}" style="width: 100%; padding: 8px; border: 2px solid #636128; border-radius: 6px; font-size: 14px;" placeholder="Введите имя питомца">
        </div>
        
        <div style="margin-bottom: 15px;">
          <label style="display: block; margin-bottom: 5px; font-weight: 600; color: #352E2E;">Тип питомца *</label>
          <select id="pet-type" style="width: 100%; padding: 8px; border: 2px solid #636128; border-radius: 6px; font-size: 14px;">
            <option value="">-- выберите тип --</option>
            ${petTypes.map(type => `<option value="${type.value}" ${pet.type === type.value ? 'selected' : ''}>${type.label}</option>`).join('')}
          </select>
        </div>
        
        <div style="margin-bottom: 15px;">
          <label style="display: block; margin-bottom: 5px; font-weight: 600; color: #352E2E;">Порода</label>
          <input id="pet-breed" type="text" value="${pet.breed || ''}" style="width: 100%; padding: 8px; border: 2px solid #636128; border-radius: 6px; font-size: 14px;" placeholder="Введите породу">
        </div>
        
        <div style="margin-bottom: 15px;">
          <label style="display: block; margin-bottom: 5px; font-weight: 600; color: #352E2E;">Дата рождения *</label>
          <input id="pet-birthDate" type="date" value="${pet.birthDate || ''}" style="width: 100%; padding: 8px; border: 2px solid #636128; border-radius: 6px; font-size: 14px;">
        </div>
        
        <div style="margin-bottom: 15px;">
          <label style="display: block; margin-bottom: 5px; font-weight: 600; color: #352E2E;">Рост (см)</label>
          <input id="pet-heightCm" type="number" value="${pet.heightCm || ''}" style="width: 100%; padding: 8px; border: 2px solid #636128; border-radius: 6px; font-size: 14px;" placeholder="Введите рост">
        </div>
        
        <div style="margin-bottom: 15px;">
          <label style="display: block; margin-bottom: 5px; font-weight: 600; color: #352E2E;">Вес (кг)</label>
          <input id="pet-weightKg" type="number" value="${pet.weightKg || ''}" style="width: 100%; padding: 8px; border: 2px solid #636128; border-radius: 6px; font-size: 14px;" placeholder="Введите вес">
        </div>
        
        <div style="margin-bottom: 15px;">
          <label style="display: block; margin-bottom: 5px; font-weight: 600; color: #352E2E;">Заметки</label>
          <textarea id="pet-notes" rows="3" style="width: 100%; padding: 8px; border: 2px solid #636128; border-radius: 6px; font-size: 14px; resize: vertical;" placeholder="Дополнительная информация о питомце">${pet.notes || ''}</textarea>
        </div>
      </div>
    `,
    imageUrl: '/logo.png',
    imageWidth: 80,
    imageHeight: 80,
    imageAlt: 'Гафус',
    showCancelButton: true,
    confirmButtonText: 'Сохранить изменения',
    cancelButtonText: 'Отмена',
    confirmButtonColor: customTheme.confirmButtonColor,
    cancelButtonColor: '#F5F0E8',
    customClass: {
      popup: 'swal2-popup-custom',
      title: 'swal2-title-custom',
      htmlContainer: 'swal2-content-custom',
      confirmButton: 'swal2-confirm-custom',
      cancelButton: 'swal2-cancel-custom',
    },
    focusConfirm: false,
    preConfirm: () => {
      const name = (document.getElementById('pet-name') as HTMLInputElement)?.value?.trim();
      const type = (document.getElementById('pet-type') as HTMLSelectElement)?.value;
      const breed = (document.getElementById('pet-breed') as HTMLInputElement)?.value?.trim();
      const birthDate = (document.getElementById('pet-birthDate') as HTMLInputElement)?.value;
      const heightCm = (document.getElementById('pet-heightCm') as HTMLInputElement)?.value;
      const weightKg = (document.getElementById('pet-weightKg') as HTMLInputElement)?.value;
      const notes = (document.getElementById('pet-notes') as HTMLTextAreaElement)?.value?.trim();

      // Валидация
      if (!name) {
        Swal.showValidationMessage('Имя питомца обязательно для заполнения');
        return false;
      }
      if (!type) {
        Swal.showValidationMessage('Выберите тип питомца');
        return false;
      }
      if (!birthDate) {
        Swal.showValidationMessage('Дата рождения обязательна для заполнения');
        return false;
      }

      // Проверка даты
      const selectedDate = new Date(birthDate);
      const now = new Date();
      if (selectedDate > now) {
        Swal.showValidationMessage('Дата рождения не может быть в будущем');
        return false;
      }

      // Проверка числовых полей
      if (heightCm && (isNaN(Number(heightCm)) || Number(heightCm) < 1 || Number(heightCm) > 200)) {
        Swal.showValidationMessage('Рост должен быть числом от 1 до 200 см');
        return false;
      }
      if (weightKg && (isNaN(Number(weightKg)) || Number(weightKg) < 0.1 || Number(weightKg) > 200)) {
        Swal.showValidationMessage('Вес должен быть числом от 0.1 до 200 кг');
        return false;
      }

      return {
        ...pet,
        name,
        type,
        breed: breed || undefined,
        birthDate,
        heightCm: heightCm ? Number(heightCm) : undefined,
        weightKg: weightKg ? Number(weightKg) : undefined,
        notes: notes || undefined,
      };
    },
    allowOutsideClick: false,
  });

  return formData || null;
};
