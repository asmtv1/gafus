import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { QuestionPhotoDto } from "@gafus/types";
import { QUESTION_LIMITS } from "@gafus/types";
import { PhotoPicker } from "./parts";

vi.mock("@mui/icons-material", () => ({
  Close: () => <span aria-hidden="true" />,
  AddPhotoAlternateOutlined: () => <span aria-hidden="true" />,
  CheckCircleOutline: () => <span />,
  ChatBubbleOutline: () => <span />,
  VisibilityOutlined: () => <span />,
}));

vi.mock("@/shared/components/ui", () => ({
  SecondaryButton: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}));
vi.mock("./api", () => ({
  uploadQuestionPhoto: vi.fn(),
  discardQuestionPhoto: vi.fn(),
}));

describe("question photo picker", () => {
  it("shows a shared button for attaching photos and an available-slots counter", () => {
    const html = renderToStaticMarkup(
      <PhotoPicker photos={[]} onChange={vi.fn()} onBusy={vi.fn()} />,
    );
    expect(html).toContain("Добавить фото");
    expect(html).toContain(`0 из ${QUESTION_LIMITS.photos} фото`);
    expect(html).toContain('type="file"');
  });

  it("shows uploaded previews and disables further attachments at the photo limit", () => {
    const photos = Array.from({ length: QUESTION_LIMITS.photos }, (_, i) => ({
      id: `photo-${i}`,
      url: `https://example.invalid/image-${i}.jpg`,
    })) as QuestionPhotoDto[];
    const html = renderToStaticMarkup(
      <PhotoPicker photos={photos} onChange={vi.fn()} onBusy={vi.fn()} />,
    );
    expect(html).not.toContain("Добавить фото");
    expect(html).toContain(`${QUESTION_LIMITS.photos} из ${QUESTION_LIMITS.photos} фото`);
    expect((html.match(/title="Убрать фото"/g) ?? []).length).toBe(QUESTION_LIMITS.photos);
  });
});
