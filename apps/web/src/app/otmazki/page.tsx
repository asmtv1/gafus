import { generatePageMetadata } from "@gafus/metadata";

import { ExcuseGeneratorClient } from "@/features/excuse-generator/ExcuseGeneratorClient";

export const metadata = generatePageMetadata({
  title: "Генератор отмазок",
  description:
    "Публичный AI-генератор убедительных и креативных отмазок для рабочих, учебных и бытовых ситуаций.",
  path: "/otmazki",
});

export default function ExcuseGeneratorPage() {
  return <ExcuseGeneratorClient />;
}
