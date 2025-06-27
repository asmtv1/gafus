// src/components/training/TrainingOverview.tsx
interface TrainingOverviewProps {
  title: string;
  description: string;
  duration: string;
}

export function TrainingOverview({
  title,
  description,
  duration,
}: TrainingOverviewProps) {
  return (
    <div>
      <h1>{title}</h1>
      <p>{description}</p>
      <p>Общая продолжительность: {duration}</p>
    </div>
  );
}
