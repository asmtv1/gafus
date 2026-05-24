"use client";

import { reportClientError } from "@gafus/error-handling";

import type { PreventionEntryDisplay } from "./types";

interface PreventionEntriesResponse {
  success: boolean;
  data?: PreventionEntryDisplay[];
  error?: string;
}

interface PreventionEntriesByPetsResponse {
  success: boolean;
  data?: Record<string, PreventionEntryDisplay[]>;
  error?: string;
}

export async function getPetPreventionEntries(
  petId: string,
): Promise<PreventionEntriesResponse> {
  try {
    const response = await fetch(`/api/v1/pets/${petId}/prevention`, {
      method: "GET",
      credentials: "include",
      cache: "no-store",
    });

    const payload = (await response.json()) as PreventionEntriesResponse;
    if (!response.ok) {
      return {
        success: false,
        error: payload.error ?? "Не удалось загрузить записи о процедурах",
      };
    }

    return {
      success: true,
      data: payload.data ?? [],
    };
  } catch (error) {
    reportClientError(error, {
      issueKey: "PetPreventionEntriesClient",
      severity: "warning",
      keys: { operation: "get_entries" },
    });
    return {
      success: false,
      error: "Не удалось загрузить записи о процедурах",
    };
  }
}

export async function getPetsPreventionEntries(
  petIds: string[],
): Promise<PreventionEntriesByPetsResponse> {
  try {
    if (petIds.length === 0) {
      return { success: true, data: {} };
    }

    const query = encodeURIComponent(petIds.join(","));
    const response = await fetch(`/api/v1/pets/prevention?petIds=${query}`, {
      method: "GET",
      credentials: "include",
      cache: "no-store",
    });
    const payload = (await response.json()) as PreventionEntriesByPetsResponse;
    if (!response.ok) {
      return {
        success: false,
        error: payload.error ?? "Не удалось загрузить записи о процедурах",
      };
    }

    return {
      success: true,
      data: payload.data ?? {},
    };
  } catch (error) {
    reportClientError(error, {
      issueKey: "PetPreventionEntriesClient",
      severity: "warning",
      keys: { operation: "get_entries_by_pets" },
    });
    return {
      success: false,
      error: "Не удалось загрузить записи о процедурах",
    };
  }
}
