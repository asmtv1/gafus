"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";
import {
  prepareConsultationCall,
  createConsultationCallAdmission,
  signConsultationOneTimeKey,
  ConsultationForbiddenError,
  ConsultationNotFoundError,
  ConsultationVideoUnavailableError,
} from "@gafus/core";

function mapError(error: unknown): string {
  if (error instanceof ConsultationForbiddenError || error instanceof ConsultationNotFoundError ||
      error instanceof ConsultationVideoUnavailableError) return error.message;
  return "Не удалось подключить видеосвязь";
}

export async function prepareConsultationCallAction(bookingId: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return { success: false as const, error: "Необходима авторизация" };
  try {
    const data = await prepareConsultationCall(bookingId, session.user.id);
    return { success: true as const, data };
  } catch (error) {
    return { success: false as const, error: mapError(error) };
  }
}

export async function signConsultationKeyAction(bookingId: string, key: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return { success: false as const, error: "Необходима авторизация" };
  try {
    const token = await signConsultationOneTimeKey(bookingId, session.user.id, key);
    return { success: true as const, token };
  } catch (error) {
    return { success: false as const, error: mapError(error) };
  }
}

export async function createConsultationCallAdmissionAction(bookingId: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return { success: false as const, error: "Необходима авторизация" };
  try {
    const data = await createConsultationCallAdmission(bookingId, session.user.id);
    return { success: true as const, data };
  } catch (error) {
    return { success: false as const, error: mapError(error) };
  }
}
