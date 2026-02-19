export interface AdminPurchaseRow {
  id: string;
  userId: string;
  courseId: string;
  amountRub: number;
  currency: string;
  status: string;
  yookassaPaymentId: string | null;
  createdAt: Date;
  updatedAt: Date;
  user: {
    username: string;
    phone: string | null;
    profile: { fullName: string | null; avatarUrl?: string | null } | null;
  };
  course: { name: string; type: string; priceRub: number | null };
}
