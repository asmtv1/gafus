"use server";

import { createWebLogger } from "@gafus/logger";
import { getCoursePathData } from "@gafus/core/services/coursePath";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

import { getCurrentUserId } from "@shared/utils/getCurrentUserId";
import { courseIdSchema } from "@shared/lib/validation/schemas";

const logger = createWebLogger("web-generate-course-path-pdf");

export type GenerateCoursePathPdfResult =
  | { success: true; data: string; fileName: string }
  | { success: false; error: string };

/**
 * Генерирует PDF «Ваш путь» по курсу: титул, даты, записи дневника.
 * Только для авторизованных пользователей с доступом к курсу.
 */
export async function generateCoursePathPdf(
  courseId: string,
): Promise<GenerateCoursePathPdfResult> {
  try {
    const parsed = courseIdSchema.safeParse(courseId);
    if (!parsed.success) {
      return { success: false, error: "Неверный ID курса" };
    }
    const safeCourseId = parsed.data;

    const userId = await getCurrentUserId();
    if (!userId) {
      return { success: false, error: "Необходимо войти в аккаунт" };
    }

    const result = await getCoursePathData(userId, safeCourseId);
    if (!result.success) {
      logger.warn("Course path data failed", { error: result.error, userId, courseId: safeCourseId });
      return { success: false, error: result.error };
    }

    const { data } = result;
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    let currentPage = pdfDoc.addPage([595, 842]);
    let { width, height } = currentPage.getSize();
    let y = height - 60;
    const margin = 50;
    const lineHeight = 18;
    const titleSize = 20;
    const bodySize = 11;

    const drawOnPage = (text: string, opts: { x: number; y: number; size: number; font: typeof font; color?: ReturnType<typeof rgb> }) => {
      currentPage.drawText(text, { ...opts, color: opts.color ?? rgb(0.2, 0.2, 0.2) });
    };

    // Заголовок
    drawOnPage("Ваш путь", {
      x: margin,
      y,
      size: titleSize,
      font: fontBold,
      color: rgb(0.2, 0.2, 0.2),
    });
    y -= lineHeight;

    currentPage.drawText(`— ${data.courseName}`, {
      x: margin,
      y,
      size: 16,
      font: font,
      color: rgb(0.3, 0.3, 0.3),
    });
    y -= lineHeight * 1.5;

    // Даты
    const startedStr = data.startedAt
      ? data.startedAt.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })
      : "—";
    const completedStr = data.completedAt
      ? data.completedAt.toLocaleDateString("ru-RU", {
          day: "numeric",
          month: "long",
          year: "numeric",
        })
      : "—";
    currentPage.drawText(`Начало: ${startedStr}`, {
      x: margin,
      y,
      size: bodySize,
      font: font,
      color: rgb(0.4, 0.4, 0.4),
    });
    y -= lineHeight;
    currentPage.drawText(`Завершение: ${completedStr}`, {
      x: margin,
      y,
      size: bodySize,
      font: font,
      color: rgb(0.4, 0.4, 0.4),
    });
    y -= lineHeight * 1.5;

    // Записи по дням
    for (const entry of data.entries) {
      if (y < 80) {
        currentPage = pdfDoc.addPage([595, 842]);
        width = currentPage.getSize().width;
        height = currentPage.getSize().height;
        y = height - 60;
      }

      const dayTitle = `День ${entry.dayOrder}. ${entry.dayTitle}`;
      currentPage.drawText(dayTitle, {
        x: margin,
        y,
        size: 12,
        font: fontBold,
        color: rgb(0.2, 0.2, 0.2),
      });
      y -= lineHeight;

      const excerpt = entry.contentExcerpt || "(нет записи)";
      const maxWidth = width - margin * 2;
      const words = excerpt.split(/\s+/);
      let line = "";
      const lines: string[] = [];
      for (const word of words) {
        const testLine = line ? `${line} ${word}` : word;
        const textWidth = font.widthOfTextAtSize(testLine, bodySize);
        if (textWidth > maxWidth && line) {
          lines.push(line);
          line = word;
        } else {
          line = testLine;
        }
      }
      if (line) lines.push(line);
      for (const ln of lines) {
        if (y < 60) {
          currentPage = pdfDoc.addPage([595, 842]);
          height = currentPage.getSize().height;
          y = height - 60;
        }
        currentPage.drawText(ln, {
          x: margin,
          y,
          size: bodySize,
          font: font,
          color: rgb(0.25, 0.25, 0.25),
        });
        y -= lineHeight * 0.9;
      }
      y -= lineHeight * 0.5;
    }

    const pdfBytes = await pdfDoc.save();
    const pdfBuffer = Buffer.from(pdfBytes);
    const base64 = pdfBuffer.toString("base64");

    const sanitized = data.courseName
      .replace(/[^a-zA-Zа-яА-Я0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .trim() || "курс";
    const fileName = `Ваш-путь-${sanitized}.pdf`;

    logger.info("PDF generated successfully", { userId, courseId: safeCourseId });
    return { success: true, data: base64, fileName };
  } catch (error) {
    logger.error("PDF generation failed", error as Error, { courseId });
    return {
      success: false,
      error: error instanceof Error ? error.message : "Не удалось сгенерировать PDF",
    };
  }
}
