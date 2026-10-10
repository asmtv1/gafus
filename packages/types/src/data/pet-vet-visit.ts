export const VET_VISIT_MAX_ATTACHMENTS = 5;
export const VET_VISIT_MAX_FILE_BYTES = 10 * 1024 * 1024;
export const VET_VISIT_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
] as const;

export interface PetVetVisitInput {
  visitedOn: string;
  specialty: string;
  doctorName: string;
  clinic: string;
  diagnosis: string;
  conclusion: string;
  notes: string;
}

export interface PetVetAttachment {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  hasPreview: boolean;
}

export interface PetVetVisit extends PetVetVisitInput {
  id: string;
  petId: string;
  attachments: PetVetAttachment[];
}

export const vetVisitToday = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

export const emptyVetVisit = (): PetVetVisitInput => ({
  visitedOn: vetVisitToday(),
  specialty: "",
  doctorName: "",
  clinic: "",
  diagnosis: "",
  conclusion: "",
  notes: "",
});

export const vetVisitDateLabel = (date: string) =>
  new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" }).format(
    new Date(`${date}T12:00:00`),
  );
