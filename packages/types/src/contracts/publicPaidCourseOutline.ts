/** Public marketing metadata only; never a lesson body or media link. */
export type PublicOutlineDay = {
  id: string;
  title: string;
  order: number;
  type: string;
  equipment: string;
  estimatedDuration: number;
  theoryMinutes: number;
};

export type PublicPaidCourseOutline = {
  courseId: string;
  courseType: string;
  name: string;
  description: string | null;
  equipment: string | null;
  trainingLevel: string | null;
  outline: PublicOutlineDay[];
};

/** Some older responses omit day metadata, not identity or title. */
export type LegacyPublicPaidCourseOutline = Omit<PublicPaidCourseOutline, "outline"> & {
  outline: (Pick<PublicOutlineDay, "id" | "title" | "order"> &
    Partial<Omit<PublicOutlineDay, "id" | "title" | "order">>)[];
};
