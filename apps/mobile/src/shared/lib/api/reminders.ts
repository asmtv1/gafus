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
  getAll: async (): Promise<ApiResponse<Reminder[]>> => {
    return apiClient<Reminder[]>("/api/v1/reminders");
  },
  create: async (payload: ReminderPayload): Promise<ApiResponse<Reminder>> => {
    return apiClient<Reminder>("/api/v1/reminders", { method: "POST", body: payload });
  },
  update: async (id: string, payload: ReminderUpdatePayload): Promise<ApiResponse<Reminder>> => {
    return apiClient<Reminder>(`/api/v1/reminders/${id}`, { method: "PUT", body: payload });
  },
  remove: async (id: string): Promise<ApiResponse<void>> => {
    return apiClient<void>(`/api/v1/reminders/${id}`, { method: "DELETE" });
  },
};

