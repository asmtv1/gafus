// UI-специфичные типы для TrainingOverview

export interface TrainingOverviewProps {
  title: string;
  description: string;
  duration: number;
}

export interface CourseDescriptionWithVideoProps {
  embedUrl?: string;
  description: string;
}
