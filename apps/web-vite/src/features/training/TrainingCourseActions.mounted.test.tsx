// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TrainingIndex } from "./TrainingIndex";
import type { TrainingDaysOverview } from "./trainingDaysApi";
import { ApiError } from "../../shared/api/client";

let host: HTMLDivElement;
let root: Root;
let client: QueryClient;
const copy = vi.fn();
const loadDays = vi.fn<(type: string) => Promise<TrainingDaysOverview>>();
const response: TrainingDaysOverview = {
  courseId: "course_01", courseDescription: "Тренировки для собак",
  courseEquipment: "Поводок", courseTrainingLevel: "BEGINNER",
  requiresPersonalization: false, isPersonalizedCourse: true, days: [],
};

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div"); document.body.append(host);
  root = createRoot(host);
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
  copy.mockReset().mockResolvedValue(undefined);
  loadDays.mockReset().mockResolvedValue(response);
  vi.stubGlobal("navigator", { clipboard: { writeText: copy } });
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("NETWORK_FORBIDDEN"); }));
});

afterEach(async () => {
  await act(async () => root.unmount());
  client.clear(); host.remove(); vi.unstubAllGlobals();
});

async function mount() {
  await act(async () => root.render(<QueryClientProvider client={client}>
    <TrainingIndex userId="owner" courseType="IMPULSE_CONTROL"
      courseName="Самоконтроль" routeMode loadDays={loadDays} />
  </QueryClientProvider>));
  await act(async () => { await vi.waitFor(() => expect(loadDays).toHaveBeenCalledOnce()); });
  await act(async () => { await vi.waitFor(() =>
    expect(host.querySelector(".training-course-overview-next")).not.toBeNull()); });
}

describe("direct /trainings course action geometry and Next share placement", () => {
  it("centers the caramel edit button with the course column; shares only in expanded description", async () => {
    await mount();
    const edit = [...host.querySelectorAll<HTMLButtonElement>("button")]
      .find(x => x.textContent?.includes("Изменить персонализацию"));
    expect(edit?.dataset.gafusSharedButton).toBe("caramel");
    expect(edit?.parentElement?.classList.contains("training-course-personalization-actions--route")).toBe(true);
    expect(host.textContent).not.toContain("Поделиться ссылкой на курс");
    const toggle = host.querySelector<HTMLButtonElement>(".training-next-course-description-toggle");
    expect(toggle?.getAttribute("aria-expanded")).toBe("false");
    await act(async () => toggle?.click());
    expect(toggle?.getAttribute("aria-expanded")).toBe("true");
    const description = host.querySelector(".training-next-course-description-content");
    const share = description?.querySelector<HTMLButtonElement>(".training-course-share-button");
    expect(share?.textContent).toContain("Поделиться ссылкой на курс");
    expect(description?.lastElementChild?.classList.contains("training-course-share-actions")).toBe(true);
    await act(async () => { share?.click(); await Promise.resolve(); });
    expect(copy).toHaveBeenCalledExactlyOnceWith(`${window.location.origin}/trainings/IMPULSE_CONTROL`);
    await act(async () => toggle?.click());
    expect(host.querySelector(".training-course-share-button")).toBeNull();
  });

  it("never shows share or edit on an unauthorized route", async () => {
    loadDays.mockRejectedValueOnce(new ApiError(403, "NO_ACCESS"));
    await act(async () => root.render(<QueryClientProvider client={client}>
      <TrainingIndex userId="owner" courseType="IMPULSE_CONTROL"
        courseName="Самоконтроль" routeMode loadDays={loadDays} />
    </QueryClientProvider>));
    await act(async () => { await vi.waitFor(() => expect(host.textContent).toContain("Нет доступа")); });
    expect(host.querySelector(".training-course-share-button")).toBeNull();
    expect(host.querySelector(".training-course-personalization-button")).toBeNull();
  });
});
