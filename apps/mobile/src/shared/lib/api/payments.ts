import { apiClient, type ApiResponse } from "./client";

type CreatePaymentByCourseId = { courseId: string; courseType?: never; articleId?: never };
type CreatePaymentByCourseType = { courseType: string; courseId?: never; articleId?: never };
type CreatePaymentByArticleId = { articleId: string; courseId?: never; courseType?: never };
export type CreatePaymentParams =
  | CreatePaymentByCourseId
  | CreatePaymentByCourseType
  | CreatePaymentByArticleId;

export interface CreatePaymentData {
  paymentId: string;
  confirmationUrl: string;
}

export interface VerifyApplePurchaseData {
  alreadyGranted: boolean;
}

export const paymentsApi = {
  async createPayment(params: CreatePaymentParams): Promise<ApiResponse<CreatePaymentData>> {
    return apiClient<CreatePaymentData>("/api/v1/payments/create", {
      method: "POST",
      body: params,
    });
  },

  async verifyApplePurchase(transactionJws: string): Promise<ApiResponse<VerifyApplePurchaseData>> {
    return apiClient<VerifyApplePurchaseData>("/api/v1/payments/apple/verify", {
      method: "POST",
      body: { transactionJws },
    });
  },
};

