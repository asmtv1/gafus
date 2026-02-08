import Swal from "sweetalert2";
import type { PetFormData } from "@gafus/types";

/** Экранирование для подстановки в HTML (value="...") — защита от XSS */
function escapeHtml(s: string): string {
  if (typeof s !== "string") return "";
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Настройки темы под ваш дизайн
const customTheme = {
  confirmButtonColor: "#FFF8E5",
  cancelButtonColor: "#FFF8E5",
  confirmButtonTextColor: "#ECE5D2",
  cancelButtonTextColor: "#636128",
};

// Стилизованное уведомление о незавершенном курсе
export const showCourseRatingAlert = () => {
  return Swal.fire({
    title: "Курс не завершен",
    text: "Завершите курс, чтобы поставить рейтинг",
    imageUrl: "/uploads/logo.png",
    imageWidth: 160,
    imageHeight: 160,
    imageAlt: "Гафус",
    confirmButtonText: "окай :(",
    confirmButtonColor: customTheme.cancelButtonColor,
    customClass: {
      popup: "swal2-popup-custom",
      title: "swal2-title-custom",
      htmlContainer: "swal2-content-custom",
      confirmButton: "swal2-confirm-custom",
    },
    timer: 3000,
  });
};

// Стилизованное уведомление об ошибке
export const showErrorAlert = (message: string) => {
  return Swal.fire({
    title: "Ошибка",
    text: message,
    imageUrl: "/uploads/logo.png",
    imageWidth: 50,
    imageHeight: 50,
    imageAlt: "Гафус",
    confirmButtonText: "Понятно",
    confirmButtonColor: customTheme.cancelButtonColor,
    customClass: {
      popup: "swal2-popup-custom",
      title: "swal2-title-custom",
      htmlContainer: "swal2-content-custom",
      confirmButton: "swal2-confirm-custom",
    },
  });
};

// Стилизованное уведомление об успехе
export const showSuccessAlert = (message: string) => {
  return Swal.fire({
    title: "Успешно",
    text: message,
    imageUrl: "/uploads/logo.png",
    imageWidth: 160,
    imageHeight: 160,
    imageAlt: "Гафус",
    confirmButtonText: "Отлично",
    confirmButtonColor: customTheme.cancelButtonColor,
    customClass: {
      popup: "swal2-popup-custom",
      title: "swal2-title-custom",
      htmlContainer: "swal2-content-custom",
      confirmButton: "swal2-confirm-custom",
    },
    timer: 2000,
  });
};

// Стилизованный диалог подтверждения
export const showConfirmDialog = async (title: string, text: string): Promise<boolean> => {
  const result = await Swal.fire({
    title,
    text,
    imageUrl: "/uploads/logo.png",
    imageWidth: 160,
    imageHeight: 160,
    imageAlt: "Гафус",
    showCancelButton: true,
    confirmButtonText: "Да",
    cancelButtonText: "Отмена",
    confirmButtonColor: customTheme.cancelButtonColor,
    cancelButtonColor: "#d32f2f",
    customClass: {
      popup: "swal2-popup-custom",
      title: "swal2-title-custom",
      htmlContainer: "swal2-content-custom",
      confirmButton: "swal2-confirm-custom",
      cancelButton: "swal2-cancel-custom",
    },
  });
  return result.isConfirmed;
};

/** Диалог «Курс платный»: Оплатить | Закрыть. При «Оплатить» — onPay, при «Закрыть» — onClose (если передан). */
export const showPaidCourseAccessAlert = async (
  course: { name: string; priceRub: number },
  onPay: () => void,
  onClose?: () => void,
): Promise<void> => {
  const result = await Swal.fire({
    title: "Курс платный",
    text:
      `Оплатите «${course.name}» для доступа к занятиям.` +
      (course.priceRub > 0 ? ` Стоимость: ${course.priceRub} ₽.` : ""),
    imageUrl: "/uploads/logo.png",
    imageWidth: 80,
    imageHeight: 80,
    imageAlt: "Гафус",
    showCancelButton: true,
    confirmButtonText: "Оплатить",
    cancelButtonText: "Закрыть",
    confirmButtonColor: customTheme.confirmButtonColor,
    cancelButtonColor: customTheme.cancelButtonColor,
    customClass: {
      popup: "swal2-popup-custom",
      title: "swal2-title-custom",
      htmlContainer: "swal2-content-custom",
      confirmButton: "swal2-confirm-custom",
      cancelButton: "swal2-cancel-custom",
    },
  });
  if (result.isConfirmed) {
    onPay();
  } else if (result.dismiss === "cancel" && onClose) {
    onClose();
  }
};

// Стилизованный запрос разрешения на уведомления
export const showNotificationPermissionAlert = (
  onAllow: () => void,
  onDeny: () => void,
  isLoading: boolean = false,
  error: string | null = null,
) => {
  return Swal.fire({
    title: "Включить уведомления?",
    text:
      "Включите уведомления, чтобы получать оповещения о завершении упражнения\n" +
      "А так же для работы приложения без интернета.\n" +
      "Отключить уведомления можно в настройках профиля.",
    imageUrl: "/uploads/logo.png",
    imageWidth: 160,
    imageHeight: 160,
    imageAlt: "Гафус",
    showCancelButton: true,
    confirmButtonText: isLoading ? "Загрузка..." : "Включить",
    cancelButtonText: "Не сейчас",
    confirmButtonColor: customTheme.confirmButtonColor,
    cancelButtonColor: customTheme.cancelButtonColor,
    customClass: {
      popup: "swal2-popup-custom",
      title: "swal2-title-custom",
      htmlContainer: "swal2-content-custom",
      confirmButton: "swal2-confirm-custom",
      cancelButton: "swal2-cancel-custom",
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
      Swal.showLoading();
      Swal.disableButtons();

      try {
        await onAllow();
        Swal.close();
      } catch (error) {
        Swal.hideLoading();
        Swal.enableButtons();

        const errorMessage =
          error instanceof Error ? error.message : "Произошла ошибка при включении уведомлений";

        Swal.showValidationMessage(errorMessage);
      }
    } else if (result.dismiss === "cancel") {
      try {
        await onDeny();
        Swal.close();
      } catch (error) {
        Swal.close();
      }
    }
  });
};

// Диалог с инструкцией по установке PWA для iOS
export const showInstallPWAAlert = () => {
  return Swal.fire({
    title: "Установите приложение",
    html: `
      <div style="text-align: left; margin: 20px 0;">
        <p style="margin-bottom: 15px;">Для получения уведомлений на iOS необходимо установить приложение на главный экран:</p>
        <ol style="margin: 15px 0; padding-left: 25px; line-height: 1.8;">
          <li>Нажмите кнопку "Поделиться" <span style="font-size: 20px;">📤</span> внизу экрана</li>
          <li>Прокрутите вниз и выберите "На экран Домой"</li>
          <li>Нажмите "Добавить"</li>
          <li>Откройте приложение с главного экрана</li>
        </ol>
        <p style="color: #666; font-size: 14px; margin-top: 15px;">После установки вы сможете включить уведомления в настройках профиля.</p>
      </div>
    `,
    imageUrl: "/uploads/logo.png",
    imageWidth: 120,
    imageHeight: 120,
    imageAlt: "Гафус",
    confirmButtonText: "Окей",
    confirmButtonColor: customTheme.confirmButtonColor,
    customClass: {
      popup: "swal2-popup-custom",
      title: "swal2-title-custom",
      htmlContainer: "swal2-content-custom",
      confirmButton: "swal2-confirm-custom",
    },
    allowOutsideClick: true,
    allowEscapeKey: true,
  });
};

// Модальное окно редактирования питомца
export const showEditPetAlert = async (pet: PetFormData): Promise<PetFormData | null> => {
  const petTypes = [
    { label: "Собака", value: "DOG" },
    { label: "Кошка", value: "CAT" },
  ];

  const { value: formData } = await Swal.fire({
    title: "Редактировать питомца",
    html: `
      <div style="text-align: left; margin: 20px 0;">
        <div style="margin-bottom: 15px;">
          <label style="display: block; margin-bottom: 5px; font-weight: 600; color: #352E2E;">Имя питомца *</label>
          <input id="pet-name" type="text" value="${escapeHtml(String(pet.name ?? ""))}" style="width: 100%; padding: 8px; border: 2px solid #636128; border-radius: 6px; font-size: 14px;" placeholder="Введите имя питомца">
        </div>
        
        <div style="margin-bottom: 15px;">
          <label style="display: block; margin-bottom: 5px; font-weight: 600; color: #352E2E;">Тип питомца *</label>
          <select id="pet-type" style="width: 100%; padding: 8px; border: 2px solid #636128; border-radius: 6px; font-size: 14px;">
            <option value="">-- выберите тип --</option>
            ${petTypes.map((type) => `<option value="${type.value}" ${pet.type === type.value ? "selected" : ""}>${type.label}</option>`).join("")}
          </select>
        </div>
        
        <div style="margin-bottom: 15px;">
          <label style="display: block; margin-bottom: 5px; font-weight: 600; color: #352E2E;">Порода</label>
          <input id="pet-breed" type="text" value="${escapeHtml(String(pet.breed ?? ""))}" style="width: 100%; padding: 8px; border: 2px solid #636128; border-radius: 6px; font-size: 14px;" placeholder="Введите породу">
        </div>
        
        <div style="margin-bottom: 15px;">
          <label style="display: block; margin-bottom: 5px; font-weight: 600; color: #352E2E;">Дата рождения *</label>
          <input id="pet-birthDate" type="date" value="${escapeHtml(String(pet.birthDate ?? ""))}" style="width: 100%; padding: 8px; border: 2px solid #636128; border-radius: 6px; font-size: 14px;">
        </div>
        
        <div style="margin-bottom: 15px;">
          <label style="display: block; margin-bottom: 5px; font-weight: 600; color: #352E2E;">Рост (см)</label>
          <input id="pet-heightCm" type="number" value="${escapeHtml(String(pet.heightCm ?? ""))}" style="width: 100%; padding: 8px; border: 2px solid #636128; border-radius: 6px; font-size: 14px;" placeholder="Введите рост">
        </div>
        
        <div style="margin-bottom: 15px;">
          <label style="display: block; margin-bottom: 5px; font-weight: 600; color: #352E2E;">Вес (кг)</label>
          <input id="pet-weightKg" type="number" value="${escapeHtml(String(pet.weightKg ?? ""))}" style="width: 100%; padding: 8px; border: 2px solid #636128; border-radius: 6px; font-size: 14px;" placeholder="Введите вес">
        </div>
        
        <div style="margin-bottom: 15px;">
          <label style="display: block; margin-bottom: 5px; font-weight: 600; color: #352E2E;">Заметки</label>
          <textarea id="pet-notes" rows="3" style="width: 100%; padding: 8px; border: 2px solid #636128; border-radius: 6px; font-size: 14px; resize: vertical;" placeholder="Дополнительная информация о питомце">${escapeHtml(String(pet.notes ?? ""))}</textarea>
        </div>
      </div>
    `,
    imageUrl: "/uploads/logo.png",
    imageWidth: 80,
    imageHeight: 80,
    imageAlt: "Гафус",
    showCancelButton: true,
    confirmButtonText: "Сохранить изменения",
    cancelButtonText: "Отмена",
    confirmButtonColor: customTheme.confirmButtonColor,
    cancelButtonColor: "#F5F0E8",
    customClass: {
      popup: "swal2-popup-custom",
      title: "swal2-title-custom",
      htmlContainer: "swal2-content-custom",
      confirmButton: "swal2-confirm-custom",
      cancelButton: "swal2-cancel-custom",
    },
    focusConfirm: false,
    preConfirm: () => {
      const name = (document.getElementById("pet-name") as HTMLInputElement)?.value?.trim();
      const type = (document.getElementById("pet-type") as HTMLSelectElement)?.value;
      const breed = (document.getElementById("pet-breed") as HTMLInputElement)?.value?.trim();
      const birthDate = (document.getElementById("pet-birthDate") as HTMLInputElement)?.value;
      const heightCm = (document.getElementById("pet-heightCm") as HTMLInputElement)?.value;
      const weightKg = (document.getElementById("pet-weightKg") as HTMLInputElement)?.value;
      const notes = (document.getElementById("pet-notes") as HTMLTextAreaElement)?.value?.trim();

      // Валидация
      if (!name) {
        Swal.showValidationMessage("Имя питомца обязательно для заполнения");
        return false;
      }
      if (!type) {
        Swal.showValidationMessage("Выберите тип питомца");
        return false;
      }
      if (!birthDate) {
        Swal.showValidationMessage("Дата рождения обязательна для заполнения");
        return false;
      }

      // Проверка даты
      const selectedDate = new Date(birthDate);
      const now = new Date();
      if (selectedDate > now) {
        Swal.showValidationMessage("Дата рождения не может быть в будущем");
        return false;
      }

      // Проверка числовых полей
      if (heightCm && (isNaN(Number(heightCm)) || Number(heightCm) < 1 || Number(heightCm) > 200)) {
        Swal.showValidationMessage("Рост должен быть числом от 1 до 200 см");
        return false;
      }
      if (
        weightKg &&
        (isNaN(Number(weightKg)) || Number(weightKg) < 0.1 || Number(weightKg) > 200)
      ) {
        Swal.showValidationMessage("Вес должен быть числом от 0.1 до 200 кг");
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

/** Данные формы персонализации курса */
export interface PersonalizationFormData {
  userDisplayName: string;
  userGender: "male" | "female";
  petName: string;
  petGender?: "male" | "female" | null;
  petNameGen?: string | null;
  petNameDat?: string | null;
  petNameAcc?: string | null;
  petNameIns?: string | null;
  petNamePre?: string | null;
}

/** Опции для показа формы персонализации */
export interface ShowPersonalizationAlertOptions {
  initialValues?: PersonalizationFormData | null;
  getDeclinedName: (
    name: string,
    gender?: "male" | "female",
  ) => Promise<{
    genitive: string;
    dative: string;
    accusative: string;
    instrumental: string;
    prepositional: string;
  }>;
}

/** Форма персонализации курса (имя, пол, имя питомца, склонения). При отмене возвращает null. */
export const showPersonalizationAlert = async (
  options: ShowPersonalizationAlertOptions,
): Promise<PersonalizationFormData | null> => {
  const { initialValues, getDeclinedName } = options;
  const u = initialValues?.userDisplayName ?? "";
  const g = initialValues?.userGender ?? "male";
  const p = initialValues?.petName ?? "";
  const pGender = initialValues?.petGender ?? "";
  const pGen = initialValues?.petNameGen ?? "";
  const pDat = initialValues?.petNameDat ?? "";
  const pAcc = initialValues?.petNameAcc ?? "";
  const pIns = initialValues?.petNameIns ?? "";
  const pPre = initialValues?.petNamePre ?? "";

  const html = `
    <div style="text-align: left; margin: 20px 0;">
      <div class="swal-personalization-intro" style="margin-bottom: 16px; padding: 14px 16px; background: #EBE8E0; border-radius: 10px; font-size: 14px; color: #505050; line-height: 1.55; text-align: center; font-family: inherit; box-shadow: 0 1px 3px rgba(0,0,0,0.08);">
        Эта информация нужна для вашего полного погружения в курс. Пожалуйста, не пишите выдуманные вещи, чтобы не портить себе впечатление от курса.
      </div>
      <div style="margin-bottom: 15px;">
        <label style="display: block; margin-bottom: 5px; font-weight: 600; color: #352E2E;">Ваше имя *</label>
        <input id="personalization-userName" type="text" value="${escapeHtml(u)}" style="width: 100%; padding: 8px; border: 2px solid #636128; border-radius: 6px; font-size: 14px;" placeholder="Как к вам обращаться">
      </div>
      <div style="margin-bottom: 15px;">
        <label style="display: block; margin-bottom: 5px; font-weight: 600; color: #352E2E;">Пол *</label>
        <select id="personalization-userGender" style="width: 100%; padding: 8px; border: 2px solid #636128; border-radius: 6px; font-size: 14px;">
          <option value="male" ${g === "male" ? "selected" : ""}>Мужской</option>
          <option value="female" ${g === "female" ? "selected" : ""}>Женский</option>
        </select>
      </div>
      <div style="margin-bottom: 15px;">
        <label style="display: block; margin-bottom: 5px; font-weight: 600; color: #352E2E;">Имя питомца *</label>
        <input id="personalization-petName" type="text" value="${escapeHtml(p)}" style="width: 100%; padding: 8px; border: 2px solid #636128; border-radius: 6px; font-size: 14px;" placeholder="Кличка питомца">
      </div>
      <div style="margin-bottom: 15px;">
        <label style="display: block; margin-bottom: 5px; font-weight: 600; color: #352E2E;">Пол питомца</label>
        <select id="personalization-petGender" style="width: 100%; padding: 8px; border: 2px solid #636128; border-radius: 6px; font-size: 14px;">
          <option value="" ${pGender === "" ? "selected" : ""}>Не указан</option>
          <option value="male" ${pGender === "male" ? "selected" : ""}>Мужской</option>
          <option value="female" ${pGender === "female" ? "selected" : ""}>Женский</option>
        </select>
        <span style="font-size: 12px; color: #666;">Нужен для правильного склонения клички</span>
      </div>
      <div style="margin-bottom: 15px;">
        <label style="display: block; margin-bottom: 5px; font-weight: 600; color: #352E2E;">Родительный (кого? — нет кого)</label>
        <input id="personalization-petNameGen" type="text" value="${escapeHtml(pGen)}" style="width: 100%; padding: 8px; border: 2px solid #636128; border-radius: 6px; font-size: 14px;" placeholder="Например: Барсика">
      </div>
      <div style="margin-bottom: 15px;">
        <label style="display: block; margin-bottom: 5px; font-weight: 600; color: #352E2E;">Дательный (кому?)</label>
        <input id="personalization-petNameDat" type="text" value="${escapeHtml(pDat)}" style="width: 100%; padding: 8px; border: 2px solid #636128; border-radius: 6px; font-size: 14px;" placeholder="Например: Барсику">
      </div>
      <div style="margin-bottom: 15px;">
        <label style="display: block; margin-bottom: 5px; font-weight: 600; color: #352E2E;">Винительный (кого? — вижу кого)</label>
        <input id="personalization-petNameAcc" type="text" value="${escapeHtml(pAcc)}" style="width: 100%; padding: 8px; border: 2px solid #636128; border-radius: 6px; font-size: 14px;" placeholder="Например: Барсика">
      </div>
      <div style="margin-bottom: 15px;">
        <label style="display: block; margin-bottom: 5px; font-weight: 600; color: #352E2E;">Творительный (кем?)</label>
        <input id="personalization-petNameIns" type="text" value="${escapeHtml(pIns)}" style="width: 100%; padding: 8px; border: 2px solid #636128; border-radius: 6px; font-size: 14px;" placeholder="Например: Барсиком">
      </div>
      <div style="margin-bottom: 15px;">
        <label style="display: block; margin-bottom: 5px; font-weight: 600; color: #352E2E;">Предложный (о ком?)</label>
        <input id="personalization-petNamePre" type="text" value="${escapeHtml(pPre)}" style="width: 100%; padding: 8px; border: 2px solid #636128; border-radius: 6px; font-size: 14px;" placeholder="Например: о Барсике">
      </div>
      <div style="margin-bottom: 15px;">
        <button type="button" id="personalization-fill-declensions" style="padding: 8px 16px; background: #636128; color: #FFF8E5; border: none; border-radius: 6px; font-size: 13px; cursor: pointer;">Подставить склонения</button>
      </div>
    </div>
  `;

  const fillDeclensions = async () => {
    const petNameEl = document.getElementById("personalization-petName") as HTMLInputElement | null;
    const petGenderEl = document.getElementById("personalization-petGender") as HTMLSelectElement | null;
    const genEl = document.getElementById("personalization-petNameGen") as HTMLInputElement | null;
    const datEl = document.getElementById("personalization-petNameDat") as HTMLInputElement | null;
    const accEl = document.getElementById("personalization-petNameAcc") as HTMLInputElement | null;
    const insEl = document.getElementById("personalization-petNameIns") as HTMLInputElement | null;
    const preEl = document.getElementById("personalization-petNamePre") as HTMLInputElement | null;
    const petName = petNameEl?.value?.trim();
    if (!petName || !genEl || !datEl || !accEl || !insEl || !preEl) return;
    try {
      const petGenderVal = petGenderEl?.value;
      const gender =
        petGenderVal === "female" || petGenderVal === "male"
          ? (petGenderVal as "male" | "female")
          : undefined;
      const { genitive, dative, accusative, instrumental, prepositional } =
        await getDeclinedName(petName, gender);
      genEl.value = genitive;
      datEl.value = dative;
      accEl.value = accusative;
      insEl.value = instrumental;
      preEl.value = prepositional;
    } catch (_) {
      // ignore
    }
  };

  const { value: formData, isConfirmed } = await Swal.fire({
    title: "Персонализация курса",
    html,
    imageUrl: "/uploads/logo.png",
    imageWidth: 80,
    imageHeight: 80,
    imageAlt: "Гафус",
    showCancelButton: true,
    confirmButtonText: "Сохранить",
    cancelButtonText: "Отмена",
    confirmButtonColor: customTheme.confirmButtonColor,
    cancelButtonColor: "#F5F0E8",
    customClass: {
      popup: "swal2-popup-custom",
      title: "swal2-title-custom",
      htmlContainer: "swal2-content-custom",
      confirmButton: "swal2-confirm-custom",
      cancelButton: "swal2-cancel-custom",
    },
    focusConfirm: false,
    allowOutsideClick: false,
    didOpen: () => {
      const petNameEl = document.getElementById("personalization-petName");
      const btn = document.getElementById("personalization-fill-declensions");
      petNameEl?.addEventListener("blur", () => void fillDeclensions());
      btn?.addEventListener("click", () => void fillDeclensions());
    },
    preConfirm: () => {
      const userName = (document.getElementById("personalization-userName") as HTMLInputElement)?.value?.trim();
      const userGender = (document.getElementById("personalization-userGender") as HTMLSelectElement)?.value as string;
      const petName = (document.getElementById("personalization-petName") as HTMLInputElement)?.value?.trim();
      const petGenderEl = document.getElementById("personalization-petGender") as HTMLSelectElement | null;
      const petGender =
        petGenderEl?.value === "male" || petGenderEl?.value === "female"
          ? (petGenderEl.value as "male" | "female")
          : null;
      const petNameGen = (document.getElementById("personalization-petNameGen") as HTMLInputElement)?.value?.trim() || undefined;
      const petNameDat = (document.getElementById("personalization-petNameDat") as HTMLInputElement)?.value?.trim() || undefined;
      const petNameAcc = (document.getElementById("personalization-petNameAcc") as HTMLInputElement)?.value?.trim() || undefined;
      const petNameIns = (document.getElementById("personalization-petNameIns") as HTMLInputElement)?.value?.trim() || undefined;
      const petNamePre = (document.getElementById("personalization-petNamePre") as HTMLInputElement)?.value?.trim() || undefined;
      if (!userName) {
        Swal.showValidationMessage("Укажите ваше имя");
        return false;
      }
      if (userGender !== "male" && userGender !== "female") {
        Swal.showValidationMessage("Выберите пол");
        return false;
      }
      if (!petName) {
        Swal.showValidationMessage("Укажите имя питомца");
        return false;
      }
      return {
        userDisplayName: userName,
        userGender: userGender as "male" | "female",
        petName,
        petGender,
        petNameGen: petNameGen || null,
        petNameDat: petNameDat || null,
        petNameAcc: petNameAcc || null,
        petNameIns: petNameIns || null,
        petNamePre: petNamePre || null,
      };
    },
  });

  if (!isConfirmed) return null;
  return formData as PersonalizationFormData;
};

// Сообщение о заблокированном дне "Подведение итогов"
export const showLockedDayAlert = () => {
  return Swal.fire({
    title: "День заблокирован 🔒",
    text: "Чтобы открыть этот день, необходимо завершить все остальные дни курса. Продолжайте тренировки, и этот день станет доступен автоматически!",
    imageUrl: "/uploads/logo.png",
    imageWidth: 100,
    imageHeight: 100,
    imageAlt: "Гафус",
    confirmButtonText: "Понятно",
    confirmButtonColor: customTheme.cancelButtonColor,
    customClass: {
      popup: "swal2-popup-custom",
      title: "swal2-title-custom",
      htmlContainer: "swal2-content-custom",
      confirmButton: "swal2-confirm-custom",
    },
  });
};

// Сообщение о недоступном приватном курсе
export const showPrivateCourseAccessDeniedAlert = () => {
  return Swal.fire({
    title: "Курс недоступен 🔒",
    text: "Этот курс приватный и доступен только по приглашению. Обратитесь к кинологу для получения доступа.",
    imageUrl: "/uploads/logo.png",
    imageWidth: 100,
    imageHeight: 100,
    imageAlt: "Гафус",
    confirmButtonText: "Понятно",
    confirmButtonColor: customTheme.cancelButtonColor,
    customClass: {
      popup: "swal2-popup-custom",
      title: "swal2-title-custom",
      htmlContainer: "swal2-content-custom",
      confirmButton: "swal2-confirm-custom",
    },
  }).then(() => {
    // После закрытия alert делаем редирект на список курсов (убираем параметры)
    window.location.href = "/courses";
  });
};
