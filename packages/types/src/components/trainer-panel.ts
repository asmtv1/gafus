// Специфичные типы для приложения trainer-panel

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

// Данные формы курса в trainer-panel (отличается от общего CourseFormData)
export interface TrainerCourseFormData {
  name: string;
  shortDesc: string;
  description: string;
  duration: string;
  videoUrl: string;
  logoImg: string;
  isPublic: boolean;
  trainingDays: string[];
  allowedUsers: string[];
  equipment: string;
  trainingLevel: "BEGINNER" | "INTERMEDIATE" | "ADVANCED" | "EXPERT";
}

// Строка для таблицы шагов (UI-ориентированная проекция)
export interface TrainerStepTableRow {
  id: string;
  title: string;
  description: string;
  durationSec: number;
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

// Строка для таблицы дней (UI-ориентированная проекция)
export interface TrainerDayTableRow {
  id: string;
  title: string;
  description?: string;
  type: string;
  stepLinks?: { step: { id: string; title: string } }[];
  dayLinks?: { course: { id: string; name: string } }[];
}

// Элемент результатов поиска пользователя
export type UserSearchItem = TrainerUser;

// Простой элемент списка с id и title (для DualListSelector и т.п.)
export interface IdTitleItem {
  id: string;
  title: string;
}
