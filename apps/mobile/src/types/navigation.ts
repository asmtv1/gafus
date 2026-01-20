// Типы навигации для Expo Router

export type RootStackParamList = {
  "(auth)": undefined;
  "(main)": undefined;
};

export type AuthStackParamList = {
  login: undefined;
  register: undefined;
  "reset-password": undefined;
};

export type MainTabsParamList = {
  index: undefined;
  courses: undefined;
  achievements: undefined;
  profile: undefined;
};

export type TrainingStackParamList = {
  "[courseType]": { courseType: string };
  "[courseType]/[dayId]": { courseType: string; dayId: string };
};
