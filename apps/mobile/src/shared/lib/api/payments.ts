import { apiClient, type ApiResponse } from "./client";

type CreatePaymentByCourseId = { courseId: string; courseType?: never };
type CreatePaymentByCourseType = { courseType: string; courseId?: never };
export type CreatePaymentParams = CreatePaymentByCourseId | CreatePaymentByCourseType;

export interface CreatePaymentData {
  paymentId: string;
  confirmationUrl: string;
}

export const paymentsApi = {
  async createPayment(params: CreatePaymentParams): Promise<ApiResponse<CreatePaymentData>> {
    return apiClient<CreatePaymentData>("/api/v1/payments/create", {
      method: "POST",
      body: params,
    });
  },
};

