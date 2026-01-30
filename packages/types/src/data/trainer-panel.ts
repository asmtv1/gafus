// Данные для trainer-panel приложения

// Пользователь (минимальный набор для селекторов)
export interface TrainerUser {
  id: string;
  username: string;
}

// День (минимальный набор для селекторов и форм)
export interface TrainerDay {
  id: string;
  title: string;
}

// Данные формы курса в trainer-panel
export interface TrainerCourseFormData {
  name: string;
  shortDesc: string;
  description: string;
  duration: string;
  videoUrl: string;
  logoImg: string;
  isPublic: boolean;
  isPaid: boolean;
  priceRub: number | null;
  showInProfile: boolean;
  isPersonalized: boolean;
  trainingDays: string[];
  allowedUsers: string[];
  equipment: string;
  trainingLevel: "BEGINNER" | "INTERMEDIATE" | "ADVANCED" | "EXPERT";
}

// Результат создания платежа (API)
export interface CreatePaymentResult {
  paymentId: string;
  confirmationUrl: string;
}

// Строка для таблицы шагов (данные без UI-специфичных полей)
export interface TrainerStepTableRow {
  id: string;
  title: string;
  description: string;
  durationSec: number;
  estimatedDurationSec?: number | null;
  author?: {
    username: string;
    fullName?: string | null;
  };
  stepLinks: {
    order: number;
    day: {
      id: string;
      title: string;
      dayLinks: {
        course: {
          id: string;
          name: string;
        };
      }[];
    };
  }[];
}

// Строка для таблицы дней (данные без UI-специфичных полей)
export interface TrainerDayTableRow {
  id: string;
  title: string;
  description?: string;
  type: string;
  author?: {
    username: string;
    fullName?: string | null;
  };
  stepLinks?: { step: { id: string; title: string } }[];
  dayLinks?: { course: { id: string; name: string } }[];
}

// Элемент результатов поиска пользователя
export type UserSearchItem = TrainerUser;

// Простой элемент списка с id и title
export interface IdTitleItem {
  id: string;
  title: string;
}
