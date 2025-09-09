"use client";

import { useData } from "@gafus/react-query";

export default function TestAchievementsPage() {
  const { data, error, isLoading } = useData(
    "test:achievements",
    async () => {
      console.log("Fetching achievements data...");
      return { message: "Test data loaded successfully!" };
    }
  );

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (error) {
    return <div>Error: {error.message}</div>;
  }

  return (
    <div>
      <h1>Test Achievements Page</h1>
      <p>Data: {JSON.stringify(data)}</p>
    </div>
  );
}
