import { apiClient, type ApiResponse } from "./client";

export interface Reminder {
  id: string;
  name: string;
  enabled: boolean;
  reminderTime: string;
  reminderDays: string | null;
  timezone: string;
}

export interface ReminderPayload {
  name: string;
  reminderTime: string;
  reminderDays?: string | null;
  timezone?: string;
}

export interface ReminderUpdatePayload {
  name?: string;
  enabled?: boolean;
  reminderTime?: string;
  reminderDays?: string | null;
  timezone?: string;
}

export const remindersApi = {
  getAll: async (requestGuard?: () => boolean): Promise<ApiResponse<Reminder[]>> => {
    return apiClient<Reminder[]>("/api/v1/reminders", {
      ...(requestGuard ? { requestGuard } : {}),
    });
  },
  create: async (
    payload: ReminderPayload,
    requestGuard?: () => boolean,
  ): Promise<ApiResponse<Reminder>> => {
    return apiClient<Reminder>("/api/v1/reminders", {
      method: "POST",
      body: payload,
      skipAuthRefreshReplay: true,
      ...(requestGuard ? { requestGuard } : {}),
    });
  },
  update: async (
    id: string,
    payload: ReminderUpdatePayload,
    requestGuard?: () => boolean,
  ): Promise<ApiResponse<Reminder>> => {
    return apiClient<Reminder>(`/api/v1/reminders/${id}`, {
      method: "PUT",
      body: payload,
      skipAuthRefreshReplay: true,
      ...(requestGuard ? { requestGuard } : {}),
    });
  },
  remove: async (id: string, requestGuard?: () => boolean): Promise<ApiResponse<void>> => {
    return apiClient<void>(`/api/v1/reminders/${id}`, {
      method: "DELETE",
      skipAuthRefreshReplay: true,
      ...(requestGuard ? { requestGuard } : {}),
    });
  },
};
