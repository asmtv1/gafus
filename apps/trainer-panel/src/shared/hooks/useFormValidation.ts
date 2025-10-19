// Предустановленные правила валидации для trainer-panel
export const commonValidationRules = {
  required: (message = "Это поле обязательно") => ({ required: message }),

  title: {
    required: "Название обязательно",
    minLength: { value: 3, message: "Минимум 3 символа" },
    maxLength: { value: 100, message: "Максимум 100 символов" },
    pattern: {
      value: /^[а-яёА-ЯЁa-zA-Z0-9\s\-–—_.,!?()]+$/,
      message: "Недопустимые символы в названии",
    },
  },

  description: {
    required: "Описание обязательно",
    minLength: { value: 10, message: "Минимум 10 символов" },
    maxLength: { value: 2000, message: "Максимум 2000 символов" },
  },

  shortDescription: {
    required: "Краткое описание обязательно",
    minLength: { value: 10, message: "Минимум 10 символов" },
    maxLength: { value: 500, message: "Максимум 500 символов" },
  },

  duration: {
    required: "Длительность обязательна",
    validate: (value: unknown) => {
      if (!value) return "Введите длительность";
      const num = parseInt(String(value));
      if (isNaN(num) || num <= 0) return "Длительность должна быть положительным числом";
      if (num > 1000) return "Длительность не может быть больше 1000";
      return true;
    },
  },

  videoUrl: {
    validate: (value: unknown) => {
      if (!value) return true; // Необязательное поле
      const urlPattern = /^https?:\/\/(www\.)?(youtube\.com|youtu\.be|rutube\.ru|vimeo\.com)\/.+/;
      return urlPattern.test(String(value)) || "Неверный формат ссылки на видео";
    },
  },

  imageUrl: {
    required: "Изображение обязательно",
    validate: (value: unknown) => {
      if (!value) return "Выберите изображение";
      return true;
    },
  },

  logoImg: {
    required: "Логотип курса обязателен",
    validate: (value: unknown) => {
      if (!value || String(value).trim() === "") return "Загрузите логотип курса";
      return true;
    },
  },

  courseName: {
    required: "Название курса обязательно",
    minLength: { value: 3, message: "Минимум 3 символа" },
    maxLength: { value: 100, message: "Максимум 100 символов" },
    pattern: {
      value: /^[а-яёА-ЯЁa-zA-Z0-9\s\-–—_.,!?()]+$/,
      message: "Недопустимые символы в названии курса",
    },
  },

  courseDuration: {
    required: "Продолжительность курса обязательна",
    validate: (value: unknown) => {
      if (!value) return "Введите продолжительность курса";
      const strValue = String(value);
      if (strValue.length < 3) return "Минимум 3 символа";
      if (strValue.length > 50) return "Максимум 50 символов";
      return true;
    },
  },

  dayTitle: {
    required: "Название дня обязательно",
    minLength: { value: 3, message: "Минимум 3 символа" },
    maxLength: { value: 100, message: "Максимум 100 символов" },
  },

  dayType: {
    required: "Тип дня обязателен",
    validate: (value: unknown) => {
      const validTypes = ["regular", "introduction", "test", "rest"];
      return validTypes.includes(String(value)) || "Выберите корректный тип дня";
    },
  },

  stepTitle: {
    required: "Название шага обязательно",
    minLength: { value: 3, message: "Минимум 3 символа" },
    maxLength: { value: 200, message: "Максимум 200 символов" },
  },

  stepDescription: {
    required: "Описание шага обязательно",
    minLength: { value: 10, message: "Минимум 10 символов" },
    maxLength: { value: 2000, message: "Максимум 2000 символов" },
  },

  stepDuration: {
    required: "Длительность шага обязательна",
    validate: (value: unknown) => {
      if (!value) return "Введите длительность шага";
      const num = parseInt(String(value));
      if (isNaN(num) || num <= 0) return "Длительность должна быть положительным числом";
      if (num > 1000) return "Длительность не может быть больше 1000";
      return true;
    },
  },

  stepOrder: {
    required: "Порядок шага обязателен",
    validate: (value: unknown) => {
      if (!value) return "Введите порядок шага";
      const num = parseInt(String(value));
      if (isNaN(num) || num <= 0) return "Порядок должен быть положительным числом";
      return true;
    },
  },

  username: {
    required: "Имя пользователя обязательно",
    minLength: { value: 3, message: "Минимум 3 символа" },
    maxLength: { value: 50, message: "Максимум 50 символов" },
    pattern: {
      value: /^[a-zA-Z0-9_-]+$/,
      message: "Имя пользователя может содержать только буквы, цифры, дефис и подчеркивание",
    },
  },

  email: {
    required: "Email обязателен",
    pattern: {
      value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
      message: "Введите корректный email адрес",
    },
  },

  password: {
    required: "Пароль обязателен",
    minLength: { value: 6, message: "Минимум 6 символов" },
    pattern: {
      value: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
      message:
        "Пароль должен содержать минимум одну строчную букву, одну заглавную букву и одну цифру",
    },
  },
};
