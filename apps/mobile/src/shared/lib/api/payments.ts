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

export interface AppleCourseIapMetadata {
  courseId: string;
  appleIapProductId: string | null;
  isPaid: boolean;
}

export interface VerifyAppleCoursePurchaseData {
  courseId: string;
}

export const paymentsApi = {
  async createPayment(params: CreatePaymentParams): Promise<ApiResponse<CreatePaymentData>> {
    return apiClient<CreatePaymentData>("/api/v1/payments/create", {
      method: "POST",
      body: params,
    });
  },

  async verifyAppleCoursePurchase(params: {
    signedTransactionInfo: string;
  }): Promise<ApiResponse<VerifyAppleCoursePurchaseData>> {
    return apiClient<VerifyAppleCoursePurchaseData>("/api/v1/payments/apple/verify", {
      method: "POST",
      body: params,
    });
  },

  async getAppleCourseIapMetadata(params: {
    courseId?: string;
    courseType?: string;
  }): Promise<ApiResponse<AppleCourseIapMetadata>> {
    const query = params.courseId
      ? `courseId=${encodeURIComponent(params.courseId)}`
      : `courseType=${encodeURIComponent(params.courseType ?? "")}`;
    return apiClient<AppleCourseIapMetadata>(`/api/v1/payments/apple/course-metadata?${query}`);
  },
};

